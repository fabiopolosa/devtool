import type {
  BrainstormPlanPayload,
  ChatReasoningProvider,
  CodingProvider,
  Job,
  ProviderName,
  Subprompt
} from "@cp/domain";
import { providerNames } from "@cp/domain";
import type { PromptBuilderService } from "@cp/prompt-builder";
import type { ProviderRegistry } from "@cp/providers";
import type { ProviderRateLimiter } from "../rate-limit.js";
import type { JobExecutionResult, JobUsageRecord } from "../types.js";
import { asRecord, toNumberOr, toText } from "../utils.js";
import { estimateUsageCost } from "../usage-cost.js";

export interface GenerationHandlerOptions {
  promptBuilder: PromptBuilderService;
  providerRegistry: ProviderRegistry;
  providerOrder: ProviderName[];
  rateLimiter?: ProviderRateLimiter;
}

const buildUsageRecord = (
  provider: ProviderName,
  model: string,
  capability: "coding" | "chat_reasoning",
  tokenUsage?: { input: number; output: number } | null
): JobUsageRecord | undefined => {
  if (!tokenUsage) return undefined;
  return {
    provider,
    model,
    inputTokens: tokenUsage.input,
    outputTokens: tokenUsage.output,
    cost: estimateUsageCost(provider, tokenUsage.input, tokenUsage.output),
    metadata: { capability }
  };
};

const buildGenerationResult = (
  provider: ProviderName,
  modelId: string,
  outputText: string,
  capability: "coding" | "chat_reasoning",
  tokenUsage?: { input: number; output: number } | null,
  options?: {
    fallbackErrors?: string[];
    providerResolution?: Record<string, unknown>;
  }
): JobExecutionResult => {
  const result: JobExecutionResult = {
    nextStatus: "done",
    payloadPatch: {
      output: {
        stage: "generation",
        provider,
        modelId,
        text: outputText,
        tokenUsage: tokenUsage ?? null,
        ...(options?.providerResolution ? { providerResolution: options.providerResolution } : {}),
        ...(options?.fallbackErrors && options.fallbackErrors.length > 0
          ? { fallbackErrors: options.fallbackErrors }
          : {})
      }
    }
  };

  const usage = buildUsageRecord(provider, modelId, capability, tokenUsage ?? null);
  if (usage) {
    result.usage = usage;
  }

  return result;
};

