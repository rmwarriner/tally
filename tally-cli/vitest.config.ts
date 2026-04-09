import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["src/integration/**"],
    include: ["src/lib/**/*.test.ts", "src/commands/**/*.test.ts"],
  },
});
