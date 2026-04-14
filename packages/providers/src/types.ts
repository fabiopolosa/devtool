import type {
  CapabilityClass,
  ProviderName,
  ProviderModelDescriptor,
  ProviderRequestContext,
  ProviderHealthStatus,
  ChatReasoningRequest,
  ChatReasoningResponse,
  CodingRequest,
  EmbeddingRequest,
  EmbeddingResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageEditingRequest,
  ImageEditingResponse,
  VisionAnalysisRequest,
  VisionAnalysisResponse
} from "@cp/domain";

export type {
  CapabilityClass,
  ProviderName,
  ProviderModelDescriptor,
  ProviderRequestContext,
  ProviderHealthStatus,
  ChatReasoningRequest,
  ChatReasoningResponse,
  CodingRequest,
  EmbeddingRequest,
  EmbeddingResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageEditingRequest,
  ImageEditingResponse,
  VisionAnalysisRequest,
  VisionAnalysisResponse
};

export type ProviderCapabilityMap = {
  chat_reasoning: ChatReasoningResponse;
  coding: ChatReasoningResponse;
  embedding: EmbeddingResponse;
  image_generation: ImageGenerationResponse;
  image_editing: ImageEditingResponse;
  vision_analysis: VisionAnalysisResponse;
};

export type ProviderRequestMap = {
  chat_reasoning: ChatReasoningRequest;
  coding: CodingRequest;
  embedding: EmbeddingRequest;
  image_generation: ImageGenerationRequest;
  image_editing: ImageEditingRequest;
  vision_analysis: VisionAnalysisRequest;
};

export interface ProviderRuntime<TCapability extends CapabilityClass> {
  provider: ProviderName;
  capabilityClass: TCapability;
  discoverModels(): Promise<ProviderModelDescriptor[]>;
  healthcheck(): Promise<ProviderHealthStatus>;
}
