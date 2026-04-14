import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@cp/domain": path.resolve(__dirname, "../domain/src/index.ts")
    }
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    testTimeout: 60_000
  }
});
