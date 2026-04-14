import type {
  ChatReasoningProvider,
  CodingProvider,
  EmbeddingProvider,
  ImageEditingProvider,
  ImageGenerationProvider,
  VisionAnalysisProvider,
  ProviderModelDescriptor,
  ProviderRequestContext
} from "@cp/domain";
import { BaseProviderAdapter } from "./base-provider.js";

interface OpenAIChatCompletionResponse {
  model?: string;
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
  model?: string;
}

interface OpenAIImageResponse {
  data?: Array<{ b64_json?: string }>;
}

export class OpenAIChatProvider extends BaseProviderAdapter<"chat_reasoning"> implements ChatReasoningProvider {
  provider = "openai" as const;
  capabilityClass = "chat_reasoning" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return [this.defaultDescriptor("gpt-5.1", { contextWindow: 256000, family: "reasoning" })];
  }

  async run(request: Parameters<ChatReasoningProvider["run"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://api.openai.com/v1", "OPENAI_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = "gpt-5.1";
    const runtime = this.withContext(context);

    const response = await this.requestJson<OpenAIChatCompletionResponse>(
      `${endpoint}/chat/completions`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
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
      const endpoint = this.resolveEndpoint("https://api.openai.com/v1", "OPENAI_BASE_URL");
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
      return this.providerDownStatus(error, "OpenAI healthcheck failed");
    }
  }
}

export class OpenAICodingProvider extends BaseProviderAdapter<"coding"> implements CodingProvider {
  provider = "openai" as const;
  capabilityClass = "coding" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return [this.defaultDescriptor("gpt-5.1-codex", { contextWindow: 256000, family: "coding" })];
  }

  async run(request: Parameters<CodingProvider["run"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://api.openai.com/v1", "OPENAI_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = "gpt-5.1-codex";
    const runtime = this.withContext(context);
    const prompt = request.codeContext
      ? `${request.prompt}\n\nCode context:\n${request.codeContext}`
      : request.prompt;

    const response = await this.requestJson<OpenAIChatCompletionResponse>(
      `${endpoint}/chat/completions`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: {
          model,
          messages: [
            ...(request.systemPrompt ? [{ role: "system", content: request.systemPrompt }] : []),
            { role: "user", content: prompt }
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
      const endpoint = this.resolveEndpoint("https://api.openai.com/v1", "OPENAI_BASE_URL");
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
      return this.providerDownStatus(error, "OpenAI coding healthcheck failed");
    }
  }
}

export class OpenAIEmbeddingProvider extends BaseProviderAdapter<"embedding"> implements EmbeddingProvider {
  provider = "openai" as const;
  capabilityClass = "embedding" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return [this.defaultDescriptor("text-embedding-3-large", { dimensions: 3072 })];
  }

  async embed(request: Parameters<EmbeddingProvider["embed"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://api.openai.com/v1", "OPENAI_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = request.modelId ?? "text-embedding-3-large";
    const runtime = this.withContext(context);

    const response = await this.requestJson<OpenAIEmbeddingResponse>(
      `${endpoint}/embeddings`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: {
          model,
          input: request.texts
        }
      },
      runtime
    );

    const vectors = (response.data ?? []).map((item) => item.embedding ?? []);
    const dimensions = vectors[0]?.length ?? 0;

    return {
      vectors,
      dimensions,
      modelId: response.model ?? model
    };
  }

  async healthcheck() {
    try {
      const startedAt = Date.now();
      const endpoint = this.resolveEndpoint("https://api.openai.com/v1", "OPENAI_BASE_URL");
      const apiKey = this.requireApiKey();
      await this.requestJson<OpenAIEmbeddingResponse>(
        `${endpoint}/embeddings`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: {
            model: "text-embedding-3-small",
            input: ["healthcheck"]
          }
        }
      );
      return this.providerHealthyStatus(Date.now() - startedAt);
    } catch (error) {
      return this.providerDownStatus(error, "OpenAI embedding healthcheck failed");
    }
  }
}

