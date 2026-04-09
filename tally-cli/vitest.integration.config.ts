import { defineConfig } from "vitest/config";

// Runs only integration tests — requires a live API at TALLY_API_URL (default: http://localhost:3000)
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/integration/**/*.test.ts"],
    testTimeout: 15000,
  },
});
