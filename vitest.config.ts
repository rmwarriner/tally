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
      reporter: ["text", "html"],
      include: [
        "apps/api/src/**/*.ts",
        "packages/domain/src/**/*.ts",
        "packages/logging/src/**/*.ts",
        "packages/book/src/**/*.ts",
      ],
    },
    environment: "node",
    include: [
      "apps/**/*.test.ts",
      "packages/**/*.test.ts",
    ],
  },
});
