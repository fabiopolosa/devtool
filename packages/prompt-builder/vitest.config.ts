import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@cp/domain": path.resolve(__dirname, "../domain/src/index.ts"),
      "@cp/subprompts": path.resolve(__dirname, "../subprompts/src/index.ts")
    }
  }
});
