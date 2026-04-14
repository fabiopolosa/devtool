import {
  AnthropicChatProvider,
  AnthropicCodingProvider,
  GeminiChatProvider,
  GeminiCodingProvider,
  GeminiEmbeddingProvider,
  GeminiVisionProvider,
  KieAIImageEditingProvider,
  KieAIImageGenerationProvider,
  KieAIVisionProvider,
  OpenAIChatProvider,
  OpenAICodingProvider,
  OpenAIEmbeddingProvider,
  OpenAIImageEditingProvider,
  OpenAIImageGenerationProvider,
  OpenAIVisionProvider,
  OpenRouterChatProvider,
  OpenRouterCodingProvider
} from "../adapters/index.js";
import { ProviderRegistry } from "./provider-registry.js";

export function createDefaultProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.registerMany([
    new OpenAIChatProvider(),
    new OpenAICodingProvider(),
    new OpenAIEmbeddingProvider(),
    new OpenAIImageGenerationProvider(),
    new OpenAIImageEditingProvider(),
    new OpenAIVisionProvider(),
    new AnthropicChatProvider(),
    new AnthropicCodingProvider(),
    new GeminiChatProvider(),
    new GeminiCodingProvider(),
    new GeminiEmbeddingProvider(),
    new GeminiVisionProvider(),
    new OpenRouterChatProvider(),
    new OpenRouterCodingProvider(),
    new KieAIImageGenerationProvider(),
    new KieAIImageEditingProvider(),
    new KieAIVisionProvider()
  ]);
  return registry;
}
