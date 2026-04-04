import { createApiRuntimeConfig } from "./config";
import { ensureDemoWorkspaceFile } from "./dev-seed";

const config = createApiRuntimeConfig(process.env);

await ensureDemoWorkspaceFile({
  dataDirectory: config.dataDirectory,
});

await import("./server");
