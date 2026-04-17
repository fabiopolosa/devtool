import { createHash } from "node:crypto";
import type {
  ChatReasoningProvider,
  ImageGenerationProvider,
  ProviderName
} from "@cp/domain";
import { createDefaultProviderRegistry } from "@cp/providers";
import { listContextNotes } from "./context-service.js";
import { buildCompactKnowledgeContext } from "./knowledge-service.js";
import { promptRegistryService } from "./prompt-registry-service.js";
import {
  resolveProviderModelSelection,
  type ProviderResolutionSource
} from "./provider-config-service.js";

const defaultReasoningProviderOrder: ProviderName[] = ["openai", "anthropic", "gemini", "openrouter"];
const defaultImageProviderOrder: ProviderName[] = ["openai", "openrouter", "kie_ai", "gemini"];

const nowIso = (): string => new Date().toISOString();

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const sanitizeLine = (value: string, max = 300): string =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);

const parseJsonObject = <T>(value: string): T | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const attempts: string[] = [trimmed];
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) attempts.push(fenced[1].trim());
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
  const cost = ((inputTokens / 1000) * selected.input) + ((outputTokens / 1000) * selected.output);
  return Number(cost.toFixed(6));
};

const isTrue = (value: string | undefined): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const disableLiveProviders = (): boolean =>
  process.env.NODE_ENV === "test"
  || isTrue(process.env.CONTENT_PIPELINES_DISABLE_LIVE)
  || isTrue(process.env.CONTENT_PIPELINES_FALLBACK_ONLY);

const uniqueProviders = (items: Array<ProviderName | undefined>): ProviderName[] =>
  [...new Set(items.filter((item): item is ProviderName => Boolean(item)))];

const toFallbackUsage = (input: {
  step: string;
  warnings: string[];
  provider?: ProviderName;
}): ProviderStepUsage => ({
  provider: input.provider ?? "openai",
  model: "fallback",
  inputTokens: 0,
  outputTokens: 0,
  cost: 0,
  step: input.step,
  mode: "fallback",
  warnings: input.warnings
});

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

  const totalInput = usages.reduce((acc, usage) => acc + usage.inputTokens, 0);
  const totalOutput = usages.reduce((acc, usage) => acc + usage.outputTokens, 0);
  const totalCost = Number(usages.reduce((acc, usage) => acc + usage.cost, 0).toFixed(6));
  const dominant = [...usages].sort(
    (left, right) =>
      right.inputTokens + right.outputTokens - (left.inputTokens + left.outputTokens)
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
        mode: usage.mode,
        provider: usage.provider,
        model: usage.model,
        ...(usage.resolutionSource ? { resolutionSource: usage.resolutionSource } : {}),
        ...(usage.requestedModel ? { requestedModel: usage.requestedModel } : {}),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cost: usage.cost,
        ...(usage.warnings?.length ? { warnings: usage.warnings } : {})
      }))
    }
  };
};

interface ProviderStepUsage {
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  step: string;
  mode: "live" | "fallback";
  resolutionSource?: ProviderResolutionSource;
  requestedModel?: string;
  warnings?: string[];
}

export interface RunnerUsageSummary {
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  metadata?: Record<string, unknown>;
}

interface ReasoningStepResult {
  outputText: string;
  usage: ProviderStepUsage;
  warnings: string[];
}

