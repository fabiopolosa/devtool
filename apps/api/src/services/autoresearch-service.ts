import { randomUUID } from "node:crypto";
import type {
  AutoResearchExperiment,
  AutoResearchRun,
  ChatReasoningProvider,
  ProviderName,
  PromptRegistryEntry
} from "@cp/domain";
import { createDefaultProviderRegistry } from "@cp/providers";
import { apiStore } from "./api-store.js";
import { buildCompactKnowledgeContext } from "./knowledge-service.js";
import { promptRegistryService } from "./prompt-registry-service.js";
import {
  resolveProviderModelSelection,
  type ProviderResolutionSource
} from "./provider-config-service.js";

const nowIso = (): string => new Date().toISOString();
const scoreEpsilon = 1e-9;

interface PromptMetadata {
  source: "registry";
  scope: PromptRegistryEntry["scope"];
  type: PromptRegistryEntry["type"];
  target: string;
  version: string;
  promptId: string;
}

interface ResolvedPrompt {
  prompt: string;
  metadata: PromptMetadata;
}

interface MetricDefinition {
  name: string;
  direction: "higher_better" | "lower_better";
  weight: number;
}

interface SelectionOutcome {
  winnerVariantId: string | null;
  winnerScore: number | null;
  orderedVariants: Array<{
    variantId: string;
    score: number;
    metrics: Record<string, number>;
  }>;
  regressionSignals: string[];
  rollbackSuggested: boolean;
  rollbackReason?: string;
}

interface ProviderStepUsage {
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  step: string;
  resolutionSource?: ProviderResolutionSource;
  requestedModel?: string;
}

interface ResearchSource {
  id: string;
  title: string;
  path: string;
  scope: "system" | "tenant" | "project" | "context-notes";
  sourceType: "knowledge-node" | "context-note";
  excerpt: string;
  baseScore: number;
}

interface ScoredEvidence {
  sourceId: string;
  title: string;
  path: string;
  score: number;
  relevance: number;
  confidence: number;
  rationale: string;
}

export interface VariantResearchReport {
  variantId: string;
  query: string;
  plannedQueries: string[];
  planningRationale: string;
  promptMetadata: PromptMetadata;
  sources: ResearchSource[];
  scoredEvidence: ScoredEvidence[];
  summary: string;
  confidence: number;
  rationale: string;
  elapsedMs: number;
  usage: RunnerUsageSummary;
}

