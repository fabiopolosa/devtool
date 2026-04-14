import type {
  ProviderHealthStatus,
  ProviderModelDescriptor,
  ProviderName,
  ProviderRequestContext
} from "@cp/domain";
import type { CapabilityClass } from "@cp/domain";
import type { ProviderRuntime } from "../types.js";
import { defaultSecretResolver, type SecretResolver } from "../security/secret-resolver.js";

const nowIso = () => new Date().toISOString();

export interface RequestJsonOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  timeoutMs?: number;
}

export abstract class BaseProviderAdapter<TCapability extends CapabilityClass> implements ProviderRuntime<TCapability> {
  abstract provider: ProviderName;
  abstract capabilityClass: TCapability;

  constructor(protected readonly secretResolver: SecretResolver = defaultSecretResolver) {}

  async discoverModels(): Promise<ProviderModelDescriptor[]> {
    return [];
  }

  async healthcheck(): Promise<ProviderHealthStatus> {
    return {
      status: "unknown",
      checkedAt: nowIso(),
      message: "Healthcheck not implemented for this adapter"
    };
  }

  protected defaultDescriptor(modelId: string, metadata: Record<string, unknown> = {}): ProviderModelDescriptor {
    return {
      id: `${this.provider}:${this.capabilityClass}:${modelId}`,
      provider: this.provider,
      modelId,
      capabilityClass: this.capabilityClass,
      metadata
    };
  }

  protected withContext(context: ProviderRequestContext): ProviderRequestContext {
    return {
      ...context,
      timeoutMs: context.timeoutMs ?? 30_000
    };
  }

  protected requireApiKey(authRef?: string): string {
    const key = authRef
      ? this.secretResolver.resolveAuthRef(authRef, this.provider)
      : this.secretResolver.resolveProviderKey(this.provider);

    if (!key) {
      throw new Error(`Missing API key for provider ${this.provider}`);
    }

    return key;
  }

  protected resolveEndpoint(defaultEndpoint: string, envKey: string): string {
    return process.env[envKey] ?? defaultEndpoint;
  }

  protected async requestJson<T>(url: string, options: RequestJsonOptions = {}, context?: ProviderRequestContext): Promise<T> {
    const timeoutMs = options.timeoutMs ?? context?.timeoutMs ?? 30_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method ?? "POST",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers ?? {})
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal
      });

      const rawText = await response.text();
      const data = rawText ? (JSON.parse(rawText) as T) : ({} as T);

      if (!response.ok) {
        const responsePreview = rawText.slice(0, 500);
        throw new Error(`Provider ${this.provider} request failed (${response.status}): ${responsePreview}`);
      }

      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  protected providerDownStatus(error: unknown, fallbackMessage: string): ProviderHealthStatus {
    return {
      status: "down",
      checkedAt: nowIso(),
      message: error instanceof Error ? error.message : fallbackMessage
    };
  }

  protected providerHealthyStatus(latencyMs?: number): ProviderHealthStatus {
    return {
      status: "healthy",
      checkedAt: nowIso(),
      ...(latencyMs !== undefined ? { latencyMs } : {})
    };
  }

  protected normalizeOpenAIContent(content: unknown): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === "string") return item;
          if (!item || typeof item !== "object") return "";
          const text = (item as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        })
        .filter(Boolean)
        .join("\n")
        .trim();
    }
    return "";
  }
}
