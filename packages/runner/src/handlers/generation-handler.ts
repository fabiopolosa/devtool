import type {
  BrainstormPlanPayload,
  ChatReasoningProvider,
  CodingProvider,
  Job,
  ProviderName,
  Subprompt
} from "@cp/domain";
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
  tokenUsage?: { input: number; output: number } | null
): JobExecutionResult => {
  const result: JobExecutionResult = {
    nextStatus: "done",
    payloadPatch: {
      output: {
        stage: "generation",
        provider,
        modelId,
        text: outputText,
        tokenUsage: tokenUsage ?? null
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

  return async (job: Job): Promise<JobExecutionResult> => {
    const payload = asRecord(job.payload) ?? {};
    const roleName = typeof payload.role === "string" && payload.role.trim().length > 0 ? payload.role : "codex_builder";
    const subpromptItems = Array.isArray(payload.subprompts) ? (payload.subprompts as Subprompt[]) : [];
    const planPayload = asRecord(payload.plan) as BrainstormPlanPayload | undefined;
    const additionalContext = asRecord(payload.context);

    const instructionText =
      typeof payload.inputText === "string" && payload.inputText.trim().length > 0
        ? payload.inputText
        : await promptBuilder.buildPrompt({
            role: roleName,
            subprompts: subpromptItems,
            ...(planPayload ? { plan: planPayload } : {}),
            ...(additionalContext ? { context: additionalContext } : {})
          });

    const maxTokens = toNumberOr(payload.maxTokens, 1200);
    const estimatedInputTokens = Math.max(1, Math.ceil(instructionText.length / 4));
    const estimatedTotalTokens = estimatedInputTokens + maxTokens;
    const temperature = toNumberOr(payload.temperature, 0.2);
    const systemMessage = typeof payload.systemMessage === "string" ? payload.systemMessage : undefined;
    const providers = Array.isArray(payload.providerOrder)
      ? (payload.providerOrder.filter((item): item is ProviderName => typeof item === "string") as ProviderName[])
      : providerOrder;

    const providerContext = {
      projectId:
        typeof payload.projectId === "string"
          ? payload.projectId
          : job.resourceType === "project" && job.resourceId
            ? job.resourceId
            : "project_unknown",
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
              temperature
            },
            providerContext
          );
          return buildGenerationResult(
            providerName,
            response.modelId,
            response.outputText,
            "coding",
            response.tokenUsage ?? null
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
              temperature
            },
            providerContext
          );
          return buildGenerationResult(
            providerName,
            response.modelId,
            response.outputText,
            "chat_reasoning",
            response.tokenUsage ?? null
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