export interface RunnerUsageSummary {
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  metadata?: Record<string, unknown>;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const lowerIsBetterMetric = (metricName: string): boolean =>
  /(time|latency|duration|cost|token|error|failure|retry)/i.test(metricName);

const normalizeMetricSet = (metricSet: string[]): MetricDefinition[] => {
  const unique = [...new Set(metricSet.map((item) => item.trim()).filter((item) => item.length > 0))];
  if (unique.length === 0) {
    return [
      { name: "evidence_quality", direction: "higher_better", weight: 1 },
      { name: "summary_confidence", direction: "higher_better", weight: 1 },
      { name: "avg_time_to_verification", direction: "lower_better", weight: 1 }
    ];
  }
  return unique.map((name) => ({
    name,
    direction: lowerIsBetterMetric(name) ? "lower_better" : "higher_better",
    weight: 1
  }));
};

const scoreVariant = (metricSet: MetricDefinition[], metrics: Record<string, number>): number =>
  metricSet.reduce((score, metric) => {
    const value = metrics[metric.name];
    if (typeof value !== "number" || Number.isNaN(value)) {
      return score - metric.weight;
    }
    const normalized = metric.direction === "higher_better" ? value : 1 / Math.max(value, scoreEpsilon);
    return score + normalized * metric.weight;
  }, 0);

const selectWinner = (metricSet: MetricDefinition[], runs: AutoResearchRun[]): SelectionOutcome => {
  const ranked = runs
    .filter((run) => run.status !== "failed")
    .map((run) => ({
      variantId: run.variantId,
      metrics: run.metrics,
      score: scoreVariant(metricSet, run.metrics)
    }))
    .sort((left, right) => right.score - left.score);
  const winner = ranked[0];
  const rollbackSuggested = ranked.length === 0;
  return {
    winnerVariantId: winner?.variantId ?? null,
    winnerScore: winner?.score ?? null,
    orderedVariants: ranked,
    regressionSignals: [],
    rollbackSuggested,
    ...(rollbackSuggested ? { rollbackReason: "No viable winner produced by experiment runs" } : {})
  };
};

const suggestRollback = (
  outcome: SelectionOutcome,
  fallbackVariantId?: string
): { shouldRollback: boolean; reason?: string; fallbackVariantId?: string } => {
  if (!outcome.rollbackSuggested) {
    return { shouldRollback: false };
  }
  return {
    shouldRollback: true,
    ...(outcome.rollbackReason ? { reason: outcome.rollbackReason } : {}),
    ...(fallbackVariantId ? { fallbackVariantId } : {})
  };
};

const ensureExperiment = async (experimentId: string): Promise<AutoResearchExperiment> => {
  const experiment = await apiStore.getExperiment(experimentId);
  if (!experiment) {
    throw new Error(`Experiment not found: ${experimentId}`);
  }
  return experiment;
};

const inferVariantIds = (input: {
  explicitVariantIds?: string[];
  existingRuns: AutoResearchRun[];
  baselineVersionRef: string;
}): string[] => {
  const explicit = (input.explicitVariantIds ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (explicit.length > 0) return [...new Set(explicit)];

  const existing = [...new Set(input.existingRuns.map((run) => run.variantId.trim()).filter(Boolean))];
  if (existing.length >= 2) return existing.slice(0, 4);

  const baselineVariant = input.baselineVersionRef
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "baseline";

  const candidateVariant = `${baselineVariant}_candidate`;
  return [...new Set([baselineVariant, candidateVariant])];
};

const computeOutcome = (experiment: AutoResearchExperiment, runs: AutoResearchRun[]) => {
  const metricSet = normalizeMetricSet(experiment.metricSet);
  const outcome = selectWinner(metricSet, runs);
  const rollback = suggestRollback(outcome, experiment.baselineVersionRef);
  return { metricSet, outcome, rollback };
};

const syncRunFlags = async (
  runs: AutoResearchRun[],
  winnerVariantId: string | null,
  rollbackSuggested: boolean
): Promise<AutoResearchRun[]> => {
  const updates: AutoResearchRun[] = [];
  for (const run of runs) {
    const updated = await apiStore.updateExperimentRun(run.id, {
      winnerFlag: winnerVariantId ? run.variantId === winnerVariantId : false,
      rollbackFlag: rollbackSuggested
    });
    updates.push(updated);
  }
  return updates;
};

const parseJsonObject = <T>(value: string): T | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const attempts: string[] = [trimmed];
  const fenceMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    attempts.push(fenceMatch[1].trim());
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    attempts.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as T;
    } catch {
      // keep trying
    }
  }

  return null;
};

const sanitizeLines = (value: string, max = 600): string =>
  value
    .trim()
    .slice(0, max)
    .replace(/\s+/g, " ");

const estimateTokenCost = (provider: ProviderName, inputTokens: number, outputTokens: number): number => {
  const rates: Partial<Record<ProviderName, { input: number; output: number }>> = {
    openai: { input: 0.005, output: 0.015 },
    anthropic: { input: 0.004, output: 0.012 },
    gemini: { input: 0.002, output: 0.006 },
    openrouter: { input: 0.004, output: 0.012 },
    mistral: { input: 0.003, output: 0.009 },
    kie_ai: { input: 0.004, output: 0.01 }
  };
  const selected = rates[provider] ?? rates.openai ?? { input: 0, output: 0 };
  return Number((((inputTokens / 1000) * selected.input) + ((outputTokens / 1000) * selected.output)).toFixed(6));
};