export class OpenAIImageGenerationProvider extends BaseProviderAdapter<"image_generation"> implements ImageGenerationProvider {
  provider = "openai" as const;
  capabilityClass = "image_generation" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return [this.defaultDescriptor("gpt-image-1", { family: "image_generation" })];
  }

  async generate(request: Parameters<ImageGenerationProvider["generate"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://api.openai.com/v1", "OPENAI_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = "gpt-image-1";
    const runtime = this.withContext(context);

    const size = request.width && request.height ? `${request.width}x${request.height}` : undefined;
    const response = await this.requestJson<OpenAIImageResponse>(
      `${endpoint}/images/generations`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: {
          model,
          prompt: request.prompt,
          ...(size ? { size } : {}),
          ...(request.style ? { style: request.style } : {})
        }
      },
      runtime
    );

    return {
      images: (response.data ?? [])
        .map((item) => item.b64_json)
        .filter((value): value is string => typeof value === "string")
        .map((dataBase64) => ({ mimeType: "image/png", dataBase64 })),
      modelId: model
    };
  }

  async healthcheck() {
    try {
      const startedAt = Date.now();
      const endpoint = this.resolveEndpoint("https://api.openai.com/v1", "OPENAI_BASE_URL");
      const apiKey = this.requireApiKey();
      await this.requestJson<{ data?: unknown[] }>(
        `${endpoint}/models`,
        { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } }
      );
      return this.providerHealthyStatus(Date.now() - startedAt);
    } catch (error) {
      return this.providerDownStatus(error, "OpenAI image generation healthcheck failed");
    }
  }
}

export class OpenAIImageEditingProvider extends BaseProviderAdapter<"image_editing"> implements ImageEditingProvider {
  provider = "openai" as const;
  capabilityClass = "image_editing" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return [this.defaultDescriptor("gpt-image-1-edit", { family: "image_editing" })];
  }

  async edit(request: Parameters<ImageEditingProvider["edit"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://api.openai.com/v1", "OPENAI_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = "gpt-image-1";
    const runtime = this.withContext(context);

    const response = await this.requestJson<OpenAIImageResponse>(
      `${endpoint}/images/edits`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: {
          model,
          prompt: request.prompt,
          image: request.imageBase64,
          ...(request.maskBase64 ? { mask: request.maskBase64 } : {})
        }
      },
      runtime
    );

    return {
      images: (response.data ?? [])
        .map((item) => item.b64_json)
        .filter((value): value is string => typeof value === "string")
        .map((dataBase64) => ({ mimeType: "image/png", dataBase64 })),
      modelId: model
    };
  }

  async healthcheck() {
    try {
      const startedAt = Date.now();
      const endpoint = this.resolveEndpoint("https://api.openai.com/v1", "OPENAI_BASE_URL");
      const apiKey = this.requireApiKey();
      await this.requestJson<{ data?: unknown[] }>(
        `${endpoint}/models`,
        { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } }
      );
      return this.providerHealthyStatus(Date.now() - startedAt);
    } catch (error) {
      return this.providerDownStatus(error, "OpenAI image editing healthcheck failed");
    }
  }
}

export class OpenAIVisionProvider extends BaseProviderAdapter<"vision_analysis"> implements VisionAnalysisProvider {
  provider = "openai" as const;
  capabilityClass = "vision_analysis" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return [this.defaultDescriptor("gpt-5.1-vision", { family: "vision_analysis" })];
  }

  async analyze(request: Parameters<VisionAnalysisProvider["analyze"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://api.openai.com/v1", "OPENAI_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = "gpt-5.1-vision";
    const runtime = this.withContext(context);

    const response = await this.requestJson<OpenAIChatCompletionResponse>(
      `${endpoint}/chat/completions`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: {
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: request.prompt },
                {
                  type: "image_url",
                  image_url: { url: `data:image/png;base64,${request.imageBase64}` }
                }
              ]
            }
          ]
        }
      },
      runtime
    );

    return {
      analysis: this.normalizeOpenAIContent(response.choices?.[0]?.message?.content),
      modelId: response.model ?? model
    };
  }

  async healthcheck() {
    try {
      const startedAt = Date.now();
      const endpoint = this.resolveEndpoint("https://api.openai.com/v1", "OPENAI_BASE_URL");
      const apiKey = this.requireApiKey();
      await this.requestJson<{ data?: unknown[] }>(
        `${endpoint}/models`,
        { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } }
      );
      return this.providerHealthyStatus(Date.now() - startedAt);
    } catch (error) {
      return this.providerDownStatus(error, "OpenAI vision healthcheck failed");
    }
  }
}
