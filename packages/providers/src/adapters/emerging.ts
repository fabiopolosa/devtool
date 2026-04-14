import type {
  ChatReasoningProvider,
  ChatReasoningRequest,
  ChatReasoningResponse,
  CodingProvider,
  CodingRequest,
  ProviderHealthStatus,
  ProviderModelDescriptor,
  ProviderName,
  ProviderRequestContext
} from "@cp/domain";
import { BaseProviderAdapter } from "./base-provider.js";

interface CatalogProviderDefinition {
  provider: ProviderName;
  modelIds: string[];
  endpointEnvKey: string;
  defaultEndpoint: string;
}

const catalogDefinitions: CatalogProviderDefinition[] = [
  {
    provider: "mistral",
    modelIds: ["mistral-large-latest", "mistral-medium-latest", "codestral-latest"],
    endpointEnvKey: "MISTRAL_API_ENDPOINT",
    defaultEndpoint: "https://api.mistral.ai/v1"
  },
  {
    provider: "cohere",
    modelIds: ["command-r-plus", "command-r", "command-a"],
    endpointEnvKey: "COHERE_API_ENDPOINT",
    defaultEndpoint: "https://api.cohere.com/v1"
  },
  {
    provider: "ai21",
    modelIds: ["jamba-1.5-large", "jamba-1.5-mini"],
    endpointEnvKey: "AI21_API_ENDPOINT",
    defaultEndpoint: "https://api.ai21.com/studio/v1"
  },
  {
    provider: "zhipu",
    modelIds: ["glm-4-plus", "glm-4-air"],
    endpointEnvKey: "ZHIPU_API_ENDPOINT",
    defaultEndpoint: "https://open.bigmodel.cn/api/paas/v4"
  },
  {
    provider: "meta_llama",
    modelIds: ["llama-4-maverick", "llama-4-scout"],
    endpointEnvKey: "META_LLAMA_API_ENDPOINT",
    defaultEndpoint: "https://api.llama.com/compat/v1"
  },
  {
    provider: "databricks_dbrx",
    modelIds: ["databricks-dbrx-instruct", "databricks-meta-llama-3-70b-instruct"],
    endpointEnvKey: "DATABRICKS_API_ENDPOINT",
    defaultEndpoint: "https://dbc-a1b2345c-d6e7.cloud.databricks.com/serving-endpoints"
  },
  {
    provider: "xai",
    modelIds: ["grok-3", "grok-3-mini"],
    endpointEnvKey: "XAI_API_ENDPOINT",
    defaultEndpoint: "https://api.x.ai/v1"
  },
  {
    provider: "amazon_bedrock",
    modelIds: ["amazon.nova-pro-v1:0", "anthropic.claude-3-7-sonnet-20250219-v1:0"],
    endpointEnvKey: "AWS_BEDROCK_ENDPOINT",
    defaultEndpoint: "https://bedrock-runtime.us-east-1.amazonaws.com"
  },
  {
    provider: "aleph_alpha",
    modelIds: ["luminous-supreme-control", "luminous-extended"],
    endpointEnvKey: "ALEPH_ALPHA_API_ENDPOINT",
    defaultEndpoint: "https://api.aleph-alpha.com"
  }
];

const chatCompletionBody = (request: ChatReasoningRequest, modelId: string) => ({
  model: modelId,
  messages: [
    ...(request.systemPrompt ? [{ role: "system", content: request.systemPrompt }] : []),
    { role: "user", content: request.prompt }
  ],
  max_tokens: request.maxTokens ?? 512,
  temperature: request.temperature ?? 0.2
});

abstract class CatalogTextProviderBase<TCapability extends "chat_reasoning" | "coding">
  extends BaseProviderAdapter<TCapability>
{
  readonly provider: ProviderName;
  readonly capabilityClass: TCapability;

  protected constructor(
    definition: CatalogProviderDefinition,
    capabilityClass: TCapability,
    private readonly defaultModelId: string
  ) {
    super();
    this.provider = definition.provider;
    this.capabilityClass = capabilityClass;
    this.definition = definition;
  }

  private readonly definition: CatalogProviderDefinition;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return this.definition.modelIds.map((modelId) =>
      this.defaultDescriptor(modelId, {
        source: "catalog",
        endpoint: this.resolveEndpoint(this.definition.defaultEndpoint, this.definition.endpointEnvKey)
      })
    );
  }

  async healthcheck(): Promise<ProviderHealthStatus> {
    const apiKey = this.requireApiKey();
    const endpoint = this.resolveEndpoint(this.definition.defaultEndpoint, this.definition.endpointEnvKey);
    const started = Date.now();

    try {
      await this.requestJson<Record<string, unknown>>(
        `${endpoint.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: {
            model: this.defaultModelId,
            messages: [{ role: "user", content: "health" }],
            max_tokens: 1,
            temperature: 0
          },
          timeoutMs: 8000
        }
      );

      return this.providerHealthyStatus(Date.now() - started);
    } catch (error) {
      return this.providerDownStatus(error, `Provider ${this.provider} healthcheck failed`);
    }
  }

  async run(
    request: ChatReasoningRequest | CodingRequest,
    context: ProviderRequestContext
  ): Promise<ChatReasoningResponse> {
    const scopedContext = this.withContext(context);
    const endpoint = this.resolveEndpoint(this.definition.defaultEndpoint, this.definition.endpointEnvKey);
    const apiKey = this.requireApiKey();
    const response = await this.requestJson<{
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    }>(
      `${endpoint.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: chatCompletionBody(request, this.defaultModelId),
        ...(scopedContext.timeoutMs ? { timeoutMs: scopedContext.timeoutMs } : {})
      },
      scopedContext
    );

    const firstChoice = response.choices?.[0]?.message?.content;
    return {
      outputText: this.normalizeOpenAIContent(firstChoice),
      modelId: this.defaultModelId,
      ...(response.usage
        ? {
            tokenUsage: {
              input: response.usage.prompt_tokens ?? 0,
              output: response.usage.completion_tokens ?? 0
            }
          }
        : {})
    };
  }

  async embed(): Promise<never> {
    throw new Error(`Embedding is not supported by ${this.provider} catalog adapter`);
  }

  async generate(): Promise<never> {
    throw new Error(`Image generation is not supported by ${this.provider} catalog adapter`);
  }

  async edit(): Promise<never> {
    throw new Error(`Image editing is not supported by ${this.provider} catalog adapter`);
  }

  async analyze(): Promise<never> {
    throw new Error(`Vision analysis is not supported by ${this.provider} catalog adapter`);
  }
}

class CatalogChatProvider
  extends CatalogTextProviderBase<"chat_reasoning">
  implements ChatReasoningProvider
{
  constructor(definition: CatalogProviderDefinition, defaultModelId: string) {
    super(definition, "chat_reasoning", defaultModelId);
  }
}

class CatalogCodingProvider
  extends CatalogTextProviderBase<"coding">
  implements CodingProvider
{
  constructor(definition: CatalogProviderDefinition, defaultModelId: string) {
    super(definition, "coding", defaultModelId);
  }
}

export const createEmergingCatalogProviders = (): Array<ChatReasoningProvider | CodingProvider> => {
  const providers: Array<ChatReasoningProvider | CodingProvider> = [];
  for (const definition of catalogDefinitions) {
    const primaryModel = definition.modelIds[0];
    if (!primaryModel) continue;
    providers.push(new CatalogChatProvider(definition, primaryModel));
    providers.push(new CatalogCodingProvider(definition, primaryModel));
  }
  return providers;
};

export const emergingProviderCatalog = catalogDefinitions;
