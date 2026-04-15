import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@cp/domain": path.resolve(dirname, "../domain/src/index.ts"),
      "@cp/prompt-builder": path.resolve(dirname, "../prompt-builder/src/index.ts"),
      "@cp/providers": path.resolve(dirname, "../providers/src/index.ts"),
      "@cp/subprompts": path.resolve(dirname, "../subprompts/src/index.ts")
    }
  },
  test: {
    environment: "node"
  }
});
