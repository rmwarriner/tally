import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: "list",
  testDir: "./apps/web/e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "GNUCASH_NG_API_RUNTIME_MODE=development pnpm --filter @gnucash-ng/api start",
      reuseExistingServer: true,
      timeout: 120_000,
      url: "http://127.0.0.1:4000/healthz",
    },
    {
      command: "pnpm --filter @gnucash-ng/web dev --host 127.0.0.1 --port 4173",
      reuseExistingServer: true,
      timeout: 120_000,
      url: "http://127.0.0.1:4173",
    },
  ],
});
