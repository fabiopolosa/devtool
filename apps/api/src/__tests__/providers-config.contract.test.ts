import type { FastifyInstance } from "fastify";

describe("Provider config API contract", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.API_STORE_MODE = "in_memory";
    process.env.AUTH_ENABLED = "1";
    const { buildApp } = await import("../app.js");
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    delete process.env.AUTH_ENABLED;
  });

  const login = async (email: string, password: string): Promise<string> => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password }
    });
    expect(response.statusCode).toBe(200);
    return (response.json() as { item: { token: string } }).item.token;
  };

  it("lists tenant provider configs", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/providers/config",
      headers: { "x-tenant-id": "tenant_default" }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: Array<{ id: string; provider: string }> };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
  });

  it("scopes provider config listing by tenant", async () => {
    const defaultTenantResponse = await app.inject({
      method: "GET",
      url: "/providers/config",
      headers: { "x-tenant-id": "tenant_default" }
    });
    expect(defaultTenantResponse.statusCode).toBe(200);
    const defaultTenantBody = defaultTenantResponse.json() as { items: Array<{ tenantId?: string }> };
    expect(defaultTenantBody.items.length).toBeGreaterThan(0);
    expect(defaultTenantBody.items.every((item) => item.tenantId === "tenant_default")).toBe(true);

    const isolatedTenantResponse = await app.inject({
      method: "GET",
      url: "/providers/config",
      headers: { "x-tenant-id": "tenant_other" }
    });
    expect(isolatedTenantResponse.statusCode).toBe(200);
    const isolatedTenantBody = isolatedTenantResponse.json() as { items: Array<{ tenantId?: string }> };
    expect(isolatedTenantBody.items).toHaveLength(0);
  });

  it("blocks provider config writes for non-owner tenant members", async () => {
    const token = await login("viewer@control-plane.local", "viewer123!");
    const response = await app.inject({
      method: "POST",
      url: "/providers/config",
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": "tenant_default"
      },
      payload: {
        providerId: "anthropic",
        apiKey: "env://ANTHROPIC_API_KEY",
        enabled: true
      }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "forbidden" });
  });

  it("allows owners to create and patch provider configs", async () => {
    const token = await login("admin@control-plane.local", "admin123!");

    const created = await app.inject({
      method: "POST",
      url: "/providers/config",
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": "tenant_default"
      },
      payload: {
        providerId: "anthropic",
        apiKey: "env://ANTHROPIC_API_KEY",
        enabled: true,
        timeoutMs: 45000
      }
    });
    expect(created.statusCode).toBe(200);
    const createdBody = created.json() as {
      item: {
        id: string;
        provider: string;
        providerId: string;
        apiKey?: string;
        apiKeyMasked?: string;
        validationStatus?: string;
      };
    };
    expect(createdBody.item.provider).toBe("anthropic");
    expect(createdBody.item.providerId).toBe("anthropic");
    expect(createdBody.item.apiKey).toBeUndefined();
    expect(createdBody.item.apiKeyMasked).toBe("sk-****");
    expect(createdBody.item.validationStatus).toBe("valid");

    const patched = await app.inject({
      method: "PATCH",
      url: `/providers/config/${createdBody.item.id}`,
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": "tenant_default"
      },
      payload: {
        enabled: false
      }
    });
    expect(patched.statusCode).toBe(200);
    const patchedBody = patched.json() as { item: { id: string; enabled: boolean } };
    expect(patchedBody.item.id).toBe(createdBody.item.id);
    expect(patchedBody.item.enabled).toBe(false);
  });

  it("stores raw api keys as secret references and never returns plaintext keys", async () => {
    const token = await login("admin@control-plane.local", "admin123!");
    const created = await app.inject({
      method: "POST",
      url: "/providers/config",
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": "tenant_default"
      },
      payload: {
        providerId: "openrouter",
        apiKey: "sk-live-never-store-plaintext",
        enabled: true
      }
    });

    expect(created.statusCode).toBe(200);
    const body = created.json() as {
      item: {
        authRef: string;
        secretRef?: string;
        apiKey?: string;
        apiKeyMasked?: string;
      };
    };
    expect(body.item.authRef.startsWith("secret://provider/openrouter/")).toBe(true);
    expect(body.item.secretRef?.startsWith("secret://provider/openrouter/")).toBe(true);
    expect(body.item.apiKey).toBeUndefined();
    expect(body.item.apiKeyMasked).toBe("sk-****");
  });

  it("supports setting tenant default provider/model selection", async () => {
    const token = await login("admin@control-plane.local", "admin123!");
    const configsResponse = await app.inject({
      method: "GET",
      url: "/providers/config",
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": "tenant_default"
      }
    });
    expect(configsResponse.statusCode).toBe(200);
    const configsBody = configsResponse.json() as {
      items: Array<{ id: string; providerId?: string; enabled: boolean; validationStatus?: string }>;
    };
    let candidate = configsBody.items.find(
      (item) => item.enabled && (item.validationStatus ?? "unknown") === "valid"
    );
    if (!candidate) {
      const created = await app.inject({
        method: "POST",
        url: "/providers/config",
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_default"
        },
        payload: {
          providerId: "openrouter",
          apiKey: "env://OPENROUTER_API_KEY",
          enabled: true
        }
      });
      expect(created.statusCode).toBe(200);
      const createdBody = created.json() as {
        item: { id: string; providerId?: string; enabled: boolean; validationStatus?: string };
      };
      candidate = createdBody.item;
    }

    const modelsResponse = await app.inject({
      method: "GET",
      url: "/providers/models?includeDisabled=1",
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": "tenant_default"
      }
    });
    expect(modelsResponse.statusCode).toBe(200);
    const modelsBody = modelsResponse.json() as {
      items: Array<{ providerConfigId: string; modelId: string; enabled: boolean }>;
    };
    const modelForCandidate = modelsBody.items.find(
      (item) => item.providerConfigId === candidate.id && item.enabled
    );

    const setDefaults = await app.inject({
      method: "PATCH",
      url: "/providers/defaults",
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": "tenant_default"
      },
      payload: {
        defaultProviderConfigId: candidate.id,
        ...(modelForCandidate ? { defaultModelId: modelForCandidate.modelId } : {})
      }
    });
    expect(setDefaults.statusCode).toBe(200);
    const setBody = setDefaults.json() as {
      item: { defaultProviderConfigId?: string; defaultModelId?: string };
    };
    expect(setBody.item.defaultProviderConfigId).toBe(candidate.id);
    if (modelForCandidate) {
      expect(setBody.item.defaultModelId).toBe(modelForCandidate.modelId);
    }

    const fetched = await app.inject({
      method: "GET",
      url: "/providers/defaults",
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": "tenant_default"
      }
    });
    expect(fetched.statusCode).toBe(200);
    const fetchedBody = fetched.json() as {
      item: { defaultProviderConfigId?: string; defaultModelId?: string };
    };
    expect(fetchedBody.item.defaultProviderConfigId).toBe(candidate.id);
  });

  it("tests provider config connectivity and returns model candidates", async () => {
    const token = await login("admin@control-plane.local", "admin123!");
    const configsResponse = await app.inject({
      method: "GET",
      url: "/providers/config",
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": "tenant_default"
      }
    });
    expect(configsResponse.statusCode).toBe(200);
    const configsBody = configsResponse.json() as { items: Array<{ id: string }> };
    const firstConfig = configsBody.items[0];
    expect(firstConfig).toBeDefined();
    if (!firstConfig) return;

    const testResponse = await app.inject({
      method: "POST",
      url: `/providers/config/${firstConfig.id}/test`,
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": "tenant_default"
      }
    });
    expect(testResponse.statusCode).toBe(200);
    const body = testResponse.json() as {
      status: "ok" | "error";
      latencyMs: number;
      models: string[];
      error?: string;
      rateLimit?: {
        rpm?: { used?: number; limit?: number | null };
        tpm?: { used?: number; limit?: number | null };
      };
      item: { id: string; validationStatus?: string };
      availableModels?: string[];
    };
    expect(body.item.id).toBe(firstConfig.id);
    expect(body.status === "ok" || body.status === "error").toBe(true);
    expect(typeof body.latencyMs).toBe("number");
    expect(Array.isArray(body.models)).toBe(true);
    expect(Array.isArray(body.availableModels)).toBe(true);
    expect(body.models).toEqual(body.availableModels);
    expect(typeof body.rateLimit?.rpm?.used).toBe("number");
    expect(typeof body.rateLimit?.tpm?.used).toBe("number");
  });

  it("rejects writes when user is not a member of requested tenant", async () => {
    const token = await login("admin@control-plane.local", "admin123!");
    const response = await app.inject({
      method: "POST",
      url: "/providers/config",
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": "tenant_other"
      },
      payload: {
        providerId: "openai",
        enabled: true
      }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "forbidden" });
  });
});
