import type { AgentRoleName, CapabilityClass, ProviderName } from "../capabilities.js";
import type { ID } from "../entities.js";

export interface ProviderRequestContext {
  projectId: ID;
  taskId?: ID;
  runId?: ID;
  role?: AgentRoleName;
  timeoutMs?: number;
}

export interface ProviderModelDescriptor {
  id: ID;
  provider: ProviderName;
  modelId: string;
  capabilityClass: CapabilityClass;
  contextWindow?: number;
  maxOutputTokens?: number;
  metadata?: Record<string, unknown>;
}

export interface ProviderHealthStatus {
  status: "healthy" | "degraded" | "down" | "unknown";
  latencyMs?: number;
  errorRate?: number;
  message?: string;
  checkedAt: string;
}

export interface ChatReasoningRequest {
  prompt: string;
  modelId?: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatReasoningResponse {
  outputText: string;
  modelId: string;
  tokenUsage?: {
    input: number;
    output: number;
  };
}

export interface CodingRequest extends ChatReasoningRequest {
  codeContext?: string;
}

export interface EmbeddingRequest {
  texts: string[];
  modelId?: string;
}

export interface EmbeddingResponse {
  vectors: number[][];
  dimensions: number;
  modelId: string;
}

export interface ImageGenerationRequest {
  prompt: string;
  width?: number;
  height?: number;
  style?: string;
}

export interface ImageGenerationResponse {
  images: { mimeType: string; dataBase64: string }[];
  modelId: string;
}

export interface ImageEditingRequest {
  prompt: string;
  imageBase64: string;
  maskBase64?: string;
  operation?: "edit" | "variation" | "crop" | "adapt";
}

export interface ImageEditingResponse {
  images: { mimeType: string; dataBase64: string }[];
  modelId: string;
}

export interface VisionAnalysisRequest {
  prompt: string;
  imageBase64: string;
}

export interface VisionAnalysisResponse {
  analysis: string;
  modelId: string;
}

export interface BaseCapabilityProvider {
  provider: ProviderName;
  capabilityClass: CapabilityClass;
  discoverModels(): Promise<ProviderModelDescriptor[]>;
  healthcheck(): Promise<ProviderHealthStatus>;
}

export interface ChatReasoningProvider extends BaseCapabilityProvider {
  capabilityClass: "chat_reasoning";
  run(request: ChatReasoningRequest, context: ProviderRequestContext): Promise<ChatReasoningResponse>;
}

export interface CodingProvider extends BaseCapabilityProvider {
  capabilityClass: "coding";
  run(request: CodingRequest, context: ProviderRequestContext): Promise<ChatReasoningResponse>;
}

export interface EmbeddingProvider extends BaseCapabilityProvider {
  capabilityClass: "embedding";
  embed(request: EmbeddingRequest, context: ProviderRequestContext): Promise<EmbeddingResponse>;
}

export interface ImageGenerationProvider extends BaseCapabilityProvider {
  capabilityClass: "image_generation";
  generate(request: ImageGenerationRequest, context: ProviderRequestContext): Promise<ImageGenerationResponse>;
}

export interface ImageEditingProvider extends BaseCapabilityProvider {
  capabilityClass: "image_editing";
  edit(request: ImageEditingRequest, context: ProviderRequestContext): Promise<ImageEditingResponse>;
}

export interface VisionAnalysisProvider extends BaseCapabilityProvider {
  capabilityClass: "vision_analysis";
  analyze(request: VisionAnalysisRequest, context: ProviderRequestContext): Promise<VisionAnalysisResponse>;
}

export type AnyCapabilityProvider =
  | ChatReasoningProvider
  | CodingProvider
  | EmbeddingProvider
  | ImageGenerationProvider
  | ImageEditingProvider
  | VisionAnalysisProvider;
