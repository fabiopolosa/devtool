import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("Knowledge API contract", () => {
  type InjectRequestOptions = InjectOptions;
  type InjectResponse = LightMyRequestResponse;

  let app: FastifyInstance;
  let adminHeaders: Record<string, string>;

  beforeAll(async () => {
    process.env.API_STORE_MODE = "in_memory";
    process.env.AUTH_ENABLED = "1";

    const { buildApp } = await import("../app.js");
    app = await buildApp();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@control-plane.local", password: "admin123!" }
    });
    expect(login.statusCode).toBe(200);
    const token = (login.json() as { item: { token: string } }).item.token;
    adminHeaders = { authorization: `Bearer ${token}` };
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    delete process.env.AUTH_ENABLED;
  });

  const inject = (options: InjectRequestOptions): Promise<InjectResponse> =>
    app.inject({
      ...options,
      headers: {
        ...adminHeaders,
        ...(options.headers ?? {})
      }
    });

  it("lists seeded system/tenant/project knowledge nodes", async () => {
    const response = await inject({
      method: "GET",
      url: "/knowledge?projectId=proj_001"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: Array<{ id: string; scope: string; path: string }> };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.some((item) => item.scope === "system")).toBe(true);
    expect(body.items.some((item) => item.scope === "project")).toBe(true);
  });

  it("supports create/update/delete lifecycle", async () => {
    const created = await inject({
      method: "POST",
      url: "/knowledge",
      payload: {
        scope: "project",
        projectId: "proj_001",
        path: "/projects/proj_001/notes/runtime-insight.md",
        content: "# Runtime Insight\n\nExecution succeeded with deterministic retries."
      }
    });
    expect(created.statusCode).toBe(200);
    const createdBody = created.json() as { item: { id: string; path: string } };
    expect(createdBody.item.path).toBe("/projects/proj_001/notes/runtime-insight.md");

    const knowledgeNodeId = createdBody.item.id;
    const detail = await inject({
      method: "GET",
      url: `/knowledge/${knowledgeNodeId}?projectId=proj_001`
    });
    expect(detail.statusCode).toBe(200);

    const updated = await inject({
      method: "PATCH",
      url: `/knowledge/${knowledgeNodeId}?projectId=proj_001`,
      payload: {
        content: "# Runtime Insight\n\nRetry budget remained within configured limits."
      }
    });
    expect(updated.statusCode).toBe(200);
    expect((updated.json() as { item: { content: string } }).item.content).toContain("Retry budget");

    const removed = await inject({
      method: "DELETE",
      url: `/knowledge/${knowledgeNodeId}?projectId=proj_001`
    });
    expect(removed.statusCode).toBe(200);
  });

  it("supports semantic/lexical search and context endpoint", async () => {
    const search = await inject({
      method: "GET",
      url: "/knowledge?projectId=proj_001&query=dag%20execution"
    });
    expect(search.statusCode).toBe(200);
    const searchBody = search.json() as {
      items: Array<{ id: string }>;
      hits?: Array<{ score: number; source: string }>;
    };
    expect(searchBody.items.length).toBeGreaterThan(0);
    expect(Array.isArray(searchBody.hits)).toBe(true);

    const context = await inject({
      method: "GET",
      url: "/knowledge/context/search?projectId=proj_001&query=retry%20semantics&limit=3"
    });
    expect(context.statusCode).toBe(200);
    const contextBody = context.json() as {
      item: Array<{ path: string; title: string; scope: string; excerpt: string; score: number; sourceType?: string }>;
    };
    expect(Array.isArray(contextBody.item)).toBe(true);
  });

  it("merges project context notes into compact knowledge context", async () => {
    const createdNote = await inject({
      method: "POST",
      url: "/context",
      payload: {
        projectId: "proj_001",
        path: "/projects/proj_001/context/strategy.md",
        title: "Strategy",
        content: "# Strategy\n\nPrefer compact knowledge injection for workflows.",
        tags: ["strategy"],
        linkRefs: [],
        pinned: true
      }
    });
    expect(createdNote.statusCode).toBe(200);

    const context = await inject({
      method: "GET",
      url: "/knowledge/context/search?projectId=proj_001&query=compact%20knowledge%20injection&limit=5"
    });
    expect(context.statusCode).toBe(200);
    const contextBody = context.json() as {
      item: Array<{ path: string; title: string; scope: string; excerpt: string; score: number; sourceType?: string }>;
    };
    expect(contextBody.item.some((entry) => entry.scope === "context-notes")).toBe(true);
    expect(contextBody.item.some((entry) => entry.sourceType === "context-note")).toBe(true);
  });
});
