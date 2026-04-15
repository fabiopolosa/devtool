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

const summarizeRuntimeConfig = (runtimeConfig: Record<string, unknown>): string => {
  const entries = Object.entries(runtimeConfig).slice(0, 6);
  if (entries.length === 0) {
    return "No runtime overrides.";
  }
  const parts = entries.map(([key, value]) => {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return `${key}=${String(value)}`;
    }
    return `${key}=[complex]`;
  });
  return `Runtime: ${parts.join(", ")}`;
};

const summarizeSecretReference = (name: string, scope: string, description?: string): string => {
  const detail = description ? ` (${truncate(normalizeText(description), 80)})` : "";
  return `${scope}:${name}${detail}`;
};

const summarizeEnvironmentContext = (environment: NonNullable<RetrievalQuery["environmentContext"]>): string => {
  const machineSummary = environment.machines
    .slice(0, 4)
    .map(
      (machine) =>
        `${machine.name}[${machine.status}] cpu:${machine.cpuCores} gpu:${machine.gpuCount} ram:${machine.ramGb}`
    )
    .join("; ");
  return `${environment.name} (${environment.status})${machineSummary ? ` | ${machineSummary}` : ""}`;
};

const summarizeVersionSnapshot = (
  snapshot: NonNullable<RetrievalQuery["versionSnapshots"]>[number]
): string => `${snapshot.label} (${snapshot.trigger})`;

const summarizeContextNote = (note: NonNullable<RetrievalQuery["contextNotes"]>[number]): string =>
  `${note.title}: ${truncate(normalizeText(note.excerpt), 180)}`;

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
    const mergedSkillInstructions = uniqueBy(
      [...(query.skillInstructions ?? []), ...(query.agentContext?.skillInstructions ?? [])],
      (skill) => `${skill.name.trim().toLowerCase()}::${skill.repositoryUrl ?? ""}`
    );
    const skillInstructions = mergedSkillInstructions.map((skill) => ({
      name: skill.name,
      instructions: summarizeSkillInstruction(skill.name, skill.instructions),
      ...(skill.repositoryUrl ? { repositoryUrl: skill.repositoryUrl } : {}),
      tokenEstimate: estimateTokens(skill.instructions)
    }));
    const runtimeSummary = query.agentContext
      ? summarizeRuntimeConfig(query.agentContext.runtimeConfig)
      : undefined;
    const secretReferences = (query.secretReferences ?? []).map((secret) => ({
      name: secret.name,
      scope: secret.scope,
      ...(secret.description ? { description: secret.description } : {})
    }));
    const environmentContext = query.environmentContext
      ? {
          environmentId: query.environmentContext.environmentId,
          name: query.environmentContext.name,
          status: query.environmentContext.status,
          machines: query.environmentContext.machines.map((machine) => ({
            machineId: machine.machineId,
            name: machine.name,
            status: machine.status,
            cpuCores: machine.cpuCores,
            gpuCount: machine.gpuCount,
            ramGb: machine.ramGb,
            agents: [...machine.agents],
            services: [...machine.services]
          }))
        }
      : undefined;
    const versionSnapshots = (query.versionSnapshots ?? []).map((snapshot) => ({
      snapshotId: snapshot.snapshotId,
      label: snapshot.label,
      trigger: snapshot.trigger,
      localRepositoryId: snapshot.localRepositoryId,
      ...(snapshot.taskId ? { taskId: snapshot.taskId } : {})
    }));
    const contextNotes = uniqueBy(
      query.contextNotes ?? [],
      (note) => `${note.noteId}:${note.path}:${note.title}`
    ).map((note) => ({
      noteId: note.noteId,
      path: note.path,
      title: note.title,
      scope: note.scope,
      excerpt: note.excerpt,
      score: note.score,
      ...(note.sourceType ? { sourceType: note.sourceType } : {})
    }));
    const secretSummary =
      secretReferences.length > 0
        ? ` | Secrets: ${secretReferences
            .map((secret) => summarizeSecretReference(secret.name, secret.scope, secret.description))
            .join(", ")}`
        : "";
    const environmentSummary = environmentContext
      ? ` | Environment: ${summarizeEnvironmentContext(environmentContext)}`
      : "";
    const snapshotSummary =
      versionSnapshots.length > 0
        ? ` | Snapshots: ${versionSnapshots.map((snapshot) => summarizeVersionSnapshot(snapshot)).join(", ")}`
        : "";
    const contextNoteSummary =
      contextNotes.length > 0
        ? ` | Context notes: ${contextNotes.map((note) => summarizeContextNote(note)).join(" | ")}`
        : "";
    const tokenBudgetUsed =
      packetChunks.reduce((sum, chunk) => sum + chunk.tokenEstimate, 0) +
      skillInstructions.reduce((sum, skill) => sum + skill.tokenEstimate, 0) +
      secretReferences.reduce(
        (sum, secret) => sum + estimateTokens(`${secret.scope}:${secret.name}${secret.description ?? ""}`),
        0
      ) +
      versionSnapshots.reduce((sum, snapshot) => sum + estimateTokens(summarizeVersionSnapshot(snapshot)), 0) +
      contextNotes.reduce((sum, note) => sum + estimateTokens(summarizeContextNote(note)), 0) +
      (environmentContext ? estimateTokens(summarizeEnvironmentContext(environmentContext)) : 0) +
      (runtimeSummary ? estimateTokens(runtimeSummary) : 0) +
      estimateTokens(query.query);
    const skillSummary =
      skillInstructions.length > 0
        ? ` | Skills: ${skillInstructions.map((skill) => skill.instructions).join(" | ")}`
        : "";
    const agentSummary = query.agentContext
      ? ` | Agent: ${query.agentContext.agentName} (${query.agentContext.role}) ${runtimeSummary}`
      : "";

    return {
      packetId: newId(),
      projectId: query.filters.projectId,
      taskId: query.filters.taskId,
      role,
      query: query.query,
      chunks: packetChunks,
      skillInstructions,
      ...(query.agentContext
        ? {
            agentContext: {
              agentId: query.agentContext.agentId,
              agentName: query.agentContext.agentName,
              role: query.agentContext.role,
              runtimeConfig: { ...query.agentContext.runtimeConfig },
              runtimeSummary: runtimeSummary ?? "No runtime overrides.",
              desiredSkills: mergedSkillInstructions.map((skill) => skill.name)
            }
          }
        : {}),
      secretReferences,
      ...(environmentContext ? { environmentContext } : {}),
      versionSnapshots,
      contextNotes,
      compactSummary: `${compactSummaryForRole(role, ordered)}${skillSummary}${agentSummary}${secretSummary}${environmentSummary}${snapshotSummary}${contextNoteSummary}`,
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