const runReasoningStep = async (input: {
  step: string;
  tenantId: string;
  projectId?: string;
  prompt: string;
  systemPrompt: string;
  maxTokens?: number;
  temperature?: number;
  requestedProvider?: ProviderName;
  requestedModel?: string;
  fallbackOutput: string;
}): Promise<ReasoningStepResult> => {
  if (disableLiveProviders()) {
    const warning = `Live providers disabled for step "${input.step}".`;
    return {
      outputText: input.fallbackOutput,
      usage: toFallbackUsage({
        step: input.step,
        warnings: [warning],
        ...(input.requestedProvider ? { provider: input.requestedProvider } : {})
      }),
      warnings: [warning]
    };
  }

  const warnings: string[] = [];
  let selection:
    | Awaited<ReturnType<typeof resolveProviderModelSelection>>
    | undefined;
  try {
    selection = await resolveProviderModelSelection({
      tenantId: input.tenantId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.requestedProvider ? { requestedProvider: input.requestedProvider } : {}),
      ...(input.requestedModel ? { requestedModelId: input.requestedModel } : {}),
      capabilityClass: "chat_reasoning"
    });
  } catch (error) {
    const warning = `Provider resolution failed for step "${input.step}": ${error instanceof Error ? error.message : String(error)}`;
    warnings.push(warning);
    return {
      outputText: input.fallbackOutput,
      usage: toFallbackUsage({
        step: input.step,
        warnings,
        ...(input.requestedProvider ? { provider: input.requestedProvider } : {})
      }),
      warnings
    };
  }

  const providerChain = uniqueProviders([
    selection?.provider,
    ...(selection?.providerOrder ?? []),
    ...defaultReasoningProviderOrder
  ]);
  const registry = createDefaultProviderRegistry();
  const failures: string[] = [];

  for (const providerName of providerChain) {
    const provider = registry.get(providerName, "chat_reasoning") as ChatReasoningProvider | undefined;
    if (!provider) continue;
    try {
      const response = await provider.run(
        {
          prompt: input.prompt,
          systemPrompt: input.systemPrompt,
          ...(typeof input.maxTokens === "number" ? { maxTokens: input.maxTokens } : {}),
          ...(typeof input.temperature === "number" ? { temperature: input.temperature } : {}),
          ...(providerName === selection.provider && selection.modelId
            ? { modelId: selection.modelId }
            : {})
        },
        {
          projectId: input.projectId ?? "global_content_pipeline",
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
          mode: "live",
          ...(selection?.source ? { resolutionSource: selection.source } : {}),
          ...(selection?.modelId ? { requestedModel: selection.modelId } : {})
        },
        warnings
      };
    } catch (error) {
      failures.push(
        `${providerName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  warnings.push(
    `No live chat_reasoning provider succeeded for "${input.step}". ${failures.join(" | ")}`
  );
  return {
    outputText: input.fallbackOutput,
    usage: toFallbackUsage({
      step: input.step,
      warnings,
      ...(selection?.provider ? { provider: selection.provider } : {})
    }),
    warnings
  };
};

interface ImageGenerationResult {
  images: GeneratedImageAsset[];
  usage: ProviderStepUsage;
  warnings: string[];
}

const runImageGenerationStep = async (input: {
  sceneId: string;
  prompt: string;
  tenantId: string;
  projectId?: string;
  requestedProvider?: ProviderName;
  requestedModel?: string;
}): Promise<ImageGenerationResult> => {
  const warnings: string[] = [];
  if (disableLiveProviders()) {
    warnings.push("Live image generation is disabled in this environment.");
    return {
      images: [],
      usage: toFallbackUsage({
        step: "asset_image_generation",
        warnings,
        ...(input.requestedProvider ? { provider: input.requestedProvider } : {})
      }),
      warnings
    };
  }

  let selection:
    | Awaited<ReturnType<typeof resolveProviderModelSelection>>
    | undefined;
  try {
    selection = await resolveProviderModelSelection({
      tenantId: input.tenantId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.requestedProvider ? { requestedProvider: input.requestedProvider } : {}),
      capabilityClass: "chat_reasoning"
    });
  } catch (error) {
    warnings.push(
      `Image provider resolution fallback engaged: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const providerChain = uniqueProviders([
    input.requestedProvider,
    selection?.provider,
    ...(selection?.providerOrder ?? []),
    ...defaultImageProviderOrder
  ]);
  const registry = createDefaultProviderRegistry();
  const failures: string[] = [];

  for (const providerName of providerChain) {
    const provider = registry.get(
      providerName,
      "image_generation"
    ) as ImageGenerationProvider | undefined;
    if (!provider) continue;
    try {
      const response = await provider.generate(
        {
          prompt: input.prompt,
          ...(input.requestedModel && providerName === selection?.provider
            ? { style: `model:${input.requestedModel}` }
            : {})
        },
        {
          projectId: input.projectId ?? "global_content_pipeline",
          role: "image_designer"
        }
      );
      const images = (response.images ?? [])
        .slice(0, 1)
        .map((item) => toGeneratedImageAsset(input.sceneId, input.prompt, providerName, response.modelId, item.mimeType, item.dataBase64));
      return {
        images,
        usage: {
          provider: providerName,
          model: response.modelId,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          step: "asset_image_generation",
          mode: "live",
          ...(selection?.source ? { resolutionSource: selection.source } : {})
        },
        warnings
      };
    } catch (error) {
      failures.push(
        `${providerName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  warnings.push(`No live image_generation provider succeeded. ${failures.join(" | ")}`);
  return {
    images: [],
    usage: toFallbackUsage({
      step: "asset_image_generation",
      warnings,
      ...(selection?.provider ? { provider: selection.provider } : {})
    }),
    warnings
  };
};

const toGeneratedImageAsset = (
  sceneId: string,
  prompt: string,
  provider: ProviderName,
  modelId: string,
  mimeType: string,
  dataBase64: string
): GeneratedImageAsset => {
  const bytes = Math.floor((dataBase64.length * 3) / 4);
  const sha256 = createHash("sha256").update(dataBase64).digest("hex");
  const previewChars = dataBase64.slice(0, 72);
  return {
    sceneId,
    prompt,
    provider,
    model: modelId,
    mimeType,
    bytes,
    sha256,
    previewDataUri: `data:${mimeType};base64,${previewChars}...`
  };
};

const resolvePromptWithFallback = async (input: {
  tenantId: string;
  projectId?: string;
  preferredTargets: string[];
  fallbackRoleTargets: string[];
}): Promise<string> => {
  for (const target of input.preferredTargets) {
    const promptEntry = await promptRegistryService.resolveActivePrompt({
      tenantId: input.tenantId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      type: "workflow",
      target
    });
    if (promptEntry?.content.trim()) return promptEntry.content.trim();
  }

  for (const roleTarget of input.fallbackRoleTargets) {
    const promptEntry = await promptRegistryService.resolveActivePrompt({
      tenantId: input.tenantId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      type: "role",
      target: roleTarget
    });
    if (promptEntry?.content.trim()) return promptEntry.content.trim();
  }

  throw new Error(
    `Missing active prompt registry entry for targets [${[...input.preferredTargets, ...input.fallbackRoleTargets].join(", ")}]`
  );
};

const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "section";

interface ContentOutlineSection {
  id: string;
  title: string;
  goal: string;
}

interface ContentSectionPlan {
  id: string;
  title: string;
  objective: string;
  keyPoints: string[];
}

export interface ContentSectionDraft {
  id: string;
  title: string;
  objective: string;
  keyPoints: string[];
  draft: string;
}

export interface ResearchPipelineSource {
  id: string;
  title: string;
  path: string;
  scope: "system" | "tenant" | "project" | "context-notes";
  sourceType: "knowledge-node" | "context-note";
  excerpt: string;
  baseScore: number;
  validationStatus: "validated" | "partial" | "rejected";
  validationConfidence: number;
  validationRationale: string;
}

export interface ResearchPipelineEvidence {
  sourceId: string;
  title: string;
  path: string;
  relevance: number;
  confidence: number;
  score: number;
  rationale: string;
}

export interface ResearchPipelineOutput {
  query: string;
  plannedQueries: string[];
  planningRationale: string;
  retrievalSummary: string;
  sources: ResearchPipelineSource[];
  scoredEvidence: ResearchPipelineEvidence[];
  summaries: string[];
  confidence: number;
  rationale: string;
  usage: RunnerUsageSummary;
  warnings: string[];
}

export interface ContentPipelineOutput {
  topic: string;
  objective: string;
  audience: string;
  tone: string;
  targetLengthWords: number;
  research: ResearchPipelineOutput;
  outline: ContentOutlineSection[];
  sections: ContentSectionDraft[];
  draft: string;
  refinedDraft: string;
  summary: string;
  editorialNotes: string[];
  usage: RunnerUsageSummary;
  warnings: string[];
}

export interface VisualSceneOutput {
  id: string;
  title: string;
  camera: string;
  framing: string;
  movement: string;
  subject: string;
  mood: string;
  prompt: string;
  durationSec: number;
}

export interface VisualPipelineOutput {
  concept: string;
  style: string;
  rationale: string;
  scenes: VisualSceneOutput[];
  usage: RunnerUsageSummary;
  warnings: string[];
}

export interface GeneratedImageAsset {
  sceneId: string;
  prompt: string;
  provider: ProviderName;
  model: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  previewDataUri: string;
}

export interface VideoSegmentPlan {
  sceneId: string;
  durationSec: number;
  prompt: string;
  status: "planned" | "unsupported";
  note: string;
}

export interface AssetPipelineOutput {
  generatedAt: string;
  images: GeneratedImageAsset[];
  videoSegments: VideoSegmentPlan[];
  usage: RunnerUsageSummary;
  warnings: string[];
}

export interface MultimodalPipelineOutput {
  topic: string;
  research: ResearchPipelineOutput;
  content: ContentPipelineOutput;
  visual: VisualPipelineOutput;
  assets: AssetPipelineOutput;
  usage: RunnerUsageSummary;
  warnings: string[];
}

const collectContextDigest = async (input: {
  tenantId: string;
  projectId?: string;
}): Promise<string> => {
  if (!input.projectId) return "No project-scoped context notes available.";
  const notes = await listContextNotes({
    tenantId: input.tenantId,
    projectId: input.projectId,
    limit: 6
  });
  if (notes.items.length === 0) {
    return "No context notes found.";
  }
  return notes.items
    .slice(0, 4)
    .map((note, index) => `${index + 1}. ${note.title} (${note.path}) — ${sanitizeLine(note.content, 220)}`)
    .join("\n");
};

const planQueries = async (input: {
  tenantId: string;
  projectId?: string;
  query: string;
  systemPrompt: string;
}): Promise<{ queries: string[]; rationale: string; usage: ProviderStepUsage; warnings: string[] }> => {
  const fallback = JSON.stringify({
    queries: [input.query, `${input.query} implementation constraints`, `${input.query} practical examples`],
    rationale: "Fallback query planning produced deterministic variants."
  });

  const response = await runReasoningStep({
    step: "research_query_planning",
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt: input.systemPrompt,
    prompt: [
      "Plan concrete research queries for this topic.",
      `Topic: ${input.query}`,
      "Return strict JSON object: {\"queries\": string[], \"rationale\": string}.",
      "Rules:",
      "- 2 to 4 queries",
      "- focus on evidence-backed implementation guidance",
      "- no markdown"
    ].join("\n"),
    maxTokens: 900,
    temperature: 0.1,
    fallbackOutput: fallback
  });

  const parsed = parseJsonObject<{ queries?: unknown; rationale?: unknown }>(response.outputText);
  const queries = Array.isArray(parsed?.queries)
    ? parsed.queries
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, 4)
    : [];

  return {
    queries: queries.length > 0 ? [...new Set(queries)] : [input.query],
    rationale:
      typeof parsed?.rationale === "string" && parsed.rationale.trim().length > 0
        ? sanitizeLine(parsed.rationale, 400)
        : "Fallback planning rationale used.",
    usage: response.usage,
    warnings: response.warnings
  };
};

const gatherSources = async (input: {
  tenantId: string;
  projectId?: string;
  queries: string[];
}): Promise<ResearchPipelineSource[]> => {
  const sources = new Map<string, ResearchPipelineSource>();
  for (const query of input.queries) {
    const entries = await buildCompactKnowledgeContext({
      tenantId: input.tenantId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      query,
      limit: 10,
      threshold: 0.04,
      includeContextNotes: true
    });

    for (const entry of entries) {
      const sourceId =
        entry.sourceType === "context-note" && entry.noteId
          ? `context-note:${entry.noteId}`
          : `knowledge-node:${entry.path}`;
      const candidate: ResearchPipelineSource = {
        id: sourceId,
        title: entry.title,
        path: entry.path,
        scope: entry.scope,
        sourceType: entry.sourceType === "context-note" ? "context-note" : "knowledge-node",
        excerpt: entry.excerpt,
        baseScore: Number(clamp(entry.score, 0, 1).toFixed(4)),
        validationStatus: "partial",
        validationConfidence: Number(clamp(entry.score, 0, 1).toFixed(4)),
        validationRationale: "Validation pending"
      };
      const current = sources.get(sourceId);
      if (!current || candidate.baseScore > current.baseScore) {
        sources.set(sourceId, candidate);
      }
    }
  }
  return [...sources.values()]
    .sort((left, right) => right.baseScore - left.baseScore || left.path.localeCompare(right.path))
    .slice(0, 20);
};

const validateSources = async (input: {
  tenantId: string;
  projectId?: string;
  query: string;
  systemPrompt: string;
  sources: ResearchPipelineSource[];
}): Promise<{ sources: ResearchPipelineSource[]; usage: ProviderStepUsage; warnings: string[] }> => {
  if (input.sources.length === 0) {
    return {
      sources: [],
      usage: toFallbackUsage({
        step: "research_source_validation",
        warnings: ["No sources available for validation."]
      }),
      warnings: ["No sources available for validation."]
    };
  }

  const heuristicPayload = {
    sources: input.sources.map((source) => ({
      sourceId: source.id,
      status: source.baseScore >= 0.55 ? "validated" : source.baseScore >= 0.3 ? "partial" : "rejected",
      confidence: Number(clamp(source.baseScore * 0.9 + 0.08, 0, 1).toFixed(4)),
      rationale:
        source.baseScore >= 0.55
          ? "High retrieval relevance and sufficient content detail."
          : source.baseScore >= 0.3
            ? "Moderate relevance; keep as supporting evidence."
            : "Low relevance for the current query."
    }))
  };

  const response = await runReasoningStep({
    step: "research_source_validation",
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt: input.systemPrompt,
    prompt: [
      "Validate source quality and direct relevance for the research query.",
      `Query: ${input.query}`,
      "Sources:",
      ...input.sources.map((source, index) =>
        `${index + 1}. id=${source.id} title=${source.title} path=${source.path} baseScore=${source.baseScore} excerpt=${sanitizeLine(source.excerpt, 220)}`
      ),
      "Return strict JSON object: {\"sources\": [{\"sourceId\": string, \"status\": \"validated\"|\"partial\"|\"rejected\", \"confidence\": number, \"rationale\": string}]}",
      "Rules:",
      "- confidence in [0,1]",
      "- include every sourceId exactly once",
      "- no markdown"
    ].join("\n"),
    maxTokens: 1400,
    temperature: 0.1,
    fallbackOutput: JSON.stringify(heuristicPayload)
  });

  const parsed = parseJsonObject<{
    sources?: Array<{
      sourceId?: unknown;
      status?: unknown;
      confidence?: unknown;
      rationale?: unknown;
    }>;
  }>(response.outputText);
  const map = new Map(
    (parsed?.sources ?? [])
      .filter((item) => typeof item.sourceId === "string")
      .map((item) => [item.sourceId as string, item])
  );

  const validated = input.sources.map((source) => {
    const candidate = map.get(source.id);
    const statusRaw = asString(candidate?.status)?.toLowerCase();
    const validationStatus =
      statusRaw === "validated" || statusRaw === "partial" || statusRaw === "rejected"
        ? statusRaw
        : source.baseScore >= 0.55
          ? "validated"
          : source.baseScore >= 0.3
            ? "partial"
            : "rejected";
    const confidenceRaw =
      typeof candidate?.confidence === "number"
        ? clamp(candidate.confidence, 0, 1)
        : clamp(source.baseScore * 0.9 + 0.08, 0, 1);
    const rationaleRaw =
      typeof candidate?.rationale === "string" && candidate.rationale.trim().length > 0
        ? sanitizeLine(candidate.rationale, 260)
        : validationStatus === "validated"
          ? "Source passes quality validation and aligns with query."
          : validationStatus === "partial"
            ? "Source partially aligns; keep as supporting context."
            : "Source rejected due to low direct relevance.";

    return {
      ...source,
      validationStatus,
      validationConfidence: Number(confidenceRaw.toFixed(4)),
      validationRationale: rationaleRaw
    } satisfies ResearchPipelineSource;
  });

  return {
    sources: validated,
    usage: response.usage,
    warnings: response.warnings
  };
};

const scoreEvidence = async (input: {
  tenantId: string;
  projectId?: string;
  query: string;
  systemPrompt: string;
  sources: ResearchPipelineSource[];
}): Promise<{ scoredEvidence: ResearchPipelineEvidence[]; usage: ProviderStepUsage; warnings: string[] }> => {
  if (input.sources.length === 0) {
    return {
      scoredEvidence: [],
      usage: toFallbackUsage({
        step: "research_source_scoring",
        warnings: ["No validated sources available for scoring."]
      }),
      warnings: ["No validated sources available for scoring."]
    };
  }

  const fallback = {
    evidence: input.sources.map((source) => ({
      sourceId: source.id,
      relevance: Number(clamp(source.baseScore, 0, 1).toFixed(4)),
      confidence: source.validationConfidence,
      rationale: source.validationRationale
    }))
  };

  const response = await runReasoningStep({
    step: "research_source_scoring",
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt: input.systemPrompt,
    prompt: [
      "Score evidence strength for the research query.",
      `Query: ${input.query}`,
      "Validated sources:",
      ...input.sources.map((source, index) =>
        `${index + 1}. id=${source.id} status=${source.validationStatus} confidence=${source.validationConfidence} baseScore=${source.baseScore} excerpt=${sanitizeLine(source.excerpt, 220)}`
      ),
      "Return strict JSON object: {\"evidence\": [{\"sourceId\": string, \"relevance\": number, \"confidence\": number, \"rationale\": string}]}",
      "Rules:",
      "- relevance and confidence in [0,1]",
      "- include every sourceId exactly once",
      "- no markdown"
    ].join("\n"),
    maxTokens: 1500,
    temperature: 0.12,
    fallbackOutput: JSON.stringify(fallback)
  });

  const parsed = parseJsonObject<{
    evidence?: Array<{
      sourceId?: unknown;
      relevance?: unknown;
      confidence?: unknown;
      rationale?: unknown;
    }>;
  }>(response.outputText);
  const evidenceMap = new Map(
    (parsed?.evidence ?? [])
      .filter((entry) => typeof entry.sourceId === "string")
      .map((entry) => [entry.sourceId as string, entry])
  );

  const scored = input.sources.map((source) => {
    const fromModel = evidenceMap.get(source.id);
    const relevance =
      typeof fromModel?.relevance === "number"
        ? clamp(fromModel.relevance, 0, 1)
        : clamp(source.baseScore, 0, 1);
    const confidence =
      typeof fromModel?.confidence === "number"
        ? clamp(fromModel.confidence, 0, 1)
        : source.validationConfidence;
    const score = clamp((relevance * 0.65) + (confidence * 0.25) + (source.baseScore * 0.1), 0, 1);
    const rationale =
      typeof fromModel?.rationale === "string" && fromModel.rationale.trim().length > 0
        ? sanitizeLine(fromModel.rationale, 240)
        : source.validationRationale;
    return {
      sourceId: source.id,
      title: source.title,
      path: source.path,
      relevance: Number(relevance.toFixed(4)),
      confidence: Number(confidence.toFixed(4)),
      score: Number(score.toFixed(4)),
      rationale
    } satisfies ResearchPipelineEvidence;
  });

  return {
    scoredEvidence: scored.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path)),
    usage: response.usage,
    warnings: response.warnings
  };
};

const synthesizeResearch = async (input: {
  tenantId: string;
  projectId?: string;
  query: string;
  systemPrompt: string;
  contextDigest?: string;
  scoredEvidence: ResearchPipelineEvidence[];
}): Promise<{
  summary: string;
  confidence: number;
  rationale: string;
  summaries: string[];
  usage: ProviderStepUsage;
  warnings: string[];
}> => {
  const fallbackConfidence = clamp(
    input.scoredEvidence.length === 0
      ? 0.1
      : input.scoredEvidence.reduce((acc, item) => acc + item.confidence, 0) / input.scoredEvidence.length,
    0,
    1
  );
  const fallback = {
    summary:
      input.scoredEvidence.length === 0
        ? "No evidence could be synthesized for the query."
        : `Top evidence indicates: ${input.scoredEvidence.slice(0, 3).map((item) => item.title).join(" | ")}`,
    confidence: Number(fallbackConfidence.toFixed(4)),
    rationale: "Fallback synthesis computed from evidence scores.",
    summaries: input.scoredEvidence.slice(0, 5).map(
      (item, index) =>
        `${index + 1}. ${item.title} (${item.path}) — score=${item.score} confidence=${item.confidence}`
    )
  };

  const response = await runReasoningStep({
    step: "research_synthesis",
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt: input.systemPrompt,
    prompt: [
      "Synthesize research findings into concise output.",
      `Query: ${input.query}`,
      ...(input.contextDigest ? [`Project context notes: ${sanitizeLine(input.contextDigest, 500)}`] : []),
      "Evidence:",
      ...input.scoredEvidence.slice(0, 12).map(
        (item, index) =>
          `${index + 1}. sourceId=${item.sourceId} score=${item.score} relevance=${item.relevance} confidence=${item.confidence} rationale=${sanitizeLine(item.rationale, 200)}`
      ),
      "Return strict JSON object: {\"summary\": string, \"confidence\": number, \"rationale\": string, \"summaries\": string[]}",
      "Rules:",
      "- confidence in [0,1]",
      "- summaries should be short bullet-like lines",
      "- no markdown"
    ].join("\n"),
    maxTokens: 1600,
    temperature: 0.14,
    fallbackOutput: JSON.stringify(fallback)
  });

  const parsed = parseJsonObject<{
    summary?: unknown;
    confidence?: unknown;
    rationale?: unknown;
    summaries?: unknown;
  }>(response.outputText);

  const summaries = Array.isArray(parsed?.summaries)
    ? parsed.summaries
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => sanitizeLine(entry, 220))
        .slice(0, 8)
    : fallback.summaries;

  return {
    summary:
      typeof parsed?.summary === "string" && parsed.summary.trim().length > 0
        ? sanitizeLine(parsed.summary, 1400)
        : fallback.summary,
    confidence:
      typeof parsed?.confidence === "number"
        ? Number(clamp(parsed.confidence, 0, 1).toFixed(4))
        : fallback.confidence,
    rationale:
      typeof parsed?.rationale === "string" && parsed.rationale.trim().length > 0
        ? sanitizeLine(parsed.rationale, 500)
        : fallback.rationale,
    summaries,
    usage: response.usage,
    warnings: response.warnings
  };
};

export interface RunResearchPipelineInput {
  tenantId: string;
  projectId?: string;
  query: string;
}

export const runResearchPipeline = async (
  input: RunResearchPipelineInput
): Promise<ResearchPipelineOutput> => {
  const systemPrompt = await resolvePromptWithFallback({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    preferredTargets: ["research_pipeline", "autoresearch"],
    fallbackRoleTargets: ["gemini_researcher", "planner"]
  });

  const [planning, contextDigest] = await Promise.all([
    planQueries({
      tenantId: input.tenantId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      query: input.query,
      systemPrompt
    }),
    collectContextDigest({
      tenantId: input.tenantId,
      ...(input.projectId ? { projectId: input.projectId } : {})
    })
  ]);

  const sourceQuerySet = [...new Set([input.query, ...planning.queries])].slice(0, 4);
  const gathered = await gatherSources({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    queries: sourceQuerySet
  });

  const validation = await validateSources({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    query: input.query,
    systemPrompt,
    sources: gathered
  });

  const scoring = await scoreEvidence({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    query: input.query,
    systemPrompt,
    sources: validation.sources.filter((source) => source.validationStatus !== "rejected")
  });

  const synthesis = await synthesizeResearch({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    query: input.query,
    systemPrompt,
    contextDigest,
    scoredEvidence: scoring.scoredEvidence
  });

  const warnings = [
    ...planning.warnings,
    ...validation.warnings,
    ...scoring.warnings,
    ...synthesis.warnings
  ];
  const usage = aggregateUsage([planning.usage, validation.usage, scoring.usage, synthesis.usage]);
  const retrievalSummary = `queries=${sourceQuerySet.length}, sources=${validation.sources.length}, validated=${validation.sources.filter((entry) => entry.validationStatus === "validated").length}`;

  return {
    query: input.query,
    plannedQueries: sourceQuerySet,
    planningRationale: planning.rationale,
    retrievalSummary,
    sources: validation.sources,
    scoredEvidence: scoring.scoredEvidence,
    summaries: synthesis.summaries,
    confidence: synthesis.confidence,
    rationale: synthesis.rationale,
    usage,
    warnings
  };
};

const generateOutline = async (input: {
  tenantId: string;
  projectId?: string;
  systemPrompt: string;
  topic: string;
  objective: string;
  audience: string;
  tone: string;
  targetLengthWords: number;
  research: ResearchPipelineOutput;
  contextDigest: string;
}): Promise<{
  outline: ContentOutlineSection[];
  rationale: string;
  usage: ProviderStepUsage;
  warnings: string[];
}> => {
  const fallbackOutline: ContentOutlineSection[] = [
    { id: "intro", title: `Introduction to ${input.topic}`, goal: "Frame scope and objectives." },
    { id: "analysis", title: "Evidence Analysis", goal: "Discuss validated sources and trade-offs." },
    { id: "execution", title: "Execution Blueprint", goal: "Describe implementation phases and milestones." },
    { id: "conclusion", title: "Conclusion", goal: "Summarize recommendations and next actions." }
  ];

  const fallback = JSON.stringify({
    outline: fallbackOutline,
    rationale: "Fallback outline based on deterministic template."
  });

  const response = await runReasoningStep({
    step: "content_outline_generation",
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt: input.systemPrompt,
    prompt: [
      "Generate a long-form article outline.",
      `Topic: ${input.topic}`,
      `Objective: ${input.objective}`,
      `Audience: ${input.audience}`,
      `Tone: ${input.tone}`,
      `Target words: ${input.targetLengthWords}`,
      `Research summary: ${input.research.summaries.slice(0, 4).join(" | ") || input.research.rationale}`,
      `Context notes: ${input.contextDigest}`,
      "Return strict JSON object: {\"outline\": [{\"id\": string, \"title\": string, \"goal\": string}], \"rationale\": string}",
      "Rules:",
      "- 4 to 8 sections",
      "- ids must be lowercase snake_case",
      "- no markdown"
    ].join("\n"),
    maxTokens: 1300,
    temperature: 0.18,
    fallbackOutput: fallback
  });

  const parsed = parseJsonObject<{
    outline?: Array<{ id?: unknown; title?: unknown; goal?: unknown }>;
    rationale?: unknown;
  }>(response.outputText);
  const outline = (parsed?.outline ?? [])
    .map((entry) => ({
      id: asString(entry.id) ?? slug(asString(entry.title) ?? "section"),
      title: asString(entry.title) ?? "Untitled section",
      goal: asString(entry.goal) ?? "Add key evidence-backed discussion."
    }))
    .filter((entry) => entry.title.trim().length > 0)
    .slice(0, 10);

  return {
    outline: outline.length > 0 ? outline : fallbackOutline,
    rationale:
      typeof parsed?.rationale === "string" && parsed.rationale.trim().length > 0
        ? sanitizeLine(parsed.rationale, 350)
        : "Fallback outline rationale used.",
    usage: response.usage,
    warnings: response.warnings
  };
};

const generateSectionBreakdown = async (input: {
  tenantId: string;
  projectId?: string;
  systemPrompt: string;
  topic: string;
  outline: ContentOutlineSection[];
  research: ResearchPipelineOutput;
}): Promise<{ sections: ContentSectionPlan[]; usage: ProviderStepUsage; warnings: string[] }> => {
  const fallback = {
    sections: input.outline.map((section) => ({
      id: section.id,
      title: section.title,
      objective: section.goal,
      keyPoints: [
        `Core point for ${section.title}`,
        "Evidence-backed argument",
        "Actionable recommendation"
      ]
    }))
  };

  const response = await runReasoningStep({
    step: "content_section_breakdown",
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt: input.systemPrompt,
    prompt: [
      "Break down each outline section into actionable writing points.",
      `Topic: ${input.topic}`,
      "Outline:",
      ...input.outline.map((section) => `${section.id}: ${section.title} — ${section.goal}`),
      "Top evidence:",
      ...input.research.scoredEvidence.slice(0, 8).map(
        (item, index) =>
          `${index + 1}. ${item.title} (${item.path}) score=${item.score} rationale=${sanitizeLine(item.rationale, 160)}`
      ),
      "Return strict JSON object: {\"sections\": [{\"id\": string, \"title\": string, \"objective\": string, \"keyPoints\": string[]}]}",
      "Rules:",
      "- include every section id once",
      "- keyPoints length 2 to 5",
      "- no markdown"
    ].join("\n"),
    maxTokens: 1500,
    temperature: 0.16,
    fallbackOutput: JSON.stringify(fallback)
  });

  const parsed = parseJsonObject<{
    sections?: Array<{
      id?: unknown;
      title?: unknown;
      objective?: unknown;
      keyPoints?: unknown;
    }>;
  }>(response.outputText);
  const sectionMap = new Map(
    (parsed?.sections ?? [])
      .map((section) => {
        const id = asString(section.id);
        if (!id) return null;
        const keyPoints = Array.isArray(section.keyPoints)
          ? section.keyPoints
              .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
              .map((item) => sanitizeLine(item, 180))
              .slice(0, 6)
          : [];
        return [id, {
          id,
          title: asString(section.title) ?? "Section",
          objective: asString(section.objective) ?? "Expand this section with evidence-backed details.",
          keyPoints
        } satisfies ContentSectionPlan] as const;
      })
      .filter((entry): entry is readonly [string, ContentSectionPlan] => Boolean(entry))
  );

  const sections = input.outline.map((outlineSection) => {
    const candidate = sectionMap.get(outlineSection.id);
    if (candidate) {
      return {
        ...candidate,
        title: candidate.title || outlineSection.title,
        objective: candidate.objective || outlineSection.goal,
        keyPoints:
          candidate.keyPoints.length > 0
            ? candidate.keyPoints
            : [`Discuss ${outlineSection.title}`, "Ground the section in evidence."]
      };
    }
    return {
      id: outlineSection.id,
      title: outlineSection.title,
      objective: outlineSection.goal,
      keyPoints: [
        `Explain ${outlineSection.title} in practical terms.`,
        "Tie recommendation to validated research."
      ]
    };
  });

  return {
    sections,
    usage: response.usage,
    warnings: response.warnings
  };
};

const draftSections = async (input: {
  tenantId: string;
  projectId?: string;
  systemPrompt: string;
  topic: string;
  objective: string;
  audience: string;
  tone: string;
  targetLengthWords: number;
  sections: ContentSectionPlan[];
  research: ResearchPipelineOutput;
}): Promise<{
  sections: ContentSectionDraft[];
  draft: string;
  usage: ProviderStepUsage;
  warnings: string[];
}> => {
  const fallbackSections: ContentSectionDraft[] = input.sections.map((section) => ({
    id: section.id,
    title: section.title,
    objective: section.objective,
    keyPoints: section.keyPoints,
    draft: `${section.title}: ${section.objective} ${section.keyPoints.join(" ")}`
  }));
  const fallback = JSON.stringify({
    sections: fallbackSections,
    draft: fallbackSections.map((section) => `## ${section.title}\n${section.draft}`).join("\n\n")
  });

  const response = await runReasoningStep({
    step: "content_drafting",
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt: input.systemPrompt,
    prompt: [
      "Draft section-level content from the approved breakdown.",
      `Topic: ${input.topic}`,
      `Objective: ${input.objective}`,
      `Audience: ${input.audience}`,
      `Tone: ${input.tone}`,
      `Target words: ${input.targetLengthWords}`,
      "Sections:",
      ...input.sections.map(
        (section) =>
          `${section.id}: ${section.title} | objective=${section.objective} | keyPoints=${section.keyPoints.join("; ")}`
      ),
      "Key evidence:",
      ...input.research.scoredEvidence.slice(0, 8).map(
        (item, index) => `${index + 1}. ${item.title} (${item.path}) — ${sanitizeLine(item.rationale, 160)}`
      ),
      "Return strict JSON object: {\"sections\": [{\"id\": string, \"draft\": string}], \"draft\": string}",
      "Rules:",
      "- produce substantial prose for each section",
      "- keep draft cohesive",
      "- no markdown fences"
    ].join("\n"),
    maxTokens: 2600,
    temperature: 0.2,
    fallbackOutput: fallback
  });

  const parsed = parseJsonObject<{
    sections?: Array<{ id?: unknown; draft?: unknown }>;
    draft?: unknown;
  }>(response.outputText);
  const sectionDraftMap = new Map(
    (parsed?.sections ?? [])
      .filter((entry) => typeof entry.id === "string")
      .map((entry) => [entry.id as string, asString(entry.draft) ?? ""])
  );

  const sections = input.sections.map((section) => ({
    id: section.id,
    title: section.title,
    objective: section.objective,
    keyPoints: section.keyPoints,
    draft:
      sectionDraftMap.get(section.id)?.trim()
      || `${section.objective} ${section.keyPoints.join(" ")}`
  }));

  const draft =
    typeof parsed?.draft === "string" && parsed.draft.trim().length > 0
      ? parsed.draft.trim()
      : sections.map((section) => `## ${section.title}\n${section.draft}`).join("\n\n");

  return {
    sections,
    draft,
    usage: response.usage,
    warnings: response.warnings
  };
};

const refineDraft = async (input: {
  tenantId: string;
  projectId?: string;
  systemPrompt: string;
  topic: string;
  tone: string;
  audience: string;
  draft: string;
}): Promise<{
  refinedDraft: string;
  summary: string;
  editorialNotes: string[];
  usage: ProviderStepUsage;
  warnings: string[];
}> => {
  const fallback = JSON.stringify({
    refinedDraft: input.draft,
    summary: `Refined draft for ${input.topic} prepared with ${input.tone} tone.`,
    editorialNotes: ["Provider refinement unavailable; using base draft."]
  });

  const response = await runReasoningStep({
    step: "content_refinement",
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt: input.systemPrompt,
    prompt: [
      "Refine this long-form draft for clarity, flow, and consistency.",
      `Topic: ${input.topic}`,
      `Audience: ${input.audience}`,
      `Tone: ${input.tone}`,
      "Draft:",
      input.draft.slice(0, 10_000),
      "Return strict JSON object: {\"refinedDraft\": string, \"summary\": string, \"editorialNotes\": string[]}",
      "Rules:",
      "- keep factual claims aligned with provided draft",
      "- editorialNotes should mention key improvements",
      "- no markdown fences"
    ].join("\n"),
    maxTokens: 2800,
    temperature: 0.12,
    fallbackOutput: fallback
  });

  const parsed = parseJsonObject<{
    refinedDraft?: unknown;
    summary?: unknown;
    editorialNotes?: unknown;
  }>(response.outputText);
  const editorialNotes = Array.isArray(parsed?.editorialNotes)
    ? parsed.editorialNotes
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => sanitizeLine(entry, 220))
        .slice(0, 8)
    : ["Provider refinement unavailable; using base draft."];

  return {
    refinedDraft:
      typeof parsed?.refinedDraft === "string" && parsed.refinedDraft.trim().length > 0
        ? parsed.refinedDraft.trim()
        : input.draft,
    summary:
      typeof parsed?.summary === "string" && parsed.summary.trim().length > 0
        ? sanitizeLine(parsed.summary, 380)
        : `Refined draft for ${input.topic} is ready.`,
    editorialNotes,
    usage: response.usage,
    warnings: response.warnings
  };
};

export interface RunContentPipelineInput {
  tenantId: string;
  projectId?: string;
  topic: string;
  objective?: string;
  audience?: string;
  tone?: string;
  targetLengthWords?: number;
  researchQuery?: string;
}

export const runContentPipeline = async (
  input: RunContentPipelineInput
): Promise<ContentPipelineOutput> => {
  const objective = input.objective?.trim() || "Produce an actionable evidence-backed long-form article.";
  const audience = input.audience?.trim() || "Technical and product stakeholders";
  const tone = input.tone?.trim() || "clear, practical, and authoritative";
  const targetLengthWords = Math.max(600, Math.min(5000, Math.trunc(input.targetLengthWords ?? 1600)));
  const contextDigest = await collectContextDigest({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {})
  });
  const research = await runResearchPipeline({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    query: input.researchQuery?.trim() || input.topic
  });
  const systemPrompt = await resolvePromptWithFallback({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    preferredTargets: ["content_pipeline", "longform_content_pipeline"],
    fallbackRoleTargets: ["planner", "gemini_researcher"]
  });

  const outline = await generateOutline({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt,
    topic: input.topic,
    objective,
    audience,
    tone,
    targetLengthWords,
    research,
    contextDigest
  });
  const breakdown = await generateSectionBreakdown({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt,
    topic: input.topic,
    outline: outline.outline,
    research
  });
  const drafting = await draftSections({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt,
    topic: input.topic,
    objective,
    audience,
    tone,
    targetLengthWords,
    sections: breakdown.sections,
    research
  });
  const refinement = await refineDraft({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt,
    topic: input.topic,
    tone,
    audience,
    draft: drafting.draft
  });

  const usage = aggregateUsage([
    research.usage.metadata
      ? {
          provider: research.usage.provider,
          model: research.usage.model,
          inputTokens: research.usage.inputTokens,
          outputTokens: research.usage.outputTokens,
          cost: research.usage.cost,
          step: "research_pipeline",
          mode: "live"
        }
      : {
          provider: research.usage.provider,
          model: research.usage.model,
          inputTokens: research.usage.inputTokens,
          outputTokens: research.usage.outputTokens,
          cost: research.usage.cost,
          step: "research_pipeline",
          mode: "fallback"
        },
    outline.usage,
    breakdown.usage,
    drafting.usage,
    refinement.usage
  ]);

  return {
    topic: input.topic,
    objective,
    audience,
    tone,
    targetLengthWords,
    research,
    outline: outline.outline,
    sections: drafting.sections,
    draft: drafting.draft,
    refinedDraft: refinement.refinedDraft,
    summary: refinement.summary,
    editorialNotes: refinement.editorialNotes,
    usage,
    warnings: [
      ...research.warnings,
      ...outline.warnings,
      ...breakdown.warnings,
      ...drafting.warnings,
      ...refinement.warnings
    ]
  };
};

const planScenes = async (input: {
  tenantId: string;
  projectId?: string;
  systemPrompt: string;
  concept: string;
  style: string;
  contentSummary: string;
}): Promise<{
  scenes: Array<{ id: string; title: string; subject: string; mood: string }>;
  rationale: string;
  usage: ProviderStepUsage;
  warnings: string[];
}> => {
  const fallbackScenes = [
    { id: "scene_1", title: "Opening context", subject: input.concept, mood: "inviting" },
    { id: "scene_2", title: "Core mechanism", subject: "Key process in action", mood: "focused" },
    { id: "scene_3", title: "Outcome and CTA", subject: "Result and next step", mood: "confident" }
  ];
  const fallback = JSON.stringify({
    scenes: fallbackScenes,
    rationale: "Fallback scene planning created a 3-step narrative arc."
  });

  const response = await runReasoningStep({
    step: "visual_scene_planning",
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt: input.systemPrompt,
    prompt: [
      "Plan visual scenes for multimodal storytelling.",
      `Concept: ${input.concept}`,
      `Style: ${input.style}`,
      `Content summary: ${sanitizeLine(input.contentSummary, 500)}`,
      "Return strict JSON object: {\"scenes\": [{\"id\": string, \"title\": string, \"subject\": string, \"mood\": string}], \"rationale\": string}",
      "Rules:",
      "- 3 to 6 scenes",
      "- scene ids should be snake_case",
      "- no markdown"
    ].join("\n"),
    maxTokens: 1300,
    temperature: 0.2,
    fallbackOutput: fallback
  });

  const parsed = parseJsonObject<{
    scenes?: Array<{ id?: unknown; title?: unknown; subject?: unknown; mood?: unknown }>;
    rationale?: unknown;
  }>(response.outputText);
  const scenes = (parsed?.scenes ?? [])
    .map((scene, index) => ({
      id: asString(scene.id) ?? `scene_${index + 1}`,
      title: asString(scene.title) ?? `Scene ${index + 1}`,
      subject: asString(scene.subject) ?? "Primary subject",
      mood: asString(scene.mood) ?? "balanced"
    }))
    .slice(0, 8);

  return {
    scenes: scenes.length > 0 ? scenes : fallbackScenes,
    rationale:
      typeof parsed?.rationale === "string" && parsed.rationale.trim().length > 0
        ? sanitizeLine(parsed.rationale, 320)
        : "Fallback scene planning rationale used.",
    usage: response.usage,
    warnings: response.warnings
  };
};

const defineShots = async (input: {
  tenantId: string;
  projectId?: string;
  systemPrompt: string;
  concept: string;
  scenes: Array<{ id: string; title: string; subject: string; mood: string }>;
}): Promise<{
  shots: Array<{ sceneId: string; camera: string; framing: string; movement: string; durationSec: number }>;
  usage: ProviderStepUsage;
  warnings: string[];
}> => {
  const fallback = {
    shots: input.scenes.map((scene, index) => ({
      sceneId: scene.id,
      camera: index % 2 === 0 ? "35mm lens" : "50mm lens",
      framing: index === 0 ? "wide establishing" : "medium close-up",
      movement: index === input.scenes.length - 1 ? "subtle dolly in" : "static with micro-parallax",
      durationSec: index === 0 ? 6 : 5
    }))
  };

  const response = await runReasoningStep({
    step: "visual_shot_definition",
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt: input.systemPrompt,
    prompt: [
      "Define camera language for planned scenes.",
      `Concept: ${input.concept}`,
      "Scenes:",
      ...input.scenes.map((scene) => `${scene.id}: ${scene.title} | subject=${scene.subject} | mood=${scene.mood}`),
      "Return strict JSON object: {\"shots\": [{\"sceneId\": string, \"camera\": string, \"framing\": string, \"movement\": string, \"durationSec\": number}]}",
      "Rules:",
      "- include every sceneId once",
      "- durationSec between 3 and 12",
      "- no markdown"
    ].join("\n"),
    maxTokens: 1200,
    temperature: 0.18,
    fallbackOutput: JSON.stringify(fallback)
  });

  const parsed = parseJsonObject<{
    shots?: Array<{
      sceneId?: unknown;
      camera?: unknown;
      framing?: unknown;
      movement?: unknown;
      durationSec?: unknown;
    }>;
  }>(response.outputText);
  const shotMap = new Map(
    (parsed?.shots ?? [])
      .filter((shot) => typeof shot.sceneId === "string")
      .map((shot) => [shot.sceneId as string, shot])
  );
  const shots = input.scenes.map((scene) => {
    const shot = shotMap.get(scene.id);
    return {
      sceneId: scene.id,
      camera: asString(shot?.camera) ?? "35mm lens",
      framing: asString(shot?.framing) ?? "medium shot",
      movement: asString(shot?.movement) ?? "static",
      durationSec:
        typeof shot?.durationSec === "number"
          ? Math.max(3, Math.min(12, Math.trunc(shot.durationSec)))
          : 5
    };
  });
  return {
    shots,
    usage: response.usage,
    warnings: response.warnings
  };
};

const generateScenePrompts = async (input: {
  tenantId: string;
  projectId?: string;
  systemPrompt: string;
  concept: string;
  style: string;
  scenes: Array<{ id: string; title: string; subject: string; mood: string }>;
  shots: Array<{ sceneId: string; camera: string; framing: string; movement: string; durationSec: number }>;
}): Promise<{
  prompts: Array<{ sceneId: string; prompt: string }>;
  usage: ProviderStepUsage;
  warnings: string[];
}> => {
  const fallback = {
    prompts: input.scenes.map((scene) => {
      const shot = input.shots.find((item) => item.sceneId === scene.id);
      return {
        sceneId: scene.id,
        prompt: `${scene.subject}, ${scene.mood} mood, ${input.style} style, ${shot?.camera ?? "35mm lens"}, ${shot?.framing ?? "medium shot"}, cinematic lighting, high detail`
      };
    })
  };

  const response = await runReasoningStep({
    step: "visual_prompt_generation",
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt: input.systemPrompt,
    prompt: [
      "Generate production-ready visual prompts for each scene.",
      `Concept: ${input.concept}`,
      `Style: ${input.style}`,
      "Scene and shot definitions:",
      ...input.scenes.map((scene) => {
        const shot = input.shots.find((item) => item.sceneId === scene.id);
        return `${scene.id}: title=${scene.title} subject=${scene.subject} mood=${scene.mood} camera=${shot?.camera ?? "35mm"} framing=${shot?.framing ?? "medium"} movement=${shot?.movement ?? "static"}`;
      }),
      "Return strict JSON object: {\"prompts\": [{\"sceneId\": string, \"prompt\": string}]}",
      "Rules:",
      "- include every sceneId once",
      "- prompt should include camera and mood details",
      "- no markdown"
    ].join("\n"),
    maxTokens: 1500,
    temperature: 0.2,
    fallbackOutput: JSON.stringify(fallback)
  });

  const parsed = parseJsonObject<{
    prompts?: Array<{ sceneId?: unknown; prompt?: unknown }>;
  }>(response.outputText);
  const promptMap = new Map(
    (parsed?.prompts ?? [])
      .filter((entry) => typeof entry.sceneId === "string")
      .map((entry) => [entry.sceneId as string, asString(entry.prompt) ?? ""])
  );

  const prompts = input.scenes.map((scene) => ({
    sceneId: scene.id,
    prompt:
      promptMap.get(scene.id) && promptMap.get(scene.id)?.trim().length
        ? promptMap.get(scene.id) as string
        : `${scene.subject}, ${scene.mood} mood, ${input.style} style, cinematic composition`
  }));

  return {
    prompts,
    usage: response.usage,
    warnings: response.warnings
  };
};

export interface RunVisualPipelineInput {
  tenantId: string;
  projectId?: string;
  concept: string;
  style?: string;
  contentSummary: string;
}

export const runVisualPipeline = async (
  input: RunVisualPipelineInput
): Promise<VisualPipelineOutput> => {
  const style = input.style?.trim() || "cinematic documentary";
  const systemPrompt = await resolvePromptWithFallback({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    preferredTargets: ["multimodal_pipeline", "visual_pipeline"],
    fallbackRoleTargets: ["image_designer", "planner"]
  });
  const planning = await planScenes({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt,
    concept: input.concept,
    style,
    contentSummary: input.contentSummary
  });
  const shots = await defineShots({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt,
    concept: input.concept,
    scenes: planning.scenes
  });
  const prompts = await generateScenePrompts({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    systemPrompt,
    concept: input.concept,
    style,
    scenes: planning.scenes,
    shots: shots.shots
  });

  const promptMap = new Map(prompts.prompts.map((entry) => [entry.sceneId, entry.prompt]));
  const shotMap = new Map(shots.shots.map((entry) => [entry.sceneId, entry]));
  const scenes: VisualSceneOutput[] = planning.scenes.map((scene) => {
    const shot = shotMap.get(scene.id);
    return {
      id: scene.id,
      title: scene.title,
      subject: scene.subject,
      mood: scene.mood,
      camera: shot?.camera ?? "35mm lens",
      framing: shot?.framing ?? "medium shot",
      movement: shot?.movement ?? "static",
      durationSec: shot?.durationSec ?? 5,
      prompt:
        promptMap.get(scene.id)
        ?? `${scene.subject}, ${scene.mood} mood, ${style} style`
    };
  });

  return {
    concept: input.concept,
    style,
    rationale: planning.rationale,
    scenes,
    usage: aggregateUsage([planning.usage, shots.usage, prompts.usage]),
    warnings: [...planning.warnings, ...shots.warnings, ...prompts.warnings]
  };
};

export interface RunAssetPipelineInput {
  tenantId: string;
  projectId?: string;
  scenes: VisualSceneOutput[];
  generateImages?: boolean;
  requestedProvider?: ProviderName;
  requestedModel?: string;
}

export const runAssetPipeline = async (
  input: RunAssetPipelineInput
): Promise<AssetPipelineOutput> => {
  const generateImages = input.generateImages ?? true;
  const usages: ProviderStepUsage[] = [];
  const warnings: string[] = [];
  const images: GeneratedImageAsset[] = [];

  if (generateImages) {
    const targetScenes = input.scenes.slice(0, 4);
    for (const scene of targetScenes) {
      const result = await runImageGenerationStep({
        sceneId: scene.id,
        prompt: scene.prompt,
        tenantId: input.tenantId,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.requestedProvider ? { requestedProvider: input.requestedProvider } : {}),
        ...(input.requestedModel ? { requestedModel: input.requestedModel } : {})
      });
      usages.push(result.usage);
      warnings.push(...result.warnings);
      images.push(...result.images);
    }
  } else {
    usages.push(
      toFallbackUsage({
        step: "asset_image_generation",
        warnings: ["Image generation skipped by request."]
      })
    );
  }

  const videoSegments: VideoSegmentPlan[] = input.scenes.map((scene) => ({
    sceneId: scene.id,
    durationSec: scene.durationSec,
    prompt: scene.prompt,
    status: "unsupported",
    note: "Video generation provider is not configured in this runtime; segment storyboard is prepared."
  }));

  return {
    generatedAt: nowIso(),
    images,
    videoSegments,
    usage: aggregateUsage(usages),
    warnings
  };
};

