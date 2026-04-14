import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true
  },
  resolve: {
    alias: {
      "@cp/domain": path.resolve(__dirname, "../domain/src/index.ts"),
      "@cp/config": path.resolve(__dirname, "../config/src/index.ts")
    }
  }
});
