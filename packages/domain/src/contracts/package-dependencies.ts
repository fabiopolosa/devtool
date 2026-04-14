export const allowedPackageDependencies = {
  "@cp/domain": [],
  "@cp/config": ["@cp/domain"],
  "@cp/db": ["@cp/domain", "@cp/config"],
  "@cp/auth": ["@cp/domain", "@cp/config"],
  "@cp/providers": ["@cp/domain", "@cp/config"],
  "@cp/memory": ["@cp/domain", "@cp/config", "@cp/providers"],
  "@cp/retrieval": ["@cp/domain", "@cp/config", "@cp/memory", "@cp/providers"],
  "@cp/verifier": ["@cp/domain", "@cp/config"],
  "@cp/orchestration-ruflo": [
    "@cp/domain",
    "@cp/config",
    "@cp/providers",
    "@cp/retrieval",
    "@cp/verifier",
    "@cp/agents"
  ],
  "@cp/autoresearch": ["@cp/domain", "@cp/config", "@cp/retrieval"],
  "@cp/agents": ["@cp/domain", "@cp/config"],
  "@cp/ui-kit": ["@cp/domain"],
  "@cp/skills": ["@cp/domain", "@cp/config"],
  "@cp/subprompts": ["@cp/domain", "@cp/config"],
  "@cp/brainstorming": ["@cp/domain", "@cp/config", "@cp/subprompts", "@cp/skills"],
  "@cp/mcp": ["@cp/domain", "@cp/config", "@cp/secrets"]
} as const;

export type PackageName = keyof typeof allowedPackageDependencies;
