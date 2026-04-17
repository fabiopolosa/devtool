import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetNormalizedModelDiscoveryCache } from "@cp/providers";

const registryDiscoverModels = vi.fn();
const listProviderConfigs = vi.fn<() => Promise<Array<Record<string, unknown>>>>(async () => []);
const listProviderModels = vi.fn<() => Promise<Array<Record<string, unknown>>>>(async () => []);

vi.mock("@cp/providers", async () => {
  const actual = await vi.importActual<typeof import("@cp/providers")>("@cp/providers");
  return {
    ...actual,
    createDefaultProviderRegistry: () => ({
      discoverAllModels: registryDiscoverModels
    })
  };
});

vi.mock("../services/api-store.js", () => ({
  apiStore: {
    listProviderConfigs,
    listProviderModels
  }
}));

describe("models route contract", () => {
  const registerAuthenticatedViewer = (app: FastifyInstance): void => {
    app.addHook("onRequest", async (request) => {
      request.authPrincipal = {
        userId: "viewer_001",
        email: "viewer@control-plane.local",
        displayName: "Viewer",
        authBypass: false,
        roleNames: ["viewer"],
        permissions: ["canView"]
      };
      request.tenantId = "tenant_default";
      request.tenantPermissions = {
        canView: true,
        canEdit: false,
        canRunAgent: false,
        canManageUsers: false,
        canApprove: false
      };
    });
  };

  beforeEach(() => {
    resetNormalizedModelDiscoveryCache();
    registryDiscoverModels.mockReset();
    listProviderConfigs.mockReset();
    listProviderModels.mockReset();

    listProviderConfigs.mockResolvedValue([
      { id: "cfg_openai", provider: "openai", providerId: "openai", enabled: true },
      { id: "cfg_anthropic", provider: "anthropic", providerId: "anthropic", enabled: false }
    ]);
    listProviderModels.mockResolvedValue([]);
    registryDiscoverModels.mockResolvedValue([
      {
        id: "openai:chat_reasoning:gpt-5.1",
        provider: "openai",
        modelId: "gpt-5.1",
        capabilityClass: "chat_reasoning",
        contextWindow: 256000,
        metadata: {
          displayName: "GPT-5.1",
          pricing: { input: 1.25, output: 10 }
        }
      },
      {
        id: "anthropic:chat_reasoning:claude-opus-4",
        provider: "anthropic",
        modelId: "claude-opus-4",
        capabilityClass: "chat_reasoning",
        contextWindow: 200000,
        metadata: {
          displayName: "Claude Opus 4",
          pricing: { input: 3, output: 15 }
        }
      }
    ]);
  });

  afterEach(() => {
    resetNormalizedModelDiscoveryCache();
  });

  it("returns normalized models and respects refresh bypass", async () => {
    const { modelsRoutes } = await import("../routes/models.js");
    const app = Fastify();
    registerAuthenticatedViewer(app);
    await app.register(modelsRoutes);

    const first = await app.inject({ method: "GET", url: "/models" });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json() as {
      source: "live" | "mock";
      models: Array<{ provider: string; modelId: string; pricing: { input?: number; output?: number } }>;
      items: Array<{ provider: string; modelId: string; pricing: { input?: number; output?: number } }>;
    };
    expect(firstBody.source).toBe("live");
    expect(firstBody.models).toHaveLength(1);
    expect(firstBody.models[0]).toMatchObject({
      provider: "openai",
      modelId: "gpt-5.1",
      pricing: { input: 1.25, output: 10 }
    });
    // Backward-compatible alias.
    expect(firstBody.items).toHaveLength(1);
    expect(registryDiscoverModels).toHaveBeenCalledTimes(1);

    const cached = await app.inject({ method: "GET", url: "/models" });
    expect(cached.statusCode).toBe(200);
    expect(registryDiscoverModels).toHaveBeenCalledTimes(1);

    const refreshed = await app.inject({ method: "GET", url: "/models?refresh=1" });
    expect(refreshed.statusCode).toBe(200);
    expect(registryDiscoverModels).toHaveBeenCalledTimes(2);

    await app.close();
  });

  it("returns mock source when live discovery fails", async () => {
    process.env.MODELS_STRICT = "1";
    listProviderConfigs.mockResolvedValue([
      { id: "cfg_openai", provider: "openai", providerId: "openai", enabled: true }
    ]);
    listProviderModels.mockResolvedValue([
      {
        id: "model_openai_persisted",
        providerConfigId: "cfg_openai",
        modelId: "gpt-4.1",
        capabilityClass: "chat_reasoning",
        contextWindow: 128000,
        maxOutputTokens: 8192,
        pricingMeta: { input: 1, output: 3 },
        enabled: true
      }
    ]);
    registryDiscoverModels.mockRejectedValueOnce(new Error("network unavailable"));

    const { modelsRoutes } = await import("../routes/models.js");
    const app = Fastify();
    registerAuthenticatedViewer(app);
    await app.register(modelsRoutes);

    const response = await app.inject({ method: "GET", url: "/models?refresh=1" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      source: "live" | "mock";
      models: Array<{ provider: string; modelId: string }>;
      meta: { strictMode?: boolean };
    };
    expect(body.source).toBe("mock");
    expect(body.models[0]).toMatchObject({ provider: "openai", modelId: "gpt-4.1" });
    expect(body.meta.strictMode).toBe(true);

    await app.close();
    delete process.env.MODELS_STRICT;
  });
});
