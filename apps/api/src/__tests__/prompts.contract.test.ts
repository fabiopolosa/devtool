import type { FastifyInstance } from "fastify";

describe("Prompt registry API contract", () => {
  let app: FastifyInstance;

  const login = async (email: string, password: string): Promise<string> => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password }
    });
    expect(response.statusCode).toBe(200);
    return (response.json() as { item: { token: string } }).item.token;
  };

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

  it("lists prompt registry entries for viewers", async () => {
    const token = await login("viewer@control-plane.local", "viewer123!");
    const response = await app.inject({
      method: "GET",
      url: "/prompts",
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": "tenant_default"
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: Array<{ id: string }> };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("blocks prompt writes for non-admin users", async () => {
    const token = await login("viewer@control-plane.local", "viewer123!");
    const response = await app.inject({
      method: "POST",
      url: "/prompts",
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": "tenant_default"
      },
      payload: {
        type: "planner",
        scope: "tenant",
        target: "planner",
        version: "v1",
        content: "Do not mutate core contracts.",
        status: "draft"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "forbidden" });
  });

  it("creates, activates and deprecates prompt registry entries", async () => {
    const token = await login("admin@control-plane.local", "admin123!");

    const created = await app.inject({
      method: "POST",
      url: "/prompts",
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": "tenant_default"
      },
      payload: {
        type: "planner",
        scope: "tenant",
        target: "planner",
        version: "v1",
        content: "Use the governed prompt registry.",
        status: "active",
        metadata: { source: "contract-test" }
      }
    });

    expect(created.statusCode).toBe(200);
    const createdBody = created.json() as {
      item: {
        id: string;
        status: string;
        tenantId?: string;
        metadata?: Record<string, unknown>;
      };
    };
    expect(createdBody.item.status).toBe("active");
    expect(createdBody.item.tenantId).toBe("tenant_default");
    expect(createdBody.item.metadata).toMatchObject({ source: "contract-test" });

    const deprecate = await app.inject({
      method: "POST",
      url: `/prompts/${createdBody.item.id}/deprecate`,
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": "tenant_default"
      }
    });
    expect(deprecate.statusCode).toBe(200);
    expect((deprecate.json() as { item: { status: string } }).item.status).toBe("deprecated");

    const reactivate = await app.inject({
      method: "POST",
      url: `/prompts/${createdBody.item.id}/activate`,
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": "tenant_default"
      }
    });
    expect(reactivate.statusCode).toBe(200);
    expect((reactivate.json() as { item: { status: string } }).item.status).toBe("active");
  });
});

