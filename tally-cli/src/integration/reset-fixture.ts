import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

export const FIXTURE_BOOK_ID = "workspace-cli-integration";
export const FIXTURE_DEBIT_ACCOUNT_ID = "acct-expense-groceries";
export const FIXTURE_CREDIT_ACCOUNT_ID = "acct-checking";

function repoRoot(): string {
  return resolve(import.meta.dirname, "../../..");
}

function resolveApiDataDirectory(): string {
  const configured = process.env.TALLY_DATA_DIR;
  if (!configured) {
    return join(repoRoot(), "apps/api/data");
  }

  if (isAbsolute(configured)) {
    return configured;
  }

  // API runtime resolves relative data dir from apps/api working directory.
  return resolve(join(repoRoot(), "apps/api"), configured);
}

function removeEphemeralRegressionBooks(dataDirectory: string): void {
  if (!existsSync(dataDirectory)) {
    return;
  }

  const ephemeralPatterns = [
    /^regression(?:-json)?-\d+\.json$/,
    /^cli-integration-\d+\.json$/,
  ];

  for (const fileName of readdirSync(dataDirectory)) {
    if (ephemeralPatterns.some((pattern) => pattern.test(fileName))) {
      unlinkSync(join(dataDirectory, fileName));
    }
  }
}

export function resetIntegrationFixture(): void {
  const root = repoRoot();
  const sourceTemplatePath = join(root, "apps/api/data/workspace-household-demo.json");
  const dataDirectory = resolveApiDataDirectory();

  if (!existsSync(sourceTemplatePath)) {
    throw new Error(`Missing fixture template: ${sourceTemplatePath}`);
  }

  const template = JSON.parse(readFileSync(sourceTemplatePath, "utf8")) as Record<string, unknown>;
  const fixture = {
    ...template,
    id: FIXTURE_BOOK_ID,
    name: "CLI Integration Fixture",
    version: 1,
    householdMembers: ["Primary", "Partner", "api-user"],
    householdMemberRoles: {
      Partner: "member",
      Primary: "guardian",
      "api-user": "admin",
    },
    auditEvents: [],
  };

  mkdirSync(dataDirectory, { recursive: true });
  removeEphemeralRegressionBooks(dataDirectory);
  const targetPath = join(dataDirectory, `${FIXTURE_BOOK_ID}.json`);
  writeFileSync(targetPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
}
