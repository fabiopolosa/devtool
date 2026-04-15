import type { ChatReasoningProvider, CodingProvider, ProviderModelDescriptor, ProviderRequestContext } from "@cp/domain";
import { BaseProviderAdapter } from "./base-provider.js";

interface AnthropicMessageResponse {
  model?: string;
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class AnthropicChatProvider extends BaseProviderAdapter<"chat_reasoning"> implements ChatReasoningProvider {
  provider = "anthropic" as const;
  capabilityClass = "chat_reasoning" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return [this.defaultDescriptor("claude-opus-4.1", { family: "reasoning" })];
  }

  async run(request: Parameters<ChatReasoningProvider["run"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://api.anthropic.com/v1", "ANTHROPIC_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = "claude-opus-4.1";
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
    return [this.defaultDescriptor("claude-sonnet-4.5", { family: "coding" })];
  }

  async run(request: Parameters<CodingProvider["run"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://api.anthropic.com/v1", "ANTHROPIC_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = "claude-sonnet-4.5";
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
