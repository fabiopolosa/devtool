import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("Brainstorming / Subprompts / MCP / Provider discovery API contract", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.API_STORE_MODE = "in_memory";
    process.env.AUTH_ENABLED = "0";
    process.env.PROVIDER_AUTO_DISCOVERY_ENABLED = "0";
    process.env.MCP_ENABLED = "0";
    process.env.SECRETS_MASTER_KEY = "brainstorm-contract-master-key";

    const { buildApp } = await import("../app.js");
    app = await buildApp();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (app) {
      await app.close();
    }
  });

  it("lists and composes subprompts", async () => {
    const list = await app.inject({ method: "GET", url: "/subprompts?refresh=1&enabled=true" });
    expect(list.statusCode).toBe(200);
    const listBody = list.json() as { items: Array<{ id: string; prompt?: string }> };
    expect(Array.isArray(listBody.items)).toBe(true);
    expect(listBody.items.length).toBeGreaterThan(0);
    expect(listBody.items[0]).not.toHaveProperty("prompt");

    const fullList = await app.inject({
      method: "GET",
      url: "/subprompts?enabled=true&includeContent=1"
    });
    expect(fullList.statusCode).toBe(200);
    const fullBody = fullList.json() as { items: Array<{ id: string; prompt: string }> };
    expect(typeof fullBody.items[0]?.prompt).toBe("string");

    const selectedIds = listBody.items.slice(0, 2).map((item) => item.id);
    const composed = await app.inject({
      method: "POST",
      url: "/subprompts/compose",
      payload: {
        selectedIds,
        additionalInstructions: ["Focus on low token usage."]
      }
    });
    expect(composed.statusCode).toBe(200);
    const composedBody = composed.json() as { item: { composedPrompt: string } };
    expect(composedBody.item.composedPrompt).toContain("Subprompt composition");
  });

  it("starts brainstorming and retrieves plan in plan.* format", async () => {
    const start = await app.inject({
      method: "POST",
      url: "/brainstorm",
      payload: {
        projectIntent: "Build a provider-agnostic control-plane with MCP and retrieval",
        guidedAnswers: {
          scope: "MVP with additive endpoints",
          repos: "control-plane only"
        }
      }
    });
    expect(start.statusCode).toBe(200);
    const startBody = start.json() as {
      item: { session: { id: string; planId?: string }; plan?: { id: string; plan: { recommendedStack: { database: string } } } };
    };
    expect(startBody.item.session.id).toBeTruthy();
    expect(startBody.item.plan?.plan.recommendedStack.database).toBeTruthy();

    const planId = startBody.item.plan?.id;
    expect(planId).toBeTruthy();
    if (!planId) return;

    const planResponse = await app.inject({ method: "GET", url: `/brainstorm/plan/${planId}` });
    expect(planResponse.statusCode).toBe(200);
    const planBody = planResponse.json() as { item: { plan: { roadmap: unknown[]; selectedSubprompts: unknown[] } } };
    expect(Array.isArray(planBody.item.plan.roadmap)).toBe(true);
    expect(Array.isArray(planBody.item.plan.selectedSubprompts)).toBe(true);

    const applyWithoutApproval = await app.inject({
      method: "POST",
      url: `/brainstorm/plan/${planId}/create-project`,
      payload: {
        projectName: "Brainstorm Created Project"
      }
    });
    expect(applyWithoutApproval.statusCode).toBe(409);

    const approve = await app.inject({
      method: "POST",
      url: `/brainstorm/plan/${planId}/approve`,
      payload: {}
    });
    expect(approve.statusCode).toBe(200);

    const apply = await app.inject({
      method: "POST",
      url: `/brainstorm/plan/${planId}/create-project`,
      payload: {
        projectName: "Brainstorm Created Project"
      }
    });
    expect(apply.statusCode).toBe(200);
    const applyBody = apply.json() as {
      item: {
        session: { id: string; status: "applied" };
        project: { id: string };
        tasks: unknown[];
        roadmapItems: unknown[];
      };
    };
    expect(applyBody.item.session.status).toBe("applied");
    expect(applyBody.item.project.id).toBeTruthy();
    expect(applyBody.item.tasks.length).toBeGreaterThan(0);
    expect(applyBody.item.roadmapItems.length).toBeGreaterThan(0);
  }, 15000);

  it("rejects legacy brainstorm plans that do not use plan.*", async () => {
    const now = new Date().toISOString();
    const { apiStore } = await import("../services/api-store.js");
    await expect(
      apiStore.createBrainstormPlan({
        id: "legacy_plan_contract_test",
        sessionId: "legacy_session_contract_test",
        title: "Legacy plan",
        executiveSummary: "Legacy summary",
        createdAt: now,
        createdBy: "test",
        updatedAt: now,
        updatedBy: "test",
        recommendedStack: {
          database: "PostgreSQL",
          backend: "Fastify",
          frontend: "React",
          llmProviders: ["openai"],
          vectorStore: "pgvector"
        }
      } as unknown as Parameters<typeof apiStore.createBrainstormPlan>[0])
    ).rejects.toThrow(/Legacy top-level plan fields are not supported/);
  });

  it("returns 422 when a stored brainstorm plan payload is not canonical", async () => {
    const now = new Date().toISOString();
    const { apiStore } = await import("../services/api-store.js");

    const canonicalPayload = {
      recommendedStack: {
        database: "PostgreSQL",
        backend: "Fastify",
        frontend: "React",
        llmProviders: ["openai"],
        vectorStore: "pgvector"
      },
      architecture: {
        repositoryStrategy: "monorepo",
        packageLayout: ["apps/api", "apps/web"],
        rationale: "shared contracts"
      },
      suggestedAgents: [],
      suggestedSkills: [],
      providerBindings: [],
      roadmap: [],
      assumptions: [],
      risks: [],
      composedPrompt: "prompt",
      selectedSubprompts: []
    };

    const dbRepo = (
      apiStore as unknown as {
        database?: { repository: (table: "brainstorm_plans") => { create: (row: unknown) => Promise<unknown> } };
      }
    ).database?.repository("brainstorm_plans");

    expect(dbRepo).toBeDefined();

    await dbRepo!.create({
      id: "invalid_nested_plan_payload",
      tenantId: "tenant_default",
      sessionId: "brainstorm_session_001",
      title: "Invalid nested plan payload",
      executiveSummary: "Stored with plan.plan instead of plan payload",
      plan: {
        plan: canonicalPayload
      },
      createdAt: now,
      createdBy: "test",
      updatedAt: now,
      updatedBy: "test"
    });

    const response = await app.inject({
      method: "GET",
      url: "/brainstorm/plan/invalid_nested_plan_payload"
    });

    expect(response.statusCode).toBe(422);
    const body = response.json() as { error: string; message: string };
    expect(body.error).toBe("invalid_contract");
    expect(body.message).toContain("Invalid or missing canonical plan payload");
  });

  it("exposes MCP routes in optional/disabled mode without blocking", async () => {
    const status = await app.inject({ method: "GET", url: "/mcp/status" });
    expect(status.statusCode).toBe(200);
    const statusBody = status.json() as { enabled: boolean; message: string };
    expect(statusBody.enabled).toBe(false);

    const createdConnection = await app.inject({
      method: "POST",
      url: "/mcp/connections",
      payload: {
        name: "test-openclaw",
        baseUrl: "http://localhost:7777",
        enabled: true,
        capabilities: ["diagnostics"]
      }
    });
    expect(createdConnection.statusCode).toBe(200);
    const connectionId = (createdConnection.json() as { item: { id: string } }).item.id;

    const delegated = await app.inject({
      method: "POST",
      url: "/mcp/delegate",
      payload: {
        connectionId,
        operation: "provider.auto_config",
        payload: { dryRun: true }
      }
    });
    expect(delegated.statusCode).toBe(200);
    const delegatedBody = delegated.json() as { item: { status: string; error?: string } };
    expect(delegatedBody.item.status).toBe("failed");
    expect(delegatedBody.item.error).toContain("disabled");
  });

  it("runs manual provider discovery and stores logs", async () => {
    const fakeSearchPayload = [
      "OpenAI GPT-5.x remains widely used.",
      "Anthropic Claude dominates enterprise assistant workloads.",
      "Google Gemini and Mistral AI are top providers in 2026."
    ].join(" ");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(fakeSearchPayload, {
          status: 200,
          headers: { "content-type": "text/plain" }
        })
      )
    );

    const trigger = await app.inject({
      method: "POST",
      url: "/providers/discovery/update",
      payload: {}
    });
    expect(trigger.statusCode).toBe(200);
    const triggerBody = trigger.json() as {
      item: { log: { id: string; discoveredProviders: string[] }; createdModels: number };
    };
    expect(triggerBody.item.log.id).toBeTruthy();
    expect(triggerBody.item.log.discoveredProviders).toContain("openai");
    // Discovery is now scoped to enabled provider configurations when present.
    expect(triggerBody.item.log.discoveredProviders).not.toContain("mistral");

    const logs = await app.inject({ method: "GET", url: "/providers/discovery/logs" });
    expect(logs.statusCode).toBe(200);
    const logsBody = logs.json() as { items: Array<{ id: string }> };
    expect(logsBody.items.some((item) => item.id === triggerBody.item.log.id)).toBe(true);
  });
});
