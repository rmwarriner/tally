import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
      provider: "v8",
      reporter: ["text", "html", "json", "json-summary"],
      include: [
        "apps/api/src/**/*.ts",
        "packages/domain/src/**/*.ts",
        "packages/logging/src/**/*.ts",
        "packages/book/src/**/*.ts",
      ],
      exclude: [
        "apps/api/src/dev-server.ts",
        "apps/api/src/server.ts",
        "apps/api/src/persistence-admin-cli.ts",
        "apps/api/src/persistence-json.ts",
        "apps/api/src/persistence-postgres.ts",
        "apps/api/src/persistence-sqlite.ts",
        "apps/api/src/persistence-validation.ts",
        "apps/api/src/types.ts",
        "packages/book/src/types.ts",
        "packages/domain/src/types.ts",
      ],
    },
    environment: "node",
    include: [
      "apps/**/*.test.ts",
      "packages/**/*.test.ts",
    ],
  },
});
