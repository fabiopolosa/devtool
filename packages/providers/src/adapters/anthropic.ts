import type { ChatReasoningProvider, CodingProvider, ProviderModelDescriptor, ProviderRequestContext, CapabilityClass } from "@cp/domain";
import { BaseProviderAdapter, type RequestJsonOptions } from "./base-provider.js";

interface AnthropicMessageResponse {
  model?: string;
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface AnthropicModelCatalogItem {
  id?: string;
  display_name?: string;
  context_window?: number;
  max_tokens?: number;
  type?: string;
}

interface AnthropicModelCatalogResponse {
  data?: AnthropicModelCatalogItem[];
}

const discoverAnthropicModels = async (
  capabilityClass: CapabilityClass,
  resolveEndpoint: (defaultEndpoint: string, envKey: string) => string,
  requireApiKey: () => string,
  requestJson: <T>(url: string, options?: RequestJsonOptions, context?: ProviderRequestContext) => Promise<T>,
  defaultDescriptor: (modelId: string, metadata?: Record<string, unknown>) => ProviderModelDescriptor,
  fallbackModelId: string
): Promise<ProviderModelDescriptor[]> => {
  try {
    const endpoint = resolveEndpoint("https://api.anthropic.com/v1", "ANTHROPIC_BASE_URL");
    const apiKey = requireApiKey();
    const response = await requestJson<AnthropicModelCatalogResponse>(`${endpoint}/models`, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      }
    });

    const descriptors = (response.data ?? [])
      .filter((item) => typeof item.id === "string" && item.id.trim().length > 0)
      .map((item) => ({
        ...defaultDescriptor(item.id!, {
          displayName: item.display_name ?? item.id,
          family: capabilityClass,
          providerDiscovery: "anthropic",
          ...(item.type ? { type: item.type } : {})
        }),
        ...(item.context_window !== undefined ? { contextWindow: item.context_window } : {}),
        ...(item.max_tokens !== undefined ? { maxOutputTokens: item.max_tokens } : {})
      }));

    if (descriptors.length > 0) {
      return descriptors;
    }
  } catch (error) {
    console.warn("Anthropic model discovery fallback", {
      capabilityClass,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return [defaultDescriptor(fallbackModelId, { family: capabilityClass, providerDiscovery: "fallback" })];
};

export class AnthropicChatProvider extends BaseProviderAdapter<"chat_reasoning"> implements ChatReasoningProvider {
  provider = "anthropic" as const;
  capabilityClass = "chat_reasoning" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return discoverAnthropicModels(
      this.capabilityClass,
      this.resolveEndpoint.bind(this),
      () => this.requireApiKey(),
      this.requestJson.bind(this),
      this.defaultDescriptor.bind(this),
      "claude-opus-4.1"
    );
  }

  async run(request: Parameters<ChatReasoningProvider["run"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://api.anthropic.com/v1", "ANTHROPIC_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = request.modelId ?? "claude-opus-4.1";
    const runtime = this.withContext(context);

    const response = await this.requestJson<AnthropicMessageResponse>(
      `${endpoint}/messages`,
      {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: {
          model,
          max_tokens: request.maxTokens ?? 1024,
          ...(request.systemPrompt ? { system: request.systemPrompt } : {}),
          messages: [{ role: "user", content: request.prompt }]
        }
      },
      runtime
    );

    const outputText = (response.content ?? [])
      .map((item) => (item.type === "text" ? (item.text ?? "") : ""))
      .join("\n")
      .trim();

    return {
      outputText,
      modelId: response.model ?? model,
      tokenUsage: {
        input: response.usage?.input_tokens ?? 0,
        output: response.usage?.output_tokens ?? 0
      }
    };
  }

  async healthcheck() {
    try {
      const startedAt = Date.now();
      const endpoint = this.resolveEndpoint("https://api.anthropic.com/v1", "ANTHROPIC_BASE_URL");
      const apiKey = this.requireApiKey();
      await this.requestJson<{ data?: unknown[] }>(
        `${endpoint}/models`,
        {
          method: "GET",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01"
          }
        }
      );
      return this.providerHealthyStatus(Date.now() - startedAt);
    } catch (error) {
      return this.providerDownStatus(error, "Anthropic healthcheck failed");
    }
  }
}

export class AnthropicCodingProvider extends BaseProviderAdapter<"coding"> implements CodingProvider {
  provider = "anthropic" as const;
  capabilityClass = "coding" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return discoverAnthropicModels(
      this.capabilityClass,
      this.resolveEndpoint.bind(this),
      () => this.requireApiKey(),
      this.requestJson.bind(this),
      this.defaultDescriptor.bind(this),
      "claude-sonnet-4.5"
    );
  }

  async run(request: Parameters<CodingProvider["run"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://api.anthropic.com/v1", "ANTHROPIC_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = request.modelId ?? "claude-sonnet-4.5";
    const runtime = this.withContext(context);
    const requestText = request.codeContext
      ? `${request.prompt}\n\nCode context:\n${request.codeContext}`
      : request.prompt;

    const response = await this.requestJson<AnthropicMessageResponse>(
      `${endpoint}/messages`,
      {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: {
          model,
          max_tokens: request.maxTokens ?? 2048,
          ...(request.systemPrompt ? { system: request.systemPrompt } : {}),
          messages: [{ role: "user", content: requestText }]
        }
      },
      runtime
    );

    const outputText = (response.content ?? [])
      .map((item) => (item.type === "text" ? (item.text ?? "") : ""))
      .join("\n")
      .trim();

    return {
      outputText,
      modelId: response.model ?? model,
      tokenUsage: {
        input: response.usage?.input_tokens ?? 0,
        output: response.usage?.output_tokens ?? 0
      }
    };
  }

  async healthcheck() {
    try {
      const startedAt = Date.now();
      const endpoint = this.resolveEndpoint("https://api.anthropic.com/v1", "ANTHROPIC_BASE_URL");
      const apiKey = this.requireApiKey();
      await this.requestJson<{ data?: unknown[] }>(
        `${endpoint}/models`,
        {
          method: "GET",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01"
          }
        }
      );
      return this.providerHealthyStatus(Date.now() - startedAt);
    } catch (error) {
      return this.providerDownStatus(error, "Anthropic coding healthcheck failed");
    }
  }
}
