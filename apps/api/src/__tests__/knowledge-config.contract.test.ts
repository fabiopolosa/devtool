import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const login = async (app: FastifyInstance, email: string, password: string): Promise<string> => {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password }
  });
  expect(response.statusCode).toBe(200);
  const body = response.json() as { item: { token: string } };
  return body.item.token;
};

describe("Knowledge config API contract", () => {
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

  it("returns effective config with canonical shape", async () => {
    const token = await login(app, "viewer@control-plane.local", "viewer123!");
    const response = await app.inject({
      method: "GET",
      url: "/knowledge/config?projectId=proj_001",
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      item?: { scope: string; maxNodes: number; relevanceThreshold: number };
      source?: string;
      items?: unknown[];
    };
    expect(body.item?.scope).toBeDefined();
    expect(typeof body.item?.maxNodes).toBe("number");
    expect(typeof body.item?.relevanceThreshold).toBe("number");
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("blocks patch for non-admin/non-owner tenant users", async () => {
    const token = await login(app, "viewer@control-plane.local", "viewer123!");
    const response = await app.inject({
      method: "PATCH",
      url: "/knowledge/config?projectId=proj_001",
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        scope: "project",
        projectId: "proj_001",
        autoCapture: true,
        captureModes: ["generation_output"],
        requireApproval: false,
        maxNodes: 10,
        relevanceThreshold: 0.3,
        versioning: true,
        requireReview: false
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "forbidden" });
  });

  it("allows owner/admin to patch and create scoped project overrides", async () => {
    const token = await login(app, "admin@control-plane.local", "admin123!");
    const patchResponse = await app.inject({
      method: "PATCH",
      url: "/knowledge/config?projectId=proj_001",
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        scope: "project",
        projectId: "proj_001",
        autoCapture: true,
        captureModes: ["generation_output", "decision_record"],
        requireApproval: false,
        maxNodes: 12,
        relevanceThreshold: 0.35,
        versioning: true,
        requireReview: false
      }
    });

    expect(patchResponse.statusCode).toBe(200);
    const patchBody = patchResponse.json() as {
      item?: { scope: string; autoCapture: boolean; maxNodes: number };
      created?: boolean;
    };
    expect(patchBody.item?.scope).toBe("project");
    expect(patchBody.item?.autoCapture).toBe(true);
    expect(patchBody.item?.maxNodes).toBe(12);
    expect(typeof patchBody.created).toBe("boolean");

    const effectiveResponse = await app.inject({
      method: "GET",
      url: "/knowledge/config?projectId=proj_001",
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(effectiveResponse.statusCode).toBe(200);
    const effective = effectiveResponse.json() as {
      item?: { scope: string; autoCapture: boolean; maxNodes: number };
      source?: string;
    };
    expect(effective.item?.scope).toBe("project");
    expect(effective.item?.autoCapture).toBe(true);
    expect(effective.item?.maxNodes).toBe(12);
    expect(effective.source).toBe("project");
  });
});

