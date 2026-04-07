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
        "apps/api/src/**/*.ts",
        "packages/domain/src/**/*.ts",
        "packages/logging/src/**/*.ts",
        "packages/workspace/src/**/*.ts",
      ],
    },
    environment: "node",
    include: [
      "apps/**/*.test.ts",
      "packages/**/*.test.ts",
    ],
  },
});
