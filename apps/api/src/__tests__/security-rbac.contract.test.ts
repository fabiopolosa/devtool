import type { FastifyInstance, FastifyRequest } from "fastify";
import { DEFAULT_TENANT_ID } from "@cp/db";
import type { ApiAuthRuntime } from "../auth/runtime.js";
import { resolveRequestPrincipal } from "../auth/runtime.js";
import { resolveRequestTenant } from "../tenant/runtime.js";

describe("Security RBAC hardening", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.API_STORE_MODE = "in_memory";
    process.env.AUTH_ENABLED = "1";
    process.env.RUNNER_INTERNAL_TOKEN = "runner-secret";

    const { buildApp } = await import("../app.js");
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    delete process.env.AUTH_ENABLED;
    delete process.env.RUNNER_INTERNAL_TOKEN;
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

  it("fails closed for auth-disabled runtime in production", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      const runtime = {
        enabled: false,
        oidcEnabled: false,
        service: {} as ApiAuthRuntime["service"],
        bypassPrincipal: {
          userId: "system",
          email: "system@local",
          displayName: "System",
          roleNames: ["admin"],
          permissions: ["*"],
          authBypass: true
        },
        apiKeys: []
      } satisfies ApiAuthRuntime;

      const principal = await resolveRequestPrincipal(
        { headers: {} } as unknown as FastifyRequest,
        runtime
      );
      expect(principal).toBeUndefined();
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  it("ignores tenant headers when no authenticated principal is present", async () => {
    const tenant = await resolveRequestTenant({
      headers: { "x-tenant-id": "tenant_other" }
    } as unknown as FastifyRequest);

    expect(tenant).toBe(DEFAULT_TENANT_ID);
  });

  it("requires auth on sensitive list endpoints", async () => {
    const endpoints = [
      ["GET", "/repositories"],
      ["GET", "/repositories/repo_001"],
      ["GET", "/tasks"],
      ["GET", "/tasks/task_001"],
      ["GET", "/approvals"],
      ["GET", "/mcp/status"],
      ["GET", "/subprompts"],
      ["GET", "/usage"],
      ["GET", "/audit"]
    ] as const;

    for (const [method, url] of endpoints) {
      const response = await app.inject({ method, url });
      expect(response.statusCode, url).toBe(401);
      expect(response.json()).toMatchObject({ error: "unauthenticated" });
    }
  });

  it("allows authenticated readers and blocks unauthorized tenant override", async () => {
    const viewerToken = await login("viewer@control-plane.local", "viewer123!");

    const repositories = await app.inject({
      method: "GET",
      url: "/repositories",
      headers: { authorization: `Bearer ${viewerToken}` }
    });
    expect(repositories.statusCode).toBe(200);

    const tasks = await app.inject({
      method: "GET",
      url: "/tasks/task_001",
      headers: { authorization: `Bearer ${viewerToken}` }
    });
    expect(tasks.statusCode).toBe(200);

    const auditOverride = await app.inject({
      method: "GET",
      url: "/audit?tenantId=tenant_other",
      headers: {
        authorization: `Bearer ${viewerToken}`,
        "x-tenant-id": "tenant_other"
      }
    });
    expect(auditOverride.statusCode).toBe(403);
    expect(auditOverride.json()).toMatchObject({ error: "forbidden" });

    const usageOverride = await app.inject({
      method: "GET",
      url: "/usage?tenantId=tenant_other",
      headers: {
        authorization: `Bearer ${viewerToken}`,
        "x-tenant-id": "tenant_other"
      }
    });
    expect(usageOverride.statusCode).toBe(403);
    expect(usageOverride.json()).toMatchObject({ error: "forbidden" });

    const subpromptsSync = await app.inject({
      method: "POST",
      url: "/subprompts/sync",
      headers: { authorization: `Bearer ${viewerToken}` }
    });
    expect(subpromptsSync.statusCode).toBe(403);
    expect(subpromptsSync.json()).toMatchObject({ error: "forbidden" });
  });

  it("requires the internal runner token on all internal routes", async () => {
    process.env.RUNNER_INTERNAL_TOKEN = "runner-secret";

    const denied = await app.inject({
      method: "POST",
      url: "/internal/runner/store/tenants/list"
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ error: "forbidden" });

    const allowed = await app.inject({
      method: "POST",
      url: "/internal/runner/store/tenants/list",
      headers: { "x-runner-token": "runner-secret" }
    });
    expect(allowed.statusCode).toBe(200);
    expect(Array.isArray(allowed.json().items)).toBe(true);
  });
});
