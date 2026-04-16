import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectProviderBinding, ProviderConfig, ProviderModel } from "@cp/domain";
import { resolveProviderModelSelection } from "../services/provider-config-service.js";
import { apiStore } from "../services/api-store.js";

const now = "2026-04-16T00:00:00.000Z";

const makeProviderConfig = (input: {
  id: string;
  provider: ProviderConfig["provider"];
  tenantId?: string;
  enabled?: boolean;
  validationStatus?: ProviderConfig["validationStatus"];
  metadata?: Record<string, unknown>;
}): ProviderConfig => ({
  id: input.id,
  tenantId: input.tenantId ?? "tenant_default",
  provider: input.provider,
  providerId: input.provider,
  authRef: "env://DUMMY",
  enabled: input.enabled ?? true,
  timeoutMs: 30_000,
  validationStatus: input.validationStatus ?? "valid",
  metadata: input.metadata ?? {},
  createdAt: now,
  createdBy: "test",
  updatedAt: now,
  updatedBy: "test"
});

const makeProviderModel = (input: {
  id: string;
  providerConfigId: string;
  modelId: string;
  enabled?: boolean;
}): ProviderModel => ({
  id: input.id,
  providerConfigId: input.providerConfigId,
  modelId: input.modelId,
  capabilityClass: "coding",
  enabled: input.enabled ?? true,
  createdAt: now,
  createdBy: "test",
  updatedAt: now,
  updatedBy: "test"
});

const makeBinding = (input: {
  id: string;
  projectId: string;
  primaryModelId: string;
  capabilityClass?: ProjectProviderBinding["capabilityClass"];
  enabled?: boolean;
}): ProjectProviderBinding => ({
  id: input.id,
  projectId: input.projectId,
  capabilityClass: input.capabilityClass ?? "coding",
  primaryModelId: input.primaryModelId,
  fallbackModelIds: [],
  enabled: input.enabled ?? true,
  createdAt: now,
  createdBy: "test",
  updatedAt: now,
  updatedBy: "test"
});

const mockStore = (input: {
  configs: ProviderConfig[];
  models: ProviderModel[];
  bindings?: ProjectProviderBinding[];
}): void => {
  vi.spyOn(apiStore, "listProviderConfigs").mockResolvedValue(input.configs);
  vi.spyOn(apiStore, "listProviderModels").mockResolvedValue(input.models);
  vi.spyOn(apiStore, "listProviderBindings").mockResolvedValue(input.bindings ?? []);
};

describe("resolveProviderModelSelection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers request provider/model over project and tenant defaults", async () => {
    const cfgRequest = makeProviderConfig({ id: "cfg_openrouter", provider: "openrouter" });
    const cfgProject = makeProviderConfig({
      id: "cfg_anthropic",
      provider: "anthropic",
      metadata: { isDefaultProvider: true }
    });

    mockStore({
      configs: [cfgRequest, cfgProject],
      models: [
        makeProviderModel({
          id: "mdl_openrouter",
          providerConfigId: cfgRequest.id,
          modelId: "openrouter/coding-1"
        }),
        makeProviderModel({
          id: "mdl_anthropic",
          providerConfigId: cfgProject.id,
          modelId: "claude-sonnet"
        })
      ],
      bindings: [makeBinding({ id: "binding_project", projectId: "proj_001", primaryModelId: "mdl_anthropic" })]
    });

    const resolved = await resolveProviderModelSelection({
      tenantId: "tenant_default",
      projectId: "proj_001",
      requestedProvider: "openrouter",
      requestedModelId: "openrouter/coding-1",
      capabilityClass: "coding"
    });

    expect(resolved.source).toBe("request");
    expect(resolved.provider).toBe("openrouter");
    expect(resolved.modelId).toBe("openrouter/coding-1");
  });

  it("falls back to project defaults when request payload does not specify provider/model", async () => {
    const cfgPrimary = makeProviderConfig({ id: "cfg_openai", provider: "openai" });
    const cfgProject = makeProviderConfig({ id: "cfg_gemini", provider: "gemini" });

    mockStore({
      configs: [cfgPrimary, cfgProject],
      models: [
        makeProviderModel({
          id: "mdl_openai",
          providerConfigId: cfgPrimary.id,
          modelId: "gpt-5.1"
        }),
        makeProviderModel({
          id: "mdl_gemini",
          providerConfigId: cfgProject.id,
          modelId: "gemini-2.0-flash"
        })
      ],
      bindings: [makeBinding({ id: "binding_project", projectId: "proj_002", primaryModelId: "mdl_gemini" })]
    });

    const resolved = await resolveProviderModelSelection({
      tenantId: "tenant_default",
      projectId: "proj_002",
      capabilityClass: "coding"
    });

    expect(resolved.source).toBe("project");
    expect(resolved.provider).toBe("gemini");
    expect(resolved.modelId).toBe("gemini-2.0-flash");
  });

  it("falls back to tenant default when project has no binding", async () => {
    const cfgTenantDefault = makeProviderConfig({
      id: "cfg_openai",
      provider: "openai",
      metadata: { isDefaultProvider: true, defaultModelId: "gpt-5.1-mini" }
    });
    const cfgSecondary = makeProviderConfig({ id: "cfg_anthropic", provider: "anthropic" });

    mockStore({
      configs: [cfgTenantDefault, cfgSecondary],
      models: [
        makeProviderModel({
          id: "mdl_openai",
          providerConfigId: cfgTenantDefault.id,
          modelId: "gpt-5.1-mini"
        }),
        makeProviderModel({
          id: "mdl_anthropic",
          providerConfigId: cfgSecondary.id,
          modelId: "claude-sonnet"
        })
      ],
      bindings: []
    });

    const resolved = await resolveProviderModelSelection({
      tenantId: "tenant_default",
      projectId: "proj_without_binding",
      capabilityClass: "coding"
    });

    expect(resolved.source).toBe("tenant");
    expect(resolved.provider).toBe("openai");
    expect(resolved.modelId).toBe("gpt-5.1-mini");
  });

  it("falls back to deterministic system default when neither request/project/tenant defaults are set", async () => {
    const cfgAnthropic = makeProviderConfig({ id: "cfg_anthropic", provider: "anthropic" });
    const cfgGemini = makeProviderConfig({ id: "cfg_gemini", provider: "gemini" });

    mockStore({
      configs: [cfgGemini, cfgAnthropic],
      models: [
        makeProviderModel({ id: "mdl_anthropic", providerConfigId: cfgAnthropic.id, modelId: "claude-sonnet" }),
        makeProviderModel({ id: "mdl_gemini", providerConfigId: cfgGemini.id, modelId: "gemini-2.0-flash" })
      ],
      bindings: []
    });

    const resolved = await resolveProviderModelSelection({
      tenantId: "tenant_default",
      capabilityClass: "coding"
    });

    expect(resolved.source).toBe("system");
    expect(resolved.provider).toBe("anthropic");
  });

  it("does not silently fallback for invalid requested provider", async () => {
    mockStore({
      configs: [makeProviderConfig({ id: "cfg_openai", provider: "openai" })],
      models: [makeProviderModel({ id: "mdl_openai", providerConfigId: "cfg_openai", modelId: "gpt-5.1" })],
      bindings: []
    });

    await expect(
      resolveProviderModelSelection({
        tenantId: "tenant_default",
        requestedProvider: "anthropic",
        capabilityClass: "coding"
      })
    ).rejects.toThrow('Requested provider "anthropic" is not enabled/valid');
  });
});
