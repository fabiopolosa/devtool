import type { MemoryCategory } from "@cp/domain";
import type { ChunkingPolicy } from "@cp/domain";

export const defaultChunkingPolicy: ChunkingPolicy = {
  targetTokens: 700,
  maxTokens: 900,
  overlapTokens: 100,
  splitByHeadings: true
};

export const policyForCategory = (category: MemoryCategory): ChunkingPolicy => {
  switch (category) {
    case "adr":
    case "architecture_note":
    case "project_overview":
      return { targetTokens: 750, maxTokens: 950, overlapTokens: 120, splitByHeadings: true };
    case "task_summary":
    case "roadmap_note":
      return { targetTokens: 600, maxTokens: 800, overlapTokens: 80, splitByHeadings: true };
    case "error_report":
      return { targetTokens: 500, maxTokens: 700, overlapTokens: 40, splitByHeadings: false };
    case "coding_standard":
    case "repo_local_instruction":
    case "prompt_policy_note":
      return { targetTokens: 450, maxTokens: 650, overlapTokens: 60, splitByHeadings: true };
    case "research_note":
    case "run_summary":
      return { targetTokens: 550, maxTokens: 750, overlapTokens: 80, splitByHeadings: true };
    default:
      return defaultChunkingPolicy;
  }
};
