import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { ensureDemoWorkspaceFile } from "./dev-seed";

describe("demo workspace seeding", () => {
  it("creates the demo workspace file when it is missing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gnucash-ng-seed-"));

    await ensureDemoWorkspaceFile({ dataDirectory: directory });

    const workspacePath = join(directory, "workspace-household-demo.json");
    const contents = JSON.parse(await readFile(workspacePath, "utf8")) as { id: string; name: string };

    expect(contents).toMatchObject({
      id: "workspace-household-demo",
      name: "Household Finance",
    });

    await rm(directory, { recursive: true, force: true });
  });

  it("does not overwrite an existing workspace file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gnucash-ng-seed-"));
    const workspacePath = join(directory, "workspace-household-demo.json");

    await ensureDemoWorkspaceFile({ dataDirectory: directory });
    const original = await readFile(workspacePath, "utf8");

    await ensureDemoWorkspaceFile({ dataDirectory: directory });
    const afterSecondSeed = await readFile(workspacePath, "utf8");

    expect(afterSecondSeed).toBe(original);
    await access(workspacePath);

    await rm(directory, { recursive: true, force: true });
  });
});
