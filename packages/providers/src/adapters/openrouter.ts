import type { ChatReasoningProvider, CodingProvider, ProviderModelDescriptor, ProviderRequestContext, CapabilityClass } from "@cp/domain";
import { BaseProviderAdapter, type RequestJsonOptions } from "./base-provider.js";

interface OpenRouterChatResponse {
  model?: string;
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface OpenRouterModelCatalogItem {
  id?: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: number; completion?: number; input?: number; output?: number };
  architecture?: { modality?: string };
  top_provider?: { id?: string };
}

interface OpenRouterModelCatalogResponse {
  data?: OpenRouterModelCatalogItem[];
}

const openRouterSupportsCapability = (item: OpenRouterModelCatalogItem, capabilityClass: CapabilityClass): boolean => {
  const modality = item.architecture?.modality?.toLowerCase();
  const modelId = (item.id ?? item.name ?? "").toLowerCase();

  if (capabilityClass === "embedding") {
    return modality?.includes("embedding") ?? modelId.includes("embedding");
  }
  if (capabilityClass === "image_generation" || capabilityClass === "image_editing") {
    return modality?.includes("image") ?? modelId.includes("image");
  }
  if (capabilityClass === "vision_analysis") {
    return modality?.includes("vision") ?? modelId.includes("vision");
  }
  return true;
};

const discoverOpenRouterModels = async (
  capabilityClass: CapabilityClass,
  resolveEndpoint: (defaultEndpoint: string, envKey: string) => string,
  requireApiKey: () => string,
  requestJson: <T>(url: string, options?: RequestJsonOptions, context?: ProviderRequestContext) => Promise<T>,
  defaultDescriptor: (modelId: string, metadata?: Record<string, unknown>) => ProviderModelDescriptor,
  fallbackModelId: string
): Promise<ProviderModelDescriptor[]> => {
  try {
    const endpoint = resolveEndpoint("https://openrouter.ai/api/v1", "OPENROUTER_BASE_URL");
    const apiKey = requireApiKey();
    const response = await requestJson<OpenRouterModelCatalogResponse>(`${endpoint}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(process.env.OPENROUTER_REFERER ? { "HTTP-Referer": process.env.OPENROUTER_REFERER } : {})
      }
    });

    const descriptors = (response.data ?? [])
      .filter((item) => typeof item.id === "string" && item.id.trim().length > 0)
      .filter((item) => openRouterSupportsCapability(item, capabilityClass))
      .map((item) => ({
        ...defaultDescriptor(item.id!, {
          displayName: item.name ?? item.id,
          family: capabilityClass,
          providerDiscovery: "openrouter",
          ...(item.top_provider?.id ? { topProviderId: item.top_provider.id } : {}),
          ...(item.pricing
            ? {
                pricing: {
                  input: item.pricing.input ?? item.pricing.prompt,
                  output: item.pricing.output ?? item.pricing.completion
                }
              }
            : {})
        }),
        ...(item.context_length !== undefined ? { contextWindow: item.context_length } : {})
      }));

    if (descriptors.length > 0) {
      return descriptors;
    }
  } catch (error) {
    console.warn("OpenRouter model discovery fallback", {
      capabilityClass,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return [defaultDescriptor(fallbackModelId, { family: capabilityClass, providerDiscovery: "fallback" })];
};

export class OpenRouterChatProvider extends BaseProviderAdapter<"chat_reasoning"> implements ChatReasoningProvider {
  provider = "openrouter" as const;
  capabilityClass = "chat_reasoning" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return discoverOpenRouterModels(
      this.capabilityClass,
      this.resolveEndpoint.bind(this),
      () => this.requireApiKey(),
      this.requestJson.bind(this),
      this.defaultDescriptor.bind(this),
      "openrouter-chat-default"
    );
  }

  async run(request: Parameters<ChatReasoningProvider["run"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://openrouter.ai/api/v1", "OPENROUTER_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = "openrouter-chat-default";
    const runtime = this.withContext(context);

    const response = await this.requestJson<OpenRouterChatResponse>(
      `${endpoint}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(process.env.OPENROUTER_REFERER ? { "HTTP-Referer": process.env.OPENROUTER_REFERER } : {})
        },
        body: {
          model,
          messages: [
            ...(request.systemPrompt ? [{ role: "system", content: request.systemPrompt }] : []),
            { role: "user", content: request.prompt }
          ],
          ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {})
        }
      },
      runtime
    );

    return {
      outputText: this.normalizeOpenAIContent(response.choices?.[0]?.message?.content),
      modelId: response.model ?? model,
      tokenUsage: {
        input: response.usage?.prompt_tokens ?? 0,
        output: response.usage?.completion_tokens ?? 0
      }
    };
  }

  async healthcheck() {
    try {
      const startedAt = Date.now();
      const endpoint = this.resolveEndpoint("https://openrouter.ai/api/v1", "OPENROUTER_BASE_URL");
      const apiKey = this.requireApiKey();
      await this.requestJson<{ data?: unknown[] }>(
        `${endpoint}/models`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` }
        }
      );
      return this.providerHealthyStatus(Date.now() - startedAt);
    } catch (error) {
      return this.providerDownStatus(error, "OpenRouter healthcheck failed");
    }
  }
}

export class OpenRouterCodingProvider extends BaseProviderAdapter<"coding"> implements CodingProvider {
  provider = "openrouter" as const;
  capabilityClass = "coding" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return discoverOpenRouterModels(
      this.capabilityClass,
      this.resolveEndpoint.bind(this),
      () => this.requireApiKey(),
      this.requestJson.bind(this),
      this.defaultDescriptor.bind(this),
      "openrouter-coding-default"
    );
  }

  async run(request: Parameters<CodingProvider["run"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://openrouter.ai/api/v1", "OPENROUTER_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = "openrouter-coding-default";
    const runtime = this.withContext(context);
    const requestText = request.codeContext
      ? `${request.prompt}\n\nCode context:\n${request.codeContext}`
      : request.prompt;

    const response = await this.requestJson<OpenRouterChatResponse>(
      `${endpoint}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(process.env.OPENROUTER_REFERER ? { "HTTP-Referer": process.env.OPENROUTER_REFERER } : {})
        },
        body: {
          model,
          messages: [
            ...(request.systemPrompt ? [{ role: "system", content: request.systemPrompt }] : []),
            { role: "user", content: requestText }
          ],
          ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {})
        }
      },
      runtime
    );

    return {
      outputText: this.normalizeOpenAIContent(response.choices?.[0]?.message?.content),
      modelId: response.model ?? model,
      tokenUsage: {
        input: response.usage?.prompt_tokens ?? 0,
        output: response.usage?.completion_tokens ?? 0
      }
    };
  }

  async healthcheck() {
    try {
      const startedAt = Date.now();
      const endpoint = this.resolveEndpoint("https://openrouter.ai/api/v1", "OPENROUTER_BASE_URL");
      const apiKey = this.requireApiKey();
      await this.requestJson<{ data?: unknown[] }>(
        `${endpoint}/models`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` }
        }
      );
      return this.providerHealthyStatus(Date.now() - startedAt);
    } catch (error) {
      return this.providerDownStatus(error, "OpenRouter coding healthcheck failed");
    }
  }
}