const aggregateUsage = (usages: ProviderStepUsage[]): RunnerUsageSummary => {
  if (usages.length === 0) {
    return {
      provider: "openai",
      model: "unknown",
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      metadata: { steps: [] }
    };
  }

  const totalInput = usages.reduce((acc, item) => acc + item.inputTokens, 0);
  const totalOutput = usages.reduce((acc, item) => acc + item.outputTokens, 0);
  const totalCost = Number(usages.reduce((acc, item) => acc + item.cost, 0).toFixed(6));
  const dominant = [...usages].sort(
    (left, right) => right.inputTokens + right.outputTokens - (left.inputTokens + left.outputTokens)
  )[0];

  return {
    provider: dominant?.provider ?? "openai",
    model: dominant?.model ?? "unknown",
    inputTokens: totalInput,
    outputTokens: totalOutput,
    cost: totalCost,
    metadata: {
      steps: usages.map((usage) => ({
        step: usage.step,
        provider: usage.provider,
        model: usage.model,
        ...(usage.resolutionSource ? { resolutionSource: usage.resolutionSource } : {}),
        ...(usage.requestedModel ? { requestedModel: usage.requestedModel } : {}),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cost: usage.cost
      }))
    }
  };
};

const formatPromptHeader = (metadata: PromptMetadata): string =>
  [
    `PROMPT METADATA: source=${metadata.source} scope=${metadata.scope} version=${metadata.version} type=${metadata.type} target=${metadata.target} promptId=${metadata.promptId}`,
    ""
  ].join("\n");

const buildPromptWithMetadata = (entry: PromptRegistryEntry): ResolvedPrompt => {
  const metadata: PromptMetadata = {
    source: "registry",
    scope: entry.scope,
    type: entry.type,
    target: entry.target,
    version: entry.version,
    promptId: entry.id
  };
  return {
    metadata,
    prompt: [formatPromptHeader(metadata), entry.content.trim()].join("\n")
  };
};

