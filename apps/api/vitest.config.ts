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
      "@cp/brainstorming": path.resolve(__dirname, "../../packages/brainstorming/src/index.ts"),
      "@cp/skills": path.resolve(__dirname, "../../packages/skills/src/index.ts"),
      "@cp/secrets": path.resolve(__dirname, "../../packages/secrets/src/index.ts"),
      "@cp/schema-docs": path.resolve(__dirname, "../../packages/schema-docs/src/index.ts"),
      "@cp/environments": path.resolve(__dirname, "../../packages/environments/src/index.ts"),
      "@cp/local-repos": path.resolve(__dirname, "../../packages/local-repos/src/index.ts"),
      "@cp/versioning": path.resolve(__dirname, "../../packages/versioning/src/index.ts"),
      "@cp/mcp": path.resolve(__dirname, "../../packages/mcp/src/index.ts"),
      "@cp/knowledge": path.resolve(__dirname, "../../packages/knowledge/src/index.ts"),
      "@cp/context": path.resolve(__dirname, "../../packages/context/src/index.ts"),
      "@cp/providers": path.resolve(__dirname, "../../packages/providers/src/index.ts"),
      "@cp/subprompts": path.resolve(__dirname, "../../packages/subprompts/src/index.ts"),
      "@cp/prompt-builder": path.resolve(__dirname, "../../packages/prompt-builder/src/index.ts")
    }
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    fileParallelism: false
  }
});
