import type { ChatReasoningProvider, CodingProvider, ProviderModelDescriptor, ProviderRequestContext } from "@cp/domain";
import { BaseProviderAdapter } from "./base-provider.js";

interface OpenRouterChatResponse {
  model?: string;
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenRouterChatProvider extends BaseProviderAdapter<"chat_reasoning"> implements ChatReasoningProvider {
  provider = "openrouter" as const;
  capabilityClass = "chat_reasoning" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return [this.defaultDescriptor("openrouter-chat-default", { family: "reasoning" })];
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
    return [this.defaultDescriptor("openrouter-coding-default", { family: "coding" })];
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
