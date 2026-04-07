import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { cpus } from "node:os";
import { join } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDemoWorkspace } from "@tally-core/workspace/src/factory";
import { loadWorkspaceFromFile, saveWorkspaceToFile } from "@tally-core/workspace/src/storage-node";
import {
  createFileSystemWorkspaceRepository,
  createHttpHandler,
  createWorkspaceService,
} from "../tally-core/apps/api/src/index.ts";

interface ApiLatencySummary {
  endpoint: string;
  method: string;
  p50Ms: number;
  p95Ms: number;
  samples: number;
  warmup: number;
}

interface WorkspaceTimingSummary {
  dataset: "small" | "medium" | "large";
  sizeTransactions: number;
  loadMedianMs: number;
  loadP95Ms: number;
  saveMedianMs: number;
  saveP95Ms: number;
  iterations: number;
}

const repoRootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function percentile(samples: number[], p: number): number {
  if (samples.length === 0) {
    return 0;
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function roundMs(value: number): number {
  return Number(value.toFixed(2));
}

function median(samples: number[]): number {
  return percentile(samples, 50);
}

function duplicateWorkspaceTransactions(transactionCount: number) {
  const base = createDemoWorkspace();
  const baseTransactions = base.transactions.length > 0 ? base.transactions : [];
  const generated = [];

  for (let index = 0; index < transactionCount; index += 1) {
    const template = baseTransactions[index % baseTransactions.length]!;
    generated.push({
      ...template,
      description: `${template.description} #${index + 1}`,
      id: `txn-baseline-${index + 1}`,
      occurredOn: `2026-04-${String((index % 28) + 1).padStart(2, "0")}`,
      postings: template.postings.map((posting, postingIndex) => ({
        ...posting,
        memo: posting.memo ? `${posting.memo} #${index + 1}-${postingIndex + 1}` : undefined,
      })),
    });
  }

  return {
    ...base,
    auditEvents: [],
    id: `baseline-${transactionCount}`,
    transactions: generated,
  };
}

async function timeRequest(requestFactory: () => Request, handler: (request: Request) => Promise<Response>): Promise<number> {
  const start = performance.now();
  const response = await handler(requestFactory());
  if (!response.ok && response.status !== 201) {
    throw new Error(`Unexpected status code: ${response.status}`);
  }
  return performance.now() - start;
}

async function runApiLatencyBaseline(rootDirectory: string): Promise<ApiLatencySummary[]> {
  const workspace = duplicateWorkspaceTransactions(1000);
  const workspacePath = join(rootDirectory, `${workspace.id}.json`);
  await saveWorkspaceToFile(workspacePath, workspace);

  const service = createWorkspaceService({
    repository: createFileSystemWorkspaceRepository({ rootDirectory }),
  });
  const handlerWithWideLimits = createHttpHandler({
    rateLimitPolicy: {
      import: { keyPrefix: "import", limit: 10000, windowMs: 60000 },
      mutation: { keyPrefix: "mutation", limit: 10000, windowMs: 60000 },
      read: { keyPrefix: "read", limit: 10000, windowMs: 60000 },
    },
    service,
  });

  const warmup = 5;
  const samples = 30;
  const readSamples: number[] = [];
  const writeSamples: number[] = [];

  const makeReadRequest = () => new Request(`http://localhost-core/api-core/workspaces/${workspace.id}`);
  const makeWriteRequest = (txnId: string) =>
    new Request(`http://localhost-core/api-core/workspaces/${workspace.id}/transactions`, {
      body: JSON.stringify({
        actor: "Primary",
        transaction: {
          description: `Metrics baseline transaction ${txnId}`,
          id: txnId,
          occurredOn: "2026-04-07",
          postings: [
            {
              accountId: "acct-expense-utilities",
              amount: { commodityCode: "USD", quantity: 12.34 },
            },
            {
              accountId: "acct-checking",
              amount: { commodityCode: "USD", quantity: -12.34 },
              cleared: true,
            },
          ],
        },
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

  for (let index = 0; index < warmup; index += 1) {
    await timeRequest(makeReadRequest, handlerWithWideLimits);
    await timeRequest(() => makeWriteRequest(`txn-baseline-warmup-${index + 1}`), handlerWithWideLimits);
  }

  for (let index = 0; index < samples; index += 1) {
    readSamples.push(await timeRequest(makeReadRequest, handlerWithWideLimits));
    writeSamples.push(
      await timeRequest(() => makeWriteRequest(`txn-baseline-sample-${index + 1}`), handlerWithWideLimits),
    );
  }

  return [
    {
      endpoint: "-core/api-core/workspaces/:workspaceId",
      method: "GET",
      p50Ms: roundMs(median(readSamples)),
      p95Ms: roundMs(percentile(readSamples, 95)),
      samples,
      warmup,
    },
    {
      endpoint: "-core/api-core/workspaces/:workspaceId/transactions",
      method: "POST",
      p50Ms: roundMs(median(writeSamples)),
      p95Ms: roundMs(percentile(writeSamples, 95)),
      samples,
      warmup,
    },
  ];
}

async function runWorkspaceLoadSaveBaseline(rootDirectory: string): Promise<WorkspaceTimingSummary[]> {
  const datasetSizes = [
    { name: "small" as const, transactions: 1000 },
    { name: "medium" as const, transactions: 10000 },
    { name: "large" as const, transactions: 50000 },
  ];
  const iterations = 10;
  const results: WorkspaceTimingSummary[] = [];

  for (const dataset of datasetSizes) {
    const workspace = duplicateWorkspaceTransactions(dataset.transactions);
    const workspacePath = join(rootDirectory, `${workspace.id}.json`);

    const saveSamples: number[] = [];
    const loadSamples: number[] = [];

    for (let index = 0; index < iterations; index += 1) {
      const saveStart = performance.now();
      await saveWorkspaceToFile(workspacePath, workspace);
      saveSamples.push(performance.now() - saveStart);

      const loadStart = performance.now();
      await loadWorkspaceFromFile(workspacePath);
      loadSamples.push(performance.now() - loadStart);
    }

    results.push({
      dataset: dataset.name,
      sizeTransactions: dataset.transactions,
      loadMedianMs: roundMs(median(loadSamples)),
      loadP95Ms: roundMs(percentile(loadSamples, 95)),
      saveMedianMs: roundMs(median(saveSamples)),
      saveP95Ms: roundMs(percentile(saveSamples, 95)),
      iterations,
    });
  }

  return results;
}

async function runTestRuntimeBaseline(): Promise<{ runs: number; medianMs: number; samplesMs: number[] }> {
  const runs = 3;
  const samplesMs: number[] = [];

  for (let index = 0; index < runs; index += 1) {
    const start = performance.now();
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn("pnpm", ["test"], {
        cwd: repoRootDirectory,
        shell: false,
        stdio: "inherit",
      });

      child.on("error", reject);
      child.on("close", (code) => resolve(code ?? 1));
    });

    if (exitCode !== 0) {
      throw new Error(`pnpm test failed during runtime baseline run ${index + 1}`);
    }
    samplesMs.push(performance.now() - start);
  }

  return {
    runs,
    medianMs: roundMs(median(samplesMs)),
    samplesMs: samplesMs.map(roundMs),
  };
}

async function main(): Promise<void> {
  const tempDirectory = await mkdtemp(join(tmpdir(), "tally-baseline-"));
  const startedAt = new Date().toISOString();

  try {
    const apiLatency = await runApiLatencyBaseline(tempDirectory);
    const workspaceTimings = await runWorkspaceLoadSaveBaseline(tempDirectory);
    const testRuntime = await runTestRuntimeBaseline();

    const output = {
      capturedAt: startedAt,
      environment: {
        cpuModel: cpus()[0]?.model ?? "unknown",
        cpuThreads: cpus().length,
        nodeVersion: process.version,
        pnpmVersion: process.env.npm_config_user_agent ?? "unknown",
        platform: process.platform,
      },
      protocol: {
        apiLatency: { samples: 30, warmup: 5 },
        workspaceLoadSave: { iterations: 10 },
        testRuntime: { runs: 3 },
      },
      results: {
        apiLatency,
        testRuntime,
        workspaceLoadSave: workspaceTimings,
      },
      thresholds: {
        apiP95RegressionPercent: 10,
        testRuntimeMedianRegressionPercent: 15,
        workspaceLoadSaveP95RegressionPercent: 10,
      },
    };

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await rm(tempDirectory, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
