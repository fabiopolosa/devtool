import type { AgentRoleName, ContextPacket } from "@cp/domain";
import type { RetrievalQuery, RetrievedChunk, ContextPacketBuilder } from "@cp/domain";
import { estimateTokens, normalizeText, truncate, uniqueBy } from "../utils/text.js";
import { newId } from "../utils/ids.js";

const roleCategoryPriorities: Record<AgentRoleName, string[]> = {
  planner: ["project_overview", "architecture_note", "adr", "roadmap_note", "prompt_policy_note"],
  codex_builder: ["task_summary", "repo_local_instruction", "coding_standard", "architecture_note", "adr"],
  codex_refactor: ["coding_standard", "architecture_note", "repo_local_instruction", "adr", "task_summary"],
  claude_debugger: ["error_report", "run_summary", "task_summary", "architecture_note", "adr"],
  gemini_researcher: ["research_note", "adr", "architecture_note", "prompt_policy_note", "roadmap_note"],
  image_designer: ["project_overview", "prompt_policy_note", "research_note", "architecture_note", "task_summary"],
  image_editor: ["project_overview", "prompt_policy_note", "research_note", "task_summary", "architecture_note"],
  verifier: ["task_summary", "verification_log", "run_summary", "architecture_note", "coding_standard"]
};

const summarizeChunk = (role: AgentRoleName, chunk: RetrievedChunk): string => {
  const label = chunk.chunkTitle.trim();
  const preferredMaxChars = role === "claude_debugger" ? 260 : role === "planner" ? 220 : 200;
  const text = truncate(normalizeText(chunk.chunkText), preferredMaxChars);
  return `${label}: ${text}`;
};

const compactSummaryForRole = (role: AgentRoleName, chunks: RetrievedChunk[]): string => {
  const sections = chunks.map((chunk) => summarizeChunk(role, chunk));
  if (sections.length === 0) {
    return `No relevant memory retrieved for ${role}.`;
  }
  const header = {
    planner: "Planner context",
    codex_builder: "Builder context",
    codex_refactor: "Refactor context",
    claude_debugger: "Debugger context",
    gemini_researcher: "Research context",
    image_designer: "Image design context",
    image_editor: "Image editing context",
    verifier: "Verification context"
  }[role];
  return `${header}: ${sections.join(" | ")}`;
};

const summarizeSkillInstruction = (name: string, instructions: string): string =>
  `${name}: ${truncate(normalizeText(instructions), 180)}`;

export class DefaultContextPacketBuilder implements ContextPacketBuilder {
  async build(role: AgentRoleName, query: RetrievalQuery, chunks: RetrievedChunk[]): Promise<ContextPacket> {
    const ordered = this.orderForRole(role, chunks);
    const packetChunks = ordered.map((chunk) => ({
      chunkId: chunk.chunkId,
      memoryEntryId: chunk.memoryEntryId,
      title: chunk.chunkTitle,
      summary: summarizeChunk(role, chunk),
      category: chunk.category,
      sourceRef: chunk.sourceRef,
      confidence: this.scoreToConfidence(chunk.score),
      tokenEstimate: chunk.tokenEstimate
    }));
    const sourceChunkIds = uniqueBy(ordered, (chunk) => chunk.chunkId).map((chunk) => chunk.chunkId);
    const skillInstructions = (query.skillInstructions ?? []).map((skill) => ({
      name: skill.name,
      instructions: summarizeSkillInstruction(skill.name, skill.instructions),
      ...(skill.repositoryUrl ? { repositoryUrl: skill.repositoryUrl } : {}),
      tokenEstimate: estimateTokens(skill.instructions)
    }));
    const tokenBudgetUsed =
      packetChunks.reduce((sum, chunk) => sum + chunk.tokenEstimate, 0) +
      skillInstructions.reduce((sum, skill) => sum + skill.tokenEstimate, 0) +
      estimateTokens(query.query);
    const skillSummary =
      skillInstructions.length > 0
        ? ` | Skills: ${skillInstructions.map((skill) => skill.instructions).join(" | ")}`
        : "";

    return {
      packetId: newId(),
      projectId: query.filters.projectId,
      taskId: query.filters.taskId,
      role,
      query: query.query,
      chunks: packetChunks,
      skillInstructions,
      compactSummary: `${compactSummaryForRole(role, ordered)}${skillSummary}`,
      sourceChunkIds,
      tokenBudgetUsed,
      generatedAt: new Date().toISOString()
    };
  }

  private orderForRole(role: AgentRoleName, chunks: RetrievedChunk[]): RetrievedChunk[] {
    const priorities = roleCategoryPriorities[role];
    return [...chunks].sort((left, right) => {
      const leftPriority = this.priorityIndex(priorities, left.category);
      const rightPriority = this.priorityIndex(priorities, right.category);
      return leftPriority - rightPriority || right.score - left.score || right.tokenEstimate - left.tokenEstimate;
    });
  }

  private priorityIndex(priorities: string[], category: string): number {
    const index = priorities.indexOf(category);
    return index === -1 ? priorities.length : index;
  }

  private scoreToConfidence(score: number): number {
    if (!Number.isFinite(score)) return 0;
    return Math.max(0, Math.min(1, (score + 1) / 2));
  }
}
