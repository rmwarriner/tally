import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        branches: 75,
        functions: 85,
        lines: 70,
        statements: 70,
      },
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "tally-core/apps/api/src/**/*.ts",
        "tally-core/packages/domain/src/**/*.ts",
        "tally-core/packages/logging/src/**/*.ts",
        "tally-core/packages/workspace/src/**/*.ts",
      ],
    },
    environment: "node",
    include: [
      "tally-core/**/*.test.ts",
      "tally-portal/**/*.test.ts",
      "tally-go/**/*.test.ts",
    ],
  },
});
