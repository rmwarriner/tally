import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createNoopLogger, type Logger } from "@tally-core/logging";
import { createDemoWorkspace } from "@tally-core/workspace";
import { saveWorkspaceToFile } from "@tally-core/workspace/src/node";

export async function ensureDemoWorkspaceFile(params: {
  dataDirectory: string;
  logger?: Logger;
}): Promise<void> {
  const logger = (params.logger ?? createNoopLogger()).child({
    component: "demoWorkspaceSeed",
    dataDirectory: params.dataDirectory,
  });
  const workspace = createDemoWorkspace();
  const workspacePath = join(params.dataDirectory, `${workspace.id}.json`);

  try {
    await access(workspacePath);
    return;
  } catch {
    await mkdir(params.dataDirectory, { recursive: true });
    await saveWorkspaceToFile(workspacePath, workspace, { logger });
    logger.info("seeded demo workspace", {
      workspaceId: workspace.id,
      workspacePath,
    });
  }
}
