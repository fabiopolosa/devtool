import type { ImageGenerationProvider, ImageEditingProvider, ProviderModelDescriptor, ProviderRequestContext, VisionAnalysisProvider } from "@cp/domain";
import { BaseProviderAdapter } from "./base-provider.js";

interface KieImageResponse {
  data?: Array<{ b64_json?: string; mime_type?: string }>;
  images?: Array<{ dataBase64?: string; mimeType?: string }>;
  model?: string;
}

interface KieVisionResponse {
  analysis?: string;
  result?: string;
  model?: string;
}

export class KieAIImageGenerationProvider extends BaseProviderAdapter<"image_generation"> implements ImageGenerationProvider {
  provider = "kie_ai" as const;
  capabilityClass = "image_generation" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return [this.defaultDescriptor("kie-ai-image-gen-default", { family: "image_generation" })];
  }

  async generate(request: Parameters<ImageGenerationProvider["generate"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://api.kie.ai/v1", "KIE_AI_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = "kie-ai-image-gen-default";
    const runtime = this.withContext(context);

    const response = await this.requestJson<KieImageResponse>(
      `${endpoint}/images/generations`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: {
          model,
          prompt: request.prompt,
          ...(request.width ? { width: request.width } : {}),
          ...(request.height ? { height: request.height } : {}),
          ...(request.style ? { style: request.style } : {})
        }
      },
      runtime
    );

    const fromData = (response.data ?? [])
      .map((item) => item.b64_json)
      .filter((value): value is string => typeof value === "string")
      .map((dataBase64) => ({ mimeType: "image/png", dataBase64 }));

    const fromImages = (response.images ?? [])
      .map((item) =>
        item.dataBase64
          ? { mimeType: item.mimeType ?? "image/png", dataBase64: item.dataBase64 }
          : null
      )
      .filter((item): item is { mimeType: string; dataBase64: string } => Boolean(item));

    return { images: [...fromData, ...fromImages], modelId: response.model ?? model };
  }

  async healthcheck() {
    try {
      const startedAt = Date.now();
      const endpoint = this.resolveEndpoint("https://api.kie.ai/v1", "KIE_AI_BASE_URL");
      const apiKey = this.requireApiKey();
      await this.requestJson<{ ok?: boolean }>(
        `${endpoint}/health`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` }
        }
      );
      return this.providerHealthyStatus(Date.now() - startedAt);
    } catch (error) {
      return this.providerDownStatus(error, "Kie.ai image generation healthcheck failed");
    }
  }
}

export class KieAIImageEditingProvider extends BaseProviderAdapter<"image_editing"> implements ImageEditingProvider {
  provider = "kie_ai" as const;
  capabilityClass = "image_editing" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return [this.defaultDescriptor("kie-ai-image-edit-default", { family: "image_editing" })];
  }

  async edit(request: Parameters<ImageEditingProvider["edit"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://api.kie.ai/v1", "KIE_AI_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = "kie-ai-image-edit-default";
    const runtime = this.withContext(context);

    const response = await this.requestJson<KieImageResponse>(
      `${endpoint}/images/edits`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: {
          model,
          prompt: request.prompt,
          image: request.imageBase64,
          ...(request.maskBase64 ? { mask: request.maskBase64 } : {}),
          ...(request.operation ? { operation: request.operation } : {})
        }
      },
      runtime
    );

    const fromData = (response.data ?? [])
      .map((item) => item.b64_json)
      .filter((value): value is string => typeof value === "string")
      .map((dataBase64) => ({ mimeType: "image/png", dataBase64 }));

    const fromImages = (response.images ?? [])
      .map((item) =>
        item.dataBase64
          ? { mimeType: item.mimeType ?? "image/png", dataBase64: item.dataBase64 }
          : null
      )
      .filter((item): item is { mimeType: string; dataBase64: string } => Boolean(item));

    return { images: [...fromData, ...fromImages], modelId: response.model ?? model };
  }

  async healthcheck() {
    try {
      const startedAt = Date.now();
      const endpoint = this.resolveEndpoint("https://api.kie.ai/v1", "KIE_AI_BASE_URL");
      const apiKey = this.requireApiKey();
      await this.requestJson<{ ok?: boolean }>(
        `${endpoint}/health`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` }
        }
      );
      return this.providerHealthyStatus(Date.now() - startedAt);
    } catch (error) {
      return this.providerDownStatus(error, "Kie.ai image editing healthcheck failed");
    }
  }
}

export class KieAIVisionProvider extends BaseProviderAdapter<"vision_analysis"> implements VisionAnalysisProvider {
  provider = "kie_ai" as const;
  capabilityClass = "vision_analysis" as const;

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return [this.defaultDescriptor("kie-ai-vision-default", { family: "vision_analysis" })];
  }

  async analyze(request: Parameters<VisionAnalysisProvider["analyze"]>[0], context: ProviderRequestContext) {
    const endpoint = this.resolveEndpoint("https://api.kie.ai/v1", "KIE_AI_BASE_URL");
    const apiKey = this.requireApiKey();
    const model = "kie-ai-vision-default";
    const runtime = this.withContext(context);

    const response = await this.requestJson<KieVisionResponse>(
      `${endpoint}/vision/analyze`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: {
          model,
          prompt: request.prompt,
          image: request.imageBase64
        }
      },
      runtime
    );

    return { analysis: response.analysis ?? response.result ?? "", modelId: response.model ?? model };
  }

  async healthcheck() {
    try {
      const startedAt = Date.now();
      const endpoint = this.resolveEndpoint("https://api.kie.ai/v1", "KIE_AI_BASE_URL");
      const apiKey = this.requireApiKey();
      await this.requestJson<{ ok?: boolean }>(
        `${endpoint}/health`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` }
        }
      );
      return this.providerHealthyStatus(Date.now() - startedAt);
    } catch (error) {
      return this.providerDownStatus(error, "Kie.ai vision healthcheck failed");
    }
  }
}
