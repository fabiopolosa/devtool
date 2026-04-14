import type {
  ChatReasoningProvider,
  CodingProvider,
  EmbeddingProvider,
  ProviderModelDescriptor,
  ProviderRequestContext,
  VisionAnalysisProvider
} from "@cp/domain";
import { BaseProviderAdapter } from "./base-provider.js";

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

interface GeminiEmbedResponse {
  embedding?: {
    values?: number[];
  };
}

export class GeminiChatProvider extends BaseProviderAdapter<"chat_reasoning"> implements ChatReasoningProvider {
  provider = "gemini" as const;
  capabilityClass = "chat_reasoning" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return [this.defaultDescriptor("gemini-2.5-pro", { family: "reasoning" })];
  }

  async run(request: Parameters<ChatReasoningProvider["run"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://generativelanguage.googleapis.com/v1beta", "GEMINI_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = "gemini-2.5-pro";
    const runtime = this.withContext(context);

    const response = await this.requestJson<GeminiGenerateResponse>(
      `${endpoint}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        body: {
          ...(request.systemPrompt ? { systemInstruction: { parts: [{ text: request.systemPrompt }] } } : {}),
          contents: [{ role: "user", parts: [{ text: request.prompt }] }],
          generationConfig: {
            ...(request.maxTokens !== undefined ? { maxOutputTokens: request.maxTokens } : {}),
            ...(request.temperature !== undefined ? { temperature: request.temperature } : {})
          }
        }
      },
      runtime
    );

    const outputText = response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ?? "";
    return {
      outputText,
      modelId: model,
      tokenUsage: {
        input: response.usageMetadata?.promptTokenCount ?? 0,
        output: response.usageMetadata?.candidatesTokenCount ?? 0
      }
    };
  }

  async healthcheck() {
    try {
      const startedAt = Date.now();
      const endpoint = this.resolveEndpoint("https://generativelanguage.googleapis.com/v1beta", "GEMINI_BASE_URL");
      const apiKey = this.requireApiKey();
      await this.requestJson<{ models?: unknown[] }>(
        `${endpoint}/models?key=${encodeURIComponent(apiKey)}`,
        { method: "GET" }
      );
      return this.providerHealthyStatus(Date.now() - startedAt);
    } catch (error) {
      return this.providerDownStatus(error, "Gemini healthcheck failed");
    }
  }
}

export class GeminiCodingProvider extends BaseProviderAdapter<"coding"> implements CodingProvider {
  provider = "gemini" as const;
  capabilityClass = "coding" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return [this.defaultDescriptor("gemini-2.5-pro-coding", { family: "coding" })];
  }

  async run(request: Parameters<CodingProvider["run"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://generativelanguage.googleapis.com/v1beta", "GEMINI_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = "gemini-2.5-pro";
    const runtime = this.withContext(context);
    const prompt = request.codeContext
      ? `${request.prompt}\n\nCode context:\n${request.codeContext}`
      : request.prompt;

    const response = await this.requestJson<GeminiGenerateResponse>(
      `${endpoint}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        body: {
          ...(request.systemPrompt ? { systemInstruction: { parts: [{ text: request.systemPrompt }] } } : {}),
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            ...(request.maxTokens !== undefined ? { maxOutputTokens: request.maxTokens } : {}),
            ...(request.temperature !== undefined ? { temperature: request.temperature } : {})
          }
        }
      },
      runtime
    );

    const outputText = response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ?? "";
    return {
      outputText,
      modelId: model,
      tokenUsage: {
        input: response.usageMetadata?.promptTokenCount ?? 0,
        output: response.usageMetadata?.candidatesTokenCount ?? 0
      }
    };
  }

  async healthcheck() {
    try {
      const startedAt = Date.now();
      const endpoint = this.resolveEndpoint("https://generativelanguage.googleapis.com/v1beta", "GEMINI_BASE_URL");
      const apiKey = this.requireApiKey();
      await this.requestJson<{ models?: unknown[] }>(
        `${endpoint}/models?key=${encodeURIComponent(apiKey)}`,
        { method: "GET" }
      );
      return this.providerHealthyStatus(Date.now() - startedAt);
    } catch (error) {
      return this.providerDownStatus(error, "Gemini coding healthcheck failed");
    }
  }
}

export class GeminiEmbeddingProvider extends BaseProviderAdapter<"embedding"> implements EmbeddingProvider {
  provider = "gemini" as const;
  capabilityClass = "embedding" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return [this.defaultDescriptor("gemini-embedding-001", { dimensions: 3072 })];
  }

  async embed(request: Parameters<EmbeddingProvider["embed"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://generativelanguage.googleapis.com/v1beta", "GEMINI_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = request.modelId ?? "gemini-embedding-001";
    const runtime = this.withContext(context);
    const vectors: number[][] = [];

    for (const text of request.texts) {
      const response = await this.requestJson<GeminiEmbedResponse>(
        `${endpoint}/models/${model}:embedContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          body: {
            content: {
              role: "user",
              parts: [{ text }]
            }
          }
        },
        runtime
      );
      vectors.push(response.embedding?.values ?? []);
    }

    return {
      vectors,
      dimensions: vectors[0]?.length ?? 0,
      modelId: model
    };
  }

  async healthcheck() {
    try {
      const startedAt = Date.now();
      const endpoint = this.resolveEndpoint("https://generativelanguage.googleapis.com/v1beta", "GEMINI_BASE_URL");
      const apiKey = this.requireApiKey();
      await this.requestJson<GeminiEmbedResponse>(
        `${endpoint}/models/gemini-embedding-001:embedContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          body: { content: { role: "user", parts: [{ text: "healthcheck" }] } }
        }
      );
      return this.providerHealthyStatus(Date.now() - startedAt);
    } catch (error) {
      return this.providerDownStatus(error, "Gemini embedding healthcheck failed");
    }
  }
}

export class GeminiVisionProvider extends BaseProviderAdapter<"vision_analysis"> implements VisionAnalysisProvider {
  provider = "gemini" as const;
  capabilityClass = "vision_analysis" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return [this.defaultDescriptor("gemini-2.5-pro-vision", { family: "vision_analysis" })];
  }

  async analyze(request: Parameters<VisionAnalysisProvider["analyze"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://generativelanguage.googleapis.com/v1beta", "GEMINI_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = "gemini-2.5-pro";
    const runtime = this.withContext(context);

    const response = await this.requestJson<GeminiGenerateResponse>(
      `${endpoint}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        body: {
          contents: [
            {
              role: "user",
              parts: [
                { text: request.prompt },
                { inlineData: { mimeType: "image/png", data: request.imageBase64 } }
              ]
            }
          ]
        } as Record<string, unknown>
      },
      runtime
    );

    const analysis = response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ?? "";
    return { analysis, modelId: model };
  }

  async healthcheck() {
    try {
      const startedAt = Date.now();
      const endpoint = this.resolveEndpoint("https://generativelanguage.googleapis.com/v1beta", "GEMINI_BASE_URL");
      const apiKey = this.requireApiKey();
      await this.requestJson<{ models?: unknown[] }>(
        `${endpoint}/models?key=${encodeURIComponent(apiKey)}`,
        { method: "GET" }
      );
      return this.providerHealthyStatus(Date.now() - startedAt);
    } catch (error) {
      return this.providerDownStatus(error, "Gemini vision healthcheck failed");
    }
  }
}
