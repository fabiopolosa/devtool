import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const currentDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@cp/worker-local": resolve(currentDir, "../worker-local/index.ts")
    }
  },
  test: {
    environment: "node"
  }
});
