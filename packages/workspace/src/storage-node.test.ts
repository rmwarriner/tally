import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoWorkspace } from "./factory";
import { loadWorkspaceFromFile, saveWorkspaceToFile } from "./storage-node";

const temporaryDirectories: string[] = [];

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "tally-storage-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("workspace file storage", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it("saves and loads migrated workspace documents", async () => {
    const directory = await createTempDirectory();
    const filePath = join(directory, "workspace.json");
    const workspace = createDemoWorkspace();

    await saveWorkspaceToFile(filePath, workspace);
    const loaded = await loadWorkspaceFromFile(filePath);

    expect(loaded).toEqual(workspace);
  });

  it("loads legacy documents through the migration layer", async () => {
    const directory = await createTempDirectory();
    const filePath = join(directory, "legacy.json");
    await writeFile(
      filePath,
      JSON.stringify({
        accounts: [],
        auditEvents: [],
        baseCommodityCode: "USD",
        commodities: [],
        envelopeAllocations: [],
        envelopes: [],
        householdMembers: ["Primary"],
        id: "legacy-workspace",
        name: "Legacy Workspace",
        reconciliationSessions: [],
        scheduledTransactions: [],
        transactions: [],
      }),
      "utf8",
    );

    const loaded = await loadWorkspaceFromFile(filePath);

    expect(loaded.importBatches).toEqual([]);
    expect(loaded.closePeriods).toEqual([]);
    expect(loaded.baselineBudgetLines).toEqual([]);
  });

  it("propagates file save and load failures", async () => {
    const directory = await createTempDirectory();
    const missingParentPath = join(directory, "missing", "workspace.json");

    await expect(saveWorkspaceToFile(missingParentPath, createDemoWorkspace())).rejects.toBeInstanceOf(Error);

    const unreadablePath = join(directory, "broken.json");
    await mkdir(unreadablePath, { recursive: true });

    await expect(loadWorkspaceFromFile(unreadablePath)).rejects.toBeInstanceOf(Error);
  });
});
