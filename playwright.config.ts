import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: "list",
  testDir: "./tally-portal/apps/web/e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "TALLY_API_RUNTIME_MODE=development pnpm --filter @tally-core/api start",
      reuseExistingServer: true,
      timeout: 120_000,
      url: "http://127.0.0.1:4000/healthz",
    },
    {
      command: "pnpm --filter @tally-portal/web dev --host 127.0.0.1 --port 4173",
      reuseExistingServer: true,
      timeout: 120_000,
      url: "http://127.0.0.1:4173",
    },
  ],
});