const runProviderStep = async (input: {
  systemPrompt: string;
  prompt: string;
  step: string;
  tenantId: string;
  projectId?: string;
}): Promise<{ outputText: string; usage: ProviderStepUsage }> => {
  const registry = createDefaultProviderRegistry();
  const failures: string[] = [];
  const selection = await resolveProviderModelSelection({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    capabilityClass: "chat_reasoning"
  });
  const providerChain = [selection.provider, ...selection.providerOrder].filter(
    (item, index, all) => all.indexOf(item) === index
  );

  for (const providerName of providerChain) {
    const provider = registry.get(providerName, "chat_reasoning") as ChatReasoningProvider | undefined;
    if (!provider) continue;
    try {
      const response = await provider.run(
        {
          prompt: input.prompt,
          systemPrompt: input.systemPrompt,
          maxTokens: 1200,
          temperature: 0.15,
          ...(providerName === selection.provider && selection.modelId ? { modelId: selection.modelId } : {})
        },
        {
          projectId: input.projectId ?? "global_autoresearch",
          role: "planner"
        }
      );
      const inputTokens = Math.max(0, response.tokenUsage?.input ?? 0);
      const outputTokens = Math.max(0, response.tokenUsage?.output ?? 0);
      return {
        outputText: response.outputText,
        usage: {
          provider: providerName,
          model: response.modelId,
          inputTokens,
          outputTokens,
          cost: estimateTokenCost(providerName, inputTokens, outputTokens),
          step: input.step,
          resolutionSource: selection.source,
          ...(selection.modelId ? { requestedModel: selection.modelId } : {})
        }
      };
    } catch (error) {
      failures.push(`${providerName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(
    `No live chat_reasoning provider available for autoresearch step "${input.step}". ${failures.join(" | ")}`
  );
};

export const resolveAutoResearchPrompt = async (tenantId: string, projectId?: string): Promise<ResolvedPrompt> => {
  const workflowPrompt = await promptRegistryService.resolveActivePrompt({
    tenantId,
    ...(projectId ? { projectId } : {}),
    type: "workflow",
    target: "autoresearch"
  });

  if (!workflowPrompt?.content.trim()) {
    throw new Error(
      `Missing active prompt registry entry for workflow/autoresearch (tenant=${tenantId}${projectId ? `, project=${projectId}` : ""})`
    );
  }

  return buildPromptWithMetadata(workflowPrompt);
};

const planQueries = async (input: {
  tenantId: string;
  projectId?: string;
  systemPrompt: string;
  baseQuery: string;
  variantId: string;
}): Promise<{ queries: string[]; rationale: string; usage: ProviderStepUsage }> => {
  const stepInputText = [
    "Plan research queries for this experiment variant.",
    `Variant: ${input.variantId}`,
    `Base query: ${input.baseQuery}`,
    "Return strict JSON object: {\"queries\": string[], \"rationale\": string }",
    "Rules:",
    "- queries length: 1 to 3",
    "- queries must be specific and evidence-oriented",
    "- no markdown"
  ].join("\n");

  const response = await runProviderStep({
    systemPrompt: input.systemPrompt,
    prompt: stepInputText,
    step: "query_planning",
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {})
  });

  const parsed = parseJsonObject<{ queries?: unknown; rationale?: unknown }>(response.outputText);
  const queries = Array.isArray(parsed?.queries)
    ? parsed.queries
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, 3)
    : [];

  return {
    queries: queries.length > 0 ? [...new Set(queries)] : [input.baseQuery],
    rationale:
      typeof parsed?.rationale === "string" && parsed.rationale.trim().length > 0
        ? sanitizeLines(parsed.rationale, 300)
        : "Fallback to base query because provider planning output was not parseable.",
    usage: response.usage
  };
};

const gatherSources = async (input: {
  tenantId: string;
  projectId?: string;
  queries: string[];
}): Promise<ResearchSource[]> => {
  const sourceMap = new Map<string, ResearchSource>();

  for (const query of input.queries) {
    const entries = await buildCompactKnowledgeContext({
      tenantId: input.tenantId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      query,
      limit: 8,
      threshold: 0.05,
      includeContextNotes: true
    });

    for (const entry of entries) {
      const sourceId =
        entry.sourceType === "context-note" && entry.noteId
          ? `context-note:${entry.noteId}`
          : `knowledge-node:${entry.path}`;
      const existing = sourceMap.get(sourceId);
      const next: ResearchSource = {
        id: sourceId,
        title: entry.title,
        path: entry.path,
        scope: entry.scope,
        sourceType: entry.sourceType === "context-note" ? "context-note" : "knowledge-node",
        excerpt: entry.excerpt,
        baseScore: Number(clamp(entry.score, 0, 1).toFixed(4))
      };

      if (!existing || next.baseScore > existing.baseScore) {
        sourceMap.set(sourceId, next);
      }
    }
  }

  return [...sourceMap.values()]
    .sort((left, right) => right.baseScore - left.baseScore || left.path.localeCompare(right.path))
    .slice(0, 18);
};

const scoreEvidence = async (input: {
  tenantId: string;
  projectId?: string;
  systemPrompt: string;
  query: string;
  variantId: string;
  sources: ResearchSource[];
}): Promise<{ scored: ScoredEvidence[]; usage: ProviderStepUsage | null }> => {
  if (input.sources.length === 0) {
    return { scored: [], usage: null };
  }

  const stepInputText = [
    "Score evidence relevance for the research query.",
    `Variant: ${input.variantId}`,
    `Query: ${input.query}`,
    "Sources:",
    ...input.sources.map(
      (source, index) =>
        `${index + 1}. id=${source.id} | title=${source.title} | path=${source.path} | baseScore=${source.baseScore} | excerpt=${sanitizeLines(source.excerpt, 260)}`
    ),
    "Return strict JSON object: {\"evidence\": [{\"sourceId\": string, \"relevance\": number, \"confidence\": number, \"rationale\": string}]}.",
    "Rules:",
    "- relevance and confidence are in [0,1]",
    "- include every sourceId exactly once",
    "- no markdown"
  ].join("\n");

  const response = await runProviderStep({
    systemPrompt: input.systemPrompt,
    prompt: stepInputText,
    step: "source_scoring",
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {})
  });

  const parsed = parseJsonObject<{ evidence?: Array<{ sourceId?: unknown; relevance?: unknown; confidence?: unknown; rationale?: unknown }> }>(
    response.outputText
  );

  const evidenceMap = new Map(
    (parsed?.evidence ?? [])
      .filter((item) => typeof item.sourceId === "string")
      .map((item) => [item.sourceId as string, item])
  );

  const scored = input.sources.map((source) => {
    const fromModel = evidenceMap.get(source.id);
    const relevance =
      typeof fromModel?.relevance === "number"
        ? clamp(fromModel.relevance, 0, 1)
        : source.baseScore;
    const confidence =
      typeof fromModel?.confidence === "number"
        ? clamp(fromModel.confidence, 0, 1)
        : clamp(source.baseScore * 0.8 + 0.15, 0, 1);
    const blended = clamp((relevance * 0.7 + confidence * 0.2 + source.baseScore * 0.1), 0, 1);

    return {
      sourceId: source.id,
      title: source.title,
      path: source.path,
      relevance: Number(relevance.toFixed(4)),
      confidence: Number(confidence.toFixed(4)),
      score: Number(blended.toFixed(4)),
      rationale:
        typeof fromModel?.rationale === "string" && fromModel.rationale.trim().length > 0
          ? sanitizeLines(fromModel.rationale, 260)
          : "Fallback rationale derived from retrieval relevance."
    } satisfies ScoredEvidence;
  });

  return {
    scored: scored.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path)),
    usage: response.usage
  };
};

const synthesizeReport = async (input: {
  tenantId: string;
  projectId?: string;
  systemPrompt: string;
  query: string;
  variantId: string;
  scoredEvidence: ScoredEvidence[];
}): Promise<{ summary: string; confidence: number; rationale: string; usage: ProviderStepUsage }> => {
  const stepInputText = [
    "Synthesize a concise research result from scored evidence.",
    `Variant: ${input.variantId}`,
    `Query: ${input.query}`,
    "Evidence:",
    ...input.scoredEvidence.slice(0, 10).map(
      (item, index) =>
        `${index + 1}. sourceId=${item.sourceId} score=${item.score} relevance=${item.relevance} confidence=${item.confidence} rationale=${sanitizeLines(item.rationale, 200)}`
    ),
    "Return strict JSON object: {\"summary\": string, \"confidence\": number, \"rationale\": string}",
    "Rules:",
    "- confidence in [0,1]",
    "- summary must mention strongest evidence theme",
    "- no markdown"
  ].join("\n");

  const response = await runProviderStep({
    systemPrompt: input.systemPrompt,
    prompt: stepInputText,
    step: "synthesis",
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {})
  });

  const parsed = parseJsonObject<{ summary?: unknown; confidence?: unknown; rationale?: unknown }>(response.outputText);
  const summary =
    typeof parsed?.summary === "string" && parsed.summary.trim().length > 0
      ? sanitizeLines(parsed.summary, 1200)
      : "No synthesis summary produced by provider.";
  const confidence =
    typeof parsed?.confidence === "number"
      ? clamp(parsed.confidence, 0, 1)
      : clamp(
          input.scoredEvidence.length === 0
            ? 0.1
            : input.scoredEvidence.reduce((acc, item) => acc + item.confidence, 0) / input.scoredEvidence.length,
          0,
          1
        );
  const rationale =
    typeof parsed?.rationale === "string" && parsed.rationale.trim().length > 0
      ? sanitizeLines(parsed.rationale, 500)
      : "Confidence derived from scored evidence distribution.";

  return {
    summary,
    confidence: Number(confidence.toFixed(4)),
    rationale,
    usage: response.usage
  };
};

const runResearchPipeline = async (input: {
  tenantId: string;
  projectId?: string;
  variantId: string;
  baseQuery: string;
  prompt: ResolvedPrompt;
}): Promise<VariantResearchReport> => {
  const startedAt = Date.now();
  const usages: ProviderStepUsage[] = [];

  const planning = await planQueries({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt: input.prompt.prompt,
    baseQuery: input.baseQuery,
    variantId: input.variantId
  });
  usages.push(planning.usage);

  const sources = await gatherSources({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    queries: planning.queries
  });

  const scoring = await scoreEvidence({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt: input.prompt.prompt,
    query: input.baseQuery,
    variantId: input.variantId,
    sources
  });
  if (scoring.usage) {
    usages.push(scoring.usage);
  }

  const synthesis = await synthesizeReport({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt: input.prompt.prompt,
    query: input.baseQuery,
    variantId: input.variantId,
    scoredEvidence: scoring.scored
  });
  usages.push(synthesis.usage);

  return {
    variantId: input.variantId,
    query: input.baseQuery,
    plannedQueries: planning.queries,
    planningRationale: planning.rationale,
    promptMetadata: input.prompt.metadata,
    sources,
    scoredEvidence: scoring.scored,
    summary: synthesis.summary,
    confidence: synthesis.confidence,
    rationale: synthesis.rationale,
    elapsedMs: Math.max(1, Date.now() - startedAt),
    usage: aggregateUsage(usages)
  };
};

const buildVariantMetrics = (input: {
  metricSet: MetricDefinition[];
  report: VariantResearchReport;
}): Record<string, number> => {
  const averageEvidenceScore =
    input.report.scoredEvidence.length === 0
      ? 0
      : input.report.scoredEvidence.reduce((acc, item) => acc + item.score, 0) /
        input.report.scoredEvidence.length;
  const evidenceCoverage = clamp(input.report.sources.length / Math.max(1, input.report.plannedQueries.length * 3), 0, 1);
  const fallbackFailureRate = clamp(1 - input.report.confidence, 0, 1);

  return Object.fromEntries(
    input.metricSet.map((metric) => {
      const lowered = metric.name.toLowerCase();

      if (lowered.includes("success") || lowered.includes("pass")) {
        return [metric.name, Number(input.report.confidence.toFixed(4))];
      }
      if (lowered.includes("coverage")) {
        return [metric.name, Number(evidenceCoverage.toFixed(4))];
      }
      if (lowered.includes("quality") || lowered.includes("relevance")) {
        return [metric.name, Number(averageEvidenceScore.toFixed(4))];
      }
      if (lowered.includes("time") || lowered.includes("latency") || lowered.includes("duration")) {
        return [metric.name, Number(input.report.elapsedMs.toFixed(2))];
      }
      if (lowered.includes("token")) {
        return [metric.name, input.report.usage.inputTokens + input.report.usage.outputTokens];
      }
      if (lowered.includes("cost")) {
        return [metric.name, Number(input.report.usage.cost.toFixed(6))];
      }
      if (lowered.includes("error") || lowered.includes("failure") || lowered.includes("retry")) {
        return [metric.name, Number(fallbackFailureRate.toFixed(4))];
      }

      return [metric.name, Number(averageEvidenceScore.toFixed(4))];
    })
  );
};

const aggregateReportsUsage = (reports: VariantResearchReport[]): RunnerUsageSummary =>
  aggregateUsage(
    reports.map((report) => ({
      provider: report.usage.provider,
      model: report.usage.model,
      inputTokens: report.usage.inputTokens,
      outputTokens: report.usage.outputTokens,
      cost: report.usage.cost,
      step: `variant:${report.variantId}`
    }))
  );

export interface RunAutoResearchExperimentInput {
  experimentId: string;
  tenantId: string;
  actor: string;
  query?: string;
  variantIds?: string[];
}

export interface AutoResearchExecutionResult {
  experiment: AutoResearchExperiment;
  createdRuns: AutoResearchRun[];
  allRuns: AutoResearchRun[];
  winnerVariantId: string | null;
  rollbackSuggested: boolean;
  rollbackReason?: string;
  contextMatchCount: number;
  promptMetadata?: PromptMetadata;
  reports: VariantResearchReport[];
  usage: RunnerUsageSummary;
}

export const runAutoResearchExperiment = async (
  input: RunAutoResearchExperimentInput
): Promise<AutoResearchExecutionResult> => {
  const experiment = await ensureExperiment(input.experimentId);
  const existingRuns = await apiStore.listExperimentRuns(experiment.id);
  const variantIds = inferVariantIds({
    existingRuns,
    baselineVersionRef: experiment.baselineVersionRef,
    ...(input.variantIds ? { explicitVariantIds: input.variantIds } : {})
  });

  const baseQuery =
    input.query?.trim() || `${experiment.targetType} ${experiment.baselineVersionRef}`.trim();
  const resolvedPrompt = await resolveAutoResearchPrompt(input.tenantId, experiment.projectId);

  const metricSet = normalizeMetricSet(experiment.metricSet);
  const createdAt = nowIso();
  const createdRuns: AutoResearchRun[] = [];
  const reports: VariantResearchReport[] = [];

  for (const variantId of variantIds) {
    try {
      const report = await runResearchPipeline({
        tenantId: input.tenantId,
        ...(experiment.projectId ? { projectId: experiment.projectId } : {}),
        variantId,
        baseQuery: `${baseQuery} (variant: ${variantId})`,
        prompt: resolvedPrompt
      });
      reports.push(report);

      const run: AutoResearchRun = {
        id: randomUUID(),
        experimentId: experiment.id,
        variantId,
        status: "completed",
        metrics: buildVariantMetrics({
          metricSet,
          report
        }),
        winnerFlag: false,
        rollbackFlag: false,
        createdAt,
        createdBy: input.actor,
        updatedAt: createdAt,
        updatedBy: input.actor
      };
      createdRuns.push(await apiStore.createExperimentRun(run));
    } catch (error) {
      const run: AutoResearchRun = {
        id: randomUUID(),
        experimentId: experiment.id,
        variantId,
        status: "failed",
        metrics: {
          failure_rate: 1,
          error_signal: 1
        },
        winnerFlag: false,
        rollbackFlag: false,
        createdAt,
        createdBy: input.actor,
        updatedAt: createdAt,
        updatedBy: input.actor
      };
      createdRuns.push(await apiStore.createExperimentRun(run));
      reports.push({
        variantId,
        query: `${baseQuery} (variant: ${variantId})`,
        plannedQueries: [],
        planningRationale: "Pipeline failed before planning completed.",
        sources: [],
        scoredEvidence: [],
        summary: error instanceof Error ? error.message : String(error),
        confidence: 0,
        rationale: "Provider execution failed for this variant.",
        elapsedMs: 1,
        promptMetadata: resolvedPrompt.metadata,
        usage: {
          provider: "openai",
          model: "unavailable",
          inputTokens: 0,
          outputTokens: 0,
          cost: 0
        }
      });
    }
  }

  const allRuns = await apiStore.listExperimentRuns(experiment.id);
  const { outcome, rollback } = computeOutcome(experiment, allRuns);
  const updatedRuns = await syncRunFlags(allRuns, outcome.winnerVariantId, rollback.shouldRollback);

  await apiStore.updateExperiment(experiment.id, {
    status: rollback.shouldRollback ? "rolled_back" : "completed",
    updatedAt: nowIso(),
    updatedBy: input.actor
  });

  const contextMatchCount = reports.reduce((acc, report) => acc + report.sources.length, 0);
  const usage = aggregateReportsUsage(reports);

  return {
    experiment: {
      ...experiment,
      status: rollback.shouldRollback ? "rolled_back" : "completed"
    },
    createdRuns,
    allRuns: updatedRuns,
    winnerVariantId: outcome.winnerVariantId,
    rollbackSuggested: rollback.shouldRollback,
    ...(rollback.reason ? { rollbackReason: rollback.reason } : {}),
    contextMatchCount,
    promptMetadata: resolvedPrompt.metadata,
    reports,
    usage
  };
};

export interface EvaluateAutoResearchExperimentInput {
  experimentId: string;
  actor: string;
}

export const evaluateAutoResearchExperiment = async (
  input: EvaluateAutoResearchExperimentInput
): Promise<AutoResearchExecutionResult> => {
  const experiment = await ensureExperiment(input.experimentId);
  const runs = await apiStore.listExperimentRuns(experiment.id);
  if (runs.length === 0) {
    throw new Error(`No experiment runs available for evaluation: ${experiment.id}`);
  }

  const { outcome, rollback } = computeOutcome(experiment, runs);
  const updatedRuns = await syncRunFlags(runs, outcome.winnerVariantId, rollback.shouldRollback);
  await apiStore.updateExperiment(experiment.id, {
    status: rollback.shouldRollback ? "rolled_back" : "completed",
    updatedAt: nowIso(),
    updatedBy: input.actor
  });

  return {
    experiment: {
      ...experiment,
      status: rollback.shouldRollback ? "rolled_back" : "completed"
    },
    createdRuns: [],
    allRuns: updatedRuns,
    winnerVariantId: outcome.winnerVariantId,
    rollbackSuggested: rollback.shouldRollback,
    ...(rollback.reason ? { rollbackReason: rollback.reason } : {}),
    contextMatchCount: 0,
    reports: [],
    usage: {
      provider: "openai",
      model: "unknown",
      inputTokens: 0,
      outputTokens: 0,
      cost: 0
    }
  };
};
