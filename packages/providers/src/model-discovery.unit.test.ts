import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderConfig, ProviderModel } from "@cp/domain";
import {
  buildFallbackNormalizedModels,
  discoverNormalizedModels,
  resetNormalizedModelDiscoveryCache
} from "./models/model-discovery.js";

const createFallbackData = (): { configs: ProviderConfig[]; models: ProviderModel[] } => {
  const now = "2026-04-15T12:00:00.000Z";
  return {
    configs: [
      {
        id: "provider-config-openai",
        provider: "openai",
        endpoint: "https://api.openai.com/v1",
        authRef: "secret://openai/api-key",
        enabled: true,
        timeoutMs: 30000,
        metadata: {},
        createdAt: now,
        createdBy: "system",
        updatedAt: now,
        updatedBy: "system"
      }
    ],
    models: [
      {
        id: "provider-model-openai",
        providerConfigId: "provider-config-openai",
        modelId: "gpt-4.1",
        capabilityClass: "coding",
        contextWindow: 128000,
        maxOutputTokens: 16384,
        pricingMeta: { input: 1.25, output: 6.5 },
        enabled: true,
        createdAt: now,
        createdBy: "system",
        updatedAt: now,
        updatedBy: "system"
      }
    ]
  };
};

describe("normalized model discovery", () => {
  afterEach(() => {
    resetNormalizedModelDiscoveryCache();
    vi.restoreAllMocks();
  });

  it("normalizes live models and caches them for the ttl", async () => {
    const source = vi.fn(async () => [
      {
        id: "gpt-5.1",
        provider: "openai" as const,
        modelId: "gpt-5.1",
        capabilityClass: "chat_reasoning" as const,
        contextWindow: 256000,
        maxOutputTokens: 16384,
        metadata: {
          displayName: "GPT-5.1",
          pricing: { input: 1.25, output: 10 }
        }
      }
    ]);

    const first = await discoverNormalizedModels({ source, ttlMs: 10_000, now: () => 1_000 });
    const second = await discoverNormalizedModels({ source, ttlMs: 10_000, now: () => 2_000 });

    expect(source).toHaveBeenCalledTimes(1);
    expect(first.source).toBe("live");
    expect(second.source).toBe("cache");
    expect(first.items[0]).toMatchObject({
      provider: "openai",
      modelId: "gpt-5.1",
      displayName: "GPT-5.1",
      contextWindow: 256000,
      maxOutputTokens: 16384,
      pricing: { input: 1.25, output: 10 },
      capabilities: ["chat_reasoning"]
    });
  });

  it("bypasses cache when refresh is requested", async () => {
    const source = vi.fn(async () => [
      {
        id: "claude-opus-4.1",
        provider: "anthropic" as const,
        modelId: "claude-opus-4.1",
        capabilityClass: "coding" as const
      }
    ]);

    await discoverNormalizedModels({ source, ttlMs: 10_000, now: () => 1_000 });
    await discoverNormalizedModels({ source, ttlMs: 10_000, refresh: true, now: () => 2_000 });

    expect(source).toHaveBeenCalledTimes(2);
  });

  it("falls back to persisted models when live discovery fails", async () => {
    const { configs, models } = createFallbackData();
    const fallbackModels = buildFallbackNormalizedModels(configs, models);

    const result = await discoverNormalizedModels({
      source: async () => {
        throw new Error("network unavailable");
      },
      fallbackModels,
      refresh: true,
      now: () => 1_000
    });

    expect(result.source).toBe("fallback");
    expect(result.items[0]).toMatchObject({
      provider: "openai",
      modelId: "gpt-4.1",
      pricing: { input: 1.25, output: 6.5 },
      capabilities: ["coding"],
      source: "persisted"
    });
  });

  it("keeps cache isolated by cacheKey", async () => {
    const source = vi.fn(async () => [
      {
        id: "gpt-5.1",
        provider: "openai" as const,
        modelId: "gpt-5.1",
        capabilityClass: "chat_reasoning" as const
      }
    ]);

    const firstTenant = await discoverNormalizedModels({
      source,
      ttlMs: 10_000,
      cacheKey: "tenant_a",
      now: () => 1_000
    });
    const secondTenant = await discoverNormalizedModels({
      source,
      ttlMs: 10_000,
      cacheKey: "tenant_b",
      now: () => 2_000
    });

    expect(firstTenant.source).toBe("live");
    expect(secondTenant.source).toBe("live");
    expect(source).toHaveBeenCalledTimes(2);
  });
});