export const createGenerationHandler = (options: GenerationHandlerOptions) => {
  const { promptBuilder, providerRegistry, providerOrder, rateLimiter } = options;
  const validProviderNames = new Set<ProviderName>(providerNames);

  return async (job: Job): Promise<JobExecutionResult> => {
    const payload = asRecord(job.payload) ?? {};
    const roleName = typeof payload.role === "string" && payload.role.trim().length > 0 ? payload.role : "codex_builder";
    const subpromptItems = Array.isArray(payload.subprompts) ? (payload.subprompts as Subprompt[]) : [];
    const planPayload = asRecord(payload.plan) as BrainstormPlanPayload | undefined;
    const additionalContext = asRecord(payload.context);
    const projectId =
      typeof payload.projectId === "string"
        ? payload.projectId
        : job.resourceType === "project" && job.resourceId
          ? job.resourceId
          : job.projectId;

    const instructionText =
      typeof payload.inputText === "string" && payload.inputText.trim().length > 0
        ? payload.inputText
        : await promptBuilder.buildPrompt({
            role: roleName,
            subprompts: subpromptItems,
            ...(planPayload ? { plan: planPayload } : {}),
            ...(additionalContext ? { context: additionalContext } : {}),
            registryContext: {
              tenantId: job.tenantId,
              ...(projectId ? { projectId } : {}),
              type: typeof payload.promptType === "string" && payload.promptType.trim().length > 0
                ? payload.promptType.trim()
                : "role",
              target: typeof payload.promptTarget === "string" && payload.promptTarget.trim().length > 0
                ? payload.promptTarget.trim()
                : roleName
            }
          });

    const maxTokens = toNumberOr(payload.maxTokens, 1200);
    const estimatedInputTokens = Math.max(1, Math.ceil(instructionText.length / 4));
    const estimatedTotalTokens = estimatedInputTokens + maxTokens;
    const temperature = toNumberOr(payload.temperature, 0.2);
    const systemMessage = typeof payload.systemMessage === "string" ? payload.systemMessage : undefined;
    const requestedProviders = Array.isArray(payload.providerOrder)
      ? payload.providerOrder
          .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
          .filter((item): item is ProviderName => validProviderNames.has(item as ProviderName))
      : [];
    const providerResolution = asRecord(payload.providerResolution);
    const resolvedProviderRaw =
      (typeof providerResolution?.provider === "string" ? providerResolution.provider : undefined) ??
      (typeof payload.providerId === "string" ? payload.providerId : undefined) ??
      (typeof payload.provider === "string" ? payload.provider : undefined);
    const resolvedProvider = resolvedProviderRaw?.trim().toLowerCase();
    const selectedProvider = resolvedProvider && validProviderNames.has(resolvedProvider as ProviderName)
      ? (resolvedProvider as ProviderName)
      : undefined;
    const selectedModelId =
      (typeof providerResolution?.modelId === "string" ? providerResolution.modelId.trim() : "") ||
      (typeof payload.modelId === "string" ? payload.modelId.trim() : "") ||
      (typeof payload.model === "string" ? payload.model.trim() : "") ||
      "";
    const providers = [
      ...(selectedProvider ? [selectedProvider] : []),
      ...requestedProviders,
      ...providerOrder
    ].filter((item, index, all) => all.indexOf(item) === index);

    const providerContext = {
      projectId: projectId ?? "project_unknown",
      ...(typeof payload.taskId === "string" ? { taskId: payload.taskId } : {}),
      ...(typeof payload.runId === "string" ? { runId: payload.runId } : {}),
      role: "codex_builder" as const
    };

    const errors: string[] = [];

    for (const providerName of providers) {
      const codingProvider = providerRegistry.get(providerName, "coding") as CodingProvider | undefined;
      if (codingProvider) {
        try {
          if (rateLimiter) {
            await rateLimiter.enforce({
              tenantId: job.tenantId,
              provider: providerName,
              estimatedTokens: estimatedTotalTokens
            });
          }
          const response = await codingProvider.run(
            {
              prompt: instructionText,
              ...(systemMessage ? { systemPrompt: systemMessage } : {}),
              maxTokens,
              temperature,
              ...(selectedProvider === providerName && selectedModelId ? { modelId: selectedModelId } : {})
            },
            providerContext
          );
          return buildGenerationResult(
            providerName,
            response.modelId,
            response.outputText,
            "coding",
            response.tokenUsage ?? null,
            {
              ...(errors.length > 0 ? { fallbackErrors: errors } : {}),
              ...(providerResolution ? { providerResolution } : {})
            }
          );
        } catch (error) {
          errors.push(`[coding:${providerName}] ${toText(error)}`);
        }
      }

      const chatProvider = providerRegistry.get(providerName, "chat_reasoning") as ChatReasoningProvider | undefined;
      if (chatProvider) {
        try {
          if (rateLimiter) {
            await rateLimiter.enforce({
              tenantId: job.tenantId,
              provider: providerName,
              estimatedTokens: estimatedTotalTokens
            });
          }
          const response = await chatProvider.run(
            {
              prompt: instructionText,
              ...(systemMessage ? { systemPrompt: systemMessage } : {}),
              maxTokens,
              temperature,
              ...(selectedProvider === providerName && selectedModelId ? { modelId: selectedModelId } : {})
            },
            providerContext
          );
          return buildGenerationResult(
            providerName,
            response.modelId,
            response.outputText,
            "chat_reasoning",
            response.tokenUsage ?? null,
            {
              ...(errors.length > 0 ? { fallbackErrors: errors } : {}),
              ...(providerResolution ? { providerResolution } : {})
            }
          );
        } catch (error) {
          errors.push(`[chat:${providerName}] ${toText(error)}`);
        }
      }
    }

    throw new Error(
      errors.length > 0
        ? `No generation provider succeeded: ${errors.join(" | ")}`
        : "No provider available for generation jobs"
    );
  };
};
