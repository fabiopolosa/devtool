import type {
  ChatReasoningProvider,
  CodingProvider,
  EmbeddingProvider,
  ImageEditingProvider,
  ImageGenerationProvider,
  CapabilityClass,
  VisionAnalysisProvider,
  ProviderModelDescriptor,
  ProviderRequestContext
} from "@cp/domain";
import { BaseProviderAdapter, type RequestJsonOptions } from "./base-provider.js";

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

interface OpenAIModelCatalogItem {
  id?: string;
  display_name?: string;
  context_window?: number;
  max_context_tokens?: number;
  max_output_tokens?: number;
  pricing?: { input?: number; output?: number; prompt?: number; completion?: number };
  input_price?: number;
  output_price?: number;
}

interface OpenAIModelCatalogResponse {
  data?: OpenAIModelCatalogItem[];
}

const openAIModelHints: Record<string, { contextWindow?: number; maxOutputTokens?: number; displayName?: string; family?: string }> = {
  "gpt-5.1": { contextWindow: 256000, maxOutputTokens: 16384, family: "reasoning" },
  "gpt-5.1-codex": { contextWindow: 256000, maxOutputTokens: 16384, family: "coding" },
  "text-embedding-3-large": { contextWindow: 8192, family: "embedding" },
  "text-embedding-3-small": { contextWindow: 8192, family: "embedding" },
  "gpt-image-1": { family: "image_generation" },
  "gpt-image-1-edit": { family: "image_editing" },
  "gpt-5.1-vision": { contextWindow: 256000, family: "vision_analysis" }
};

const matchesOpenAICapability = (modelId: string, capabilityClass: CapabilityClass): boolean => {
  const normalized = modelId.toLowerCase();
  switch (capabilityClass) {
    case "embedding":
      return normalized.includes("embedding");
    case "image_generation":
      return normalized.includes("image");
    case "image_editing":
      return normalized.includes("image") || normalized.includes("edit");
    case "vision_analysis":
      return normalized.includes("vision") || normalized.includes("4o") || normalized.includes("omni");
    case "coding":
      return /codex|code|gpt-5\.1|gpt-4\.1|o\d/.test(normalized) && !normalized.includes("embedding");
    case "chat_reasoning":
      return /gpt|claude|o\d|gemini|llama|mistral|command|grok/.test(normalized) && !normalized.includes("embedding") && !normalized.includes("image");
    default:
      return true;
  }
};

const catalogMetadata = (item: OpenAIModelCatalogItem): Record<string, unknown> => ({
  ...(item.display_name ? { displayName: item.display_name } : {}),
  ...(item.pricing
    ? {
        pricing: {
          input: item.pricing.input ?? item.pricing.prompt ?? item.input_price,
          output: item.pricing.output ?? item.pricing.completion ?? item.output_price
        }
      }
    : item.input_price !== undefined || item.output_price !== undefined
      ? {
          pricing: {
            ...(item.input_price !== undefined ? { input: item.input_price } : {}),
            ...(item.output_price !== undefined ? { output: item.output_price } : {})
          }
        }
      : {})
});

const modelDescriptorFromCatalogItem = (
  capabilityClass: "chat_reasoning" | "coding" | "embedding" | "image_generation" | "image_editing" | "vision_analysis",
  defaultDescriptor: (modelId: string, metadata?: Record<string, unknown>) => ProviderModelDescriptor,
  item: OpenAIModelCatalogItem
): ProviderModelDescriptor | null => {
  if (!item.id || !matchesOpenAICapability(item.id, capabilityClass)) {
    return null;
  }

  const hint = openAIModelHints[item.id] ?? {};
  const contextWindow = item.context_window ?? item.max_context_tokens ?? hint.contextWindow;
  const maxOutputTokens = item.max_output_tokens ?? hint.maxOutputTokens;
  return {
    ...defaultDescriptor(item.id, {
      ...catalogMetadata(item),
      family: hint.family ?? capabilityClass,
      providerDiscovery: "openai"
    }),
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {})
  };
};

const discoverOpenAIModels = async (
  capabilityClass: "chat_reasoning" | "coding" | "embedding" | "image_generation" | "image_editing" | "vision_analysis",
  resolveEndpoint: (defaultEndpoint: string, envKey: string) => string,
  requireApiKey: () => string,
  requestJson: <T>(url: string, options?: RequestJsonOptions, context?: ProviderRequestContext) => Promise<T>,
  defaultDescriptor: (modelId: string, metadata?: Record<string, unknown>) => ProviderModelDescriptor,
  fallbackModelId: string
): Promise<ProviderModelDescriptor[]> => {
  try {
    const endpoint = resolveEndpoint("https://api.openai.com/v1", "OPENAI_BASE_URL");
    const apiKey = requireApiKey();
    const response = await requestJson<OpenAIModelCatalogResponse>(`${endpoint}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` }
    });

    const descriptors = (response.data ?? [])
      .map((item) => modelDescriptorFromCatalogItem(capabilityClass, defaultDescriptor, item))
      .filter((item): item is ProviderModelDescriptor => Boolean(item));

    if (descriptors.length > 0) {
      return descriptors;
    }
  } catch (error) {
    console.warn("OpenAI model discovery fallback", {
      capabilityClass,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return [defaultDescriptor(fallbackModelId, { family: capabilityClass, providerDiscovery: "fallback" })];
};

export class OpenAIChatProvider extends BaseProviderAdapter<"chat_reasoning"> implements ChatReasoningProvider {
  provider = "openai" as const;
  capabilityClass = "chat_reasoning" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return discoverOpenAIModels(
      this.capabilityClass,
      this.resolveEndpoint.bind(this),
      () => this.requireApiKey(),
      this.requestJson.bind(this),
      this.defaultDescriptor.bind(this),
      "gpt-5.1"
    );
  }

  async run(request: Parameters<ChatReasoningProvider["run"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://api.openai.com/v1", "OPENAI_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = request.modelId ?? "gpt-5.1";
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
    return discoverOpenAIModels(
      this.capabilityClass,
      this.resolveEndpoint.bind(this),
      () => this.requireApiKey(),
      this.requestJson.bind(this),
      this.defaultDescriptor.bind(this),
      "gpt-5.1-codex"
    );
  }

  async run(request: Parameters<CodingProvider["run"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://api.openai.com/v1", "OPENAI_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = request.modelId ?? "gpt-5.1-codex";
    const runtime = this.withContext(context);
    const requestText = request.codeContext
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
    return discoverOpenAIModels(
      this.capabilityClass,
      this.resolveEndpoint.bind(this),
      () => this.requireApiKey(),
      this.requestJson.bind(this),
      this.defaultDescriptor.bind(this),
      "text-embedding-3-large"
    );
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
    return discoverOpenAIModels(
      this.capabilityClass,
      this.resolveEndpoint.bind(this),
      () => this.requireApiKey(),
      this.requestJson.bind(this),
      this.defaultDescriptor.bind(this),
      "gpt-image-1"
    );
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
    return discoverOpenAIModels(
      this.capabilityClass,
      this.resolveEndpoint.bind(this),
      () => this.requireApiKey(),
      this.requestJson.bind(this),
      this.defaultDescriptor.bind(this),
      "gpt-image-1-edit"
    );
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
    return discoverOpenAIModels(
      this.capabilityClass,
      this.resolveEndpoint.bind(this),
      () => this.requireApiKey(),
      this.requestJson.bind(this),
      this.defaultDescriptor.bind(this),
      "gpt-5.1-vision"
    );
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