export interface RunMultimodalPipelineInput {
  tenantId: string;
  projectId?: string;
  topic: string;
  objective?: string;
  audience?: string;
  tone?: string;
  targetLengthWords?: number;
  style?: string;
  generateImages?: boolean;
}

export const runMultimodalPipeline = async (
  input: RunMultimodalPipelineInput
): Promise<MultimodalPipelineOutput> => {
  const content = await runContentPipeline({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    topic: input.topic,
    ...(input.objective ? { objective: input.objective } : {}),
    ...(input.audience ? { audience: input.audience } : {}),
    ...(input.tone ? { tone: input.tone } : {}),
    ...(typeof input.targetLengthWords === "number"
      ? { targetLengthWords: input.targetLengthWords }
      : {})
  });
  const visual = await runVisualPipeline({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    concept: input.topic,
    ...(input.style ? { style: input.style } : {}),
    contentSummary: `${content.summary}\n\n${content.refinedDraft.slice(0, 1800)}`
  });
  const assets = await runAssetPipeline({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    scenes: visual.scenes,
    ...(typeof input.generateImages === "boolean"
      ? { generateImages: input.generateImages }
      : {})
  });

  const usage = aggregateUsage([
    {
      provider: content.usage.provider,
      model: content.usage.model,
      inputTokens: content.usage.inputTokens,
      outputTokens: content.usage.outputTokens,
      cost: content.usage.cost,
      step: "content_pipeline",
      mode: content.usage.inputTokens + content.usage.outputTokens > 0 ? "live" : "fallback"
    },
    {
      provider: visual.usage.provider,
      model: visual.usage.model,
      inputTokens: visual.usage.inputTokens,
      outputTokens: visual.usage.outputTokens,
      cost: visual.usage.cost,
      step: "visual_pipeline",
      mode: visual.usage.inputTokens + visual.usage.outputTokens > 0 ? "live" : "fallback"
    },
    {
      provider: assets.usage.provider,
      model: assets.usage.model,
      inputTokens: assets.usage.inputTokens,
      outputTokens: assets.usage.outputTokens,
      cost: assets.usage.cost,
      step: "asset_pipeline",
      mode: assets.usage.inputTokens + assets.usage.outputTokens > 0 ? "live" : "fallback"
    }
  ]);

  return {
    topic: input.topic,
    research: content.research,
    content,
    visual,
    assets,
    usage,
    warnings: [...content.warnings, ...visual.warnings, ...assets.warnings]
  };
};
