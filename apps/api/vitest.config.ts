import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@cp/domain": path.resolve(__dirname, "../../packages/domain/src/index.ts"),
      "@cp/config": path.resolve(__dirname, "../../packages/config/src/index.ts"),
      "@cp/db": path.resolve(__dirname, "../../packages/db/src/index.ts"),
      "@cp/auth": path.resolve(__dirname, "../../packages/auth/src/index.ts"),
      "@cp/agents": path.resolve(__dirname, "../../packages/agents/src/index.ts"),
      "@cp/skills": path.resolve(__dirname, "../../packages/skills/src/index.ts")
    }
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    fileParallelism: false
  }
});
