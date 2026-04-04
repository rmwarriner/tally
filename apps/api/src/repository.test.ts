import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "@gnucash-ng/workspace";
import { saveWorkspaceToFile } from "@gnucash-ng/workspace/src/node";
import { ApiError } from "./errors";
import { createFileSystemWorkspaceRepository } from "./repository";

describe("workspace repository security", () => {
  it("rejects unsafe workspace identifiers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gnucash-ng-repo-"));
    const repository = createFileSystemWorkspaceRepository({ rootDirectory: directory });

    await expect(repository.load("../secrets")).rejects.toMatchObject({
      code: "repository.invalid_identifier",
      status: 400,
    });

    await rm(directory, { recursive: true, force: true });
  });

  it("loads safe workspace identifiers from the configured root", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gnucash-ng-repo-"));
    const workspace = createDemoWorkspace();
    await saveWorkspaceToFile(join(directory, `${workspace.id}.json`), workspace);
    const repository = createFileSystemWorkspaceRepository({ rootDirectory: directory });

    const loaded = await repository.load(workspace.id);

    expect(loaded.id).toBe(workspace.id);

    await rm(directory, { recursive: true, force: true });
  });

  it("returns a typed not found error for missing workspaces", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gnucash-ng-repo-"));
    const repository = createFileSystemWorkspaceRepository({ rootDirectory: directory });

    await expect(repository.load("missing-workspace")).rejects.toMatchObject({
      code: "workspace.not_found",
      status: 404,
    });

    await rm(directory, { recursive: true, force: true });
  });
});
