import path from "node:path";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { EmbeddingProvider, KnowledgeNode, KnowledgeScope } from "@cp/domain";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { KnowledgeService, type KnowledgeNodeStore } from "./service.js";

class InMemoryKnowledgeStore implements KnowledgeNodeStore {
  private readonly rows = new Map<string, KnowledgeNode>();

  async listKnowledgeNodes(filters?: {
    tenantId?: string;
    projectId?: string;
    scope?: KnowledgeScope;
    path?: string;
  }): Promise<KnowledgeNode[]> {
    const values = [...this.rows.values()];
    if (!filters) return values;
    return values.filter((item) => {
      if (filters.scope && item.scope !== filters.scope) return false;
      if (filters.path && item.path !== filters.path) return false;
      if (filters.tenantId !== undefined && item.tenantId !== filters.tenantId) return false;
      if (filters.projectId !== undefined && item.projectId !== filters.projectId) return false;
      return true;
    });
  }

  async getKnowledgeNodeById(knowledgeNodeId: string): Promise<KnowledgeNode | null> {
    return this.rows.get(knowledgeNodeId) ?? null;
  }

  async findKnowledgeNodeByScopePath(scope: KnowledgeScope, nodePath: string): Promise<KnowledgeNode | null> {
    for (const row of this.rows.values()) {
      if (row.scope === scope && row.path === nodePath) return row;
    }
    return null;
  }

  async createKnowledgeNode(node: KnowledgeNode): Promise<KnowledgeNode> {
    this.rows.set(node.id, node);
    return node;
  }

  async updateKnowledgeNode(knowledgeNodeId: string, patch: Partial<KnowledgeNode>): Promise<KnowledgeNode> {
    const current = this.rows.get(knowledgeNodeId);
    if (!current) {
      throw new Error("not found");
    }
    const next = { ...current, ...patch };
    this.rows.set(knowledgeNodeId, next);
    return next;
  }

  async deleteKnowledgeNode(knowledgeNodeId: string): Promise<void> {
    this.rows.delete(knowledgeNodeId);
  }
}

describe("KnowledgeService", () => {
  const store = new InMemoryKnowledgeStore();
  const service = new KnowledgeService({ store });
  let workspace: string | null = null;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "cp-knowledge-"));
  });

  afterEach(async () => {
    if (workspace) {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("creates and searches nodes with scope isolation", async () => {
    await service.createKnowledgeNode(
      {
        scope: "system",
        path: "/system/principles/runtime.md",
        content: "# Runtime\nJobs execute through DAG."
      },
      "test"
    );
    await service.createKnowledgeNode(
      {
        scope: "tenant",
        tenantId: "tenant_default",
        path: "/tenants/tenant_default/ops/retries.md",
        content: "# Retry policy\nRetry transient provider errors."
      },
      "test"
    );
    await service.createKnowledgeNode(
      {
        scope: "project",
        projectId: "proj_001",
        path: "/projects/proj_001/decisions/prompt-builder.md",
        content: "# Prompt builder\nAll composition goes through prompt-builder."
      },
      "test"
    );

    const results = await service.searchKnowledge({
      tenantId: "tenant_default",
      projectId: "proj_001",
      query: "prompt builder and retries",
      limit: 5
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((result) => result.item.scope === "project")).toBe(true);
    expect(results.some((result) => result.item.scope === "tenant")).toBe(true);
  });

  it("syncs markdown filesystem drafts into store", async () => {
    if (!workspace) throw new Error("workspace not initialized");
    await mkdir(path.join(workspace, "projects/proj_001"), { recursive: true });
    await writeFile(
      path.join(workspace, "projects/proj_001", "runtime.md"),
      "# Runtime\nProject runtime notes."
    );
    await mkdir(path.join(workspace, "system/architecture"), { recursive: true });
    await writeFile(
      path.join(workspace, "system/architecture", "boundaries.md"),
      "# Boundaries\nKeep orchestration explicit."
    );

    const fsService = new KnowledgeService({
      store,
      knowledgeRootDir: workspace
    });
    const sync = await fsService.syncFilesystem("sync");

    expect(sync.scanned).toBe(2);
    expect(sync.created).toBeGreaterThanOrEqual(2);

    const list = await fsService.listKnowledge();
    expect(list.some((item) => item.path === "/projects/proj_001/runtime.md")).toBe(true);
    expect(list.some((item) => item.path === "/system/architecture/boundaries.md")).toBe(true);
  });

  it("resolves retrieval policy and includes context notes without vector search", async () => {
    const policy = service.resolveRetrievalPolicy({
      limit: 12,
      threshold: 0.35,
      contextNotesLimit: 3
    });

    expect(policy.limit).toBe(12);
    expect(policy.threshold).toBe(0.35);
    expect(policy.includeContextNotes).toBe(true);
    expect(policy.contextNotesLimit).toBe(3);

    await service.createKnowledgeNode(
      {
        scope: "project",
        projectId: "proj_knowledge",
        path: "/projects/proj_knowledge/notes/decision.md",
        content: "# Decision\n\nPrefer compact knowledge injection."
      },
      "test"
    );

    const compact = await service.buildGenerationKnowledgeContext({
      tenantId: "tenant_default",
      projectId: "proj_knowledge",
      query: "compact knowledge injection",
      limit: 5,
      contextNotes: [
        {
          id: "ctx_001",
          path: "/projects/proj_knowledge/context/strategy.md",
          title: "Strategy",
          content: "# Strategy\n\nUse linked context notes for decisions."
        },
        {
          id: "ctx_002",
          path: "/projects/proj_knowledge/context/noise.md",
          title: "Noise",
          content: "Unrelated note"
        }
      ]
    });

    expect(compact.some((entry) => entry.scope === "context-notes")).toBe(true);
    expect(compact.some((entry) => entry.sourceType === "context-note")).toBe(true);
    expect(compact.some((entry) => entry.scope === "project")).toBe(true);
    expect(compact.length).toBeLessThanOrEqual(5);
  });

  it("keeps at least one context note in generation context when notes exist", async () => {
    await service.createKnowledgeNode(
      {
        scope: "project",
        projectId: "proj_context_keep",
        path: "/projects/proj_context_keep/notes/runtime.md",
        content: "# Runtime\nKeep retrieval deterministic."
      },
      "test"
    );

    const compact = await service.buildGenerationKnowledgeContext({
      tenantId: "tenant_default",
      projectId: "proj_context_keep",
      query: "deterministic retrieval",
      limit: 3,
      threshold: 0.95,
      contextNotesLimit: 2,
      contextNotes: [
        {
          id: "ctx_low_score",
          path: "/projects/proj_context_keep/context/meeting.md",
          title: "Meeting",
          content: "Follow-up checklist."
        }
      ]
    });

    expect(compact.some((entry) => entry.sourceType === "context-note")).toBe(true);
  });

  it("generates embeddings on create and syncs semantic store when missing", async () => {
    const localStore = new InMemoryKnowledgeStore();
    const upserts: Array<{ nodeId: string; embedding: number[] }> = [];
    const embeddingProvider: EmbeddingProvider = {
      provider: "openai",
      capabilityClass: "embedding",
      discoverModels: async () => [],
      healthcheck: async () => ({ status: "healthy", checkedAt: new Date().toISOString() }),
      embed: async ({ texts }) => ({
        vectors: texts.map((text) => [
          text.toLowerCase().includes("runner") ? 1 : 0.25,
          text.toLowerCase().includes("knowledge") ? 1 : 0.1,
          0.5
        ]),
        dimensions: 3,
        modelId: "test-embedding"
      })
    };

    const serviceWithSemanticStore = new KnowledgeService({
      store: localStore,
      embeddingProvider,
      semanticStore: {
        searchKnowledge: async () => ({ available: true, hits: [] }),
        upsertKnowledgeEmbedding: async (nodeId, embedding) => {
          upserts.push({ nodeId, embedding });
          return true;
        }
      }
    });

    const created = await serviceWithSemanticStore.createKnowledgeNode(
      {
        scope: "project",
        tenantId: "tenant_default",
        projectId: "proj_semantic",
        path: "/projects/proj_semantic/runtime/runner.md",
        content: "# Runner\nKnowledge retrieval should use pgvector."
      },
      "test"
    );

    expect(Array.isArray(created.embedding)).toBe(true);
    expect((created.embedding ?? []).length).toBeGreaterThan(0);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.nodeId).toBe(created.id);
    expect(upserts[0]?.embedding.length).toBeGreaterThan(0);
  });

  it("falls back to local semantic scoring when pgvector is unavailable", async () => {
    const localStore = new InMemoryKnowledgeStore();
    const embeddingProvider: EmbeddingProvider = {
      provider: "openai",
      capabilityClass: "embedding",
      discoverModels: async () => [],
      healthcheck: async () => ({ status: "healthy", checkedAt: new Date().toISOString() }),
      embed: async ({ texts }) => ({
        vectors: texts.map((text) => [
          text.toLowerCase().includes("runner") ? 1 : 0.2,
          text.toLowerCase().includes("knowledge") ? 1 : 0.1,
          text.length / 100
        ]),
        dimensions: 3,
        modelId: "test-embedding"
      })
    };

    const serviceWithFallback = new KnowledgeService({
      store: localStore,
      embeddingProvider,
      semanticStore: {
        searchKnowledge: async () => ({ available: false, hits: [] })
      }
    });

    await serviceWithFallback.createKnowledgeNode(
      {
        scope: "project",
        tenantId: "tenant_default",
        projectId: "proj_fallback",
        path: "/projects/proj_fallback/runtime/runner.md",
        content: "# Runner\nRunner injects knowledge context."
      },
      "test"
    );
    await serviceWithFallback.createKnowledgeNode(
      {
        scope: "project",
        tenantId: "tenant_default",
        projectId: "proj_fallback",
        path: "/projects/proj_fallback/misc/note.md",
        content: "# Misc\nLow relevance note."
      },
      "test"
    );

    const results = await serviceWithFallback.searchKnowledge({
      tenantId: "tenant_default",
      projectId: "proj_fallback",
      query: "runner knowledge context",
      limit: 1,
      threshold: 0.2
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.source).toBe("semantic");
    expect(results[0]?.score).toBeGreaterThanOrEqual(0.2);
  });

  it("caches retrieval queries with short ttl and invalidates on knowledge updates", async () => {
    const localStore = new InMemoryKnowledgeStore();
    let nowMs = Date.parse("2026-04-17T10:00:00.000Z");
    let semanticSearchCalls = 0;
    const embeddingProvider: EmbeddingProvider = {
      provider: "openai",
      capabilityClass: "embedding",
      discoverModels: async () => [],
      healthcheck: async () => ({ status: "healthy", checkedAt: new Date(nowMs).toISOString() }),
      embed: async ({ texts }) => ({
        vectors: texts.map((text) => [text.length / 100, text.toLowerCase().includes("cache") ? 1 : 0.2]),
        dimensions: 2,
        modelId: "test-embedding"
      })
    };

    const serviceWithCache = new KnowledgeService({
      store: localStore,
      embeddingProvider,
      searchCacheTtlMs: 3_000,
      now: () => new Date(nowMs),
      semanticStore: {
        searchKnowledge: async () => {
          semanticSearchCalls += 1;
          const rows = await localStore.listKnowledgeNodes({ projectId: "proj_cache" });
          return {
            available: true,
            hits: rows.map((item) => ({ item, score: 0.9, source: "semantic" as const }))
          };
        },
        upsertKnowledgeEmbedding: async () => true
      }
    });

    const created = await serviceWithCache.createKnowledgeNode(
      {
        scope: "project",
        tenantId: "tenant_default",
        projectId: "proj_cache",
        path: "/projects/proj_cache/notes/cache.md",
        content: "# Cache\nKeep retrieval responses stable."
      },
      "test"
    );
    expect(created.id).toBeDefined();

    await serviceWithCache.searchKnowledge({
      tenantId: "tenant_default",
      projectId: "proj_cache",
      query: "cache retrieval",
      limit: 1
    });
    await serviceWithCache.searchKnowledge({
      tenantId: "tenant_default",
      projectId: "proj_cache",
      query: "cache retrieval",
      limit: 1
    });
    expect(semanticSearchCalls).toBe(1);

    nowMs += 4_000;
    await serviceWithCache.searchKnowledge({
      tenantId: "tenant_default",
      projectId: "proj_cache",
      query: "cache retrieval",
      limit: 1
    });
    expect(semanticSearchCalls).toBe(2);

    await serviceWithCache.updateKnowledgeNode(
      created.id,
      {
        content: "# Cache\nUpdated note should invalidate cache."
      },
      "test"
    );
    await serviceWithCache.searchKnowledge({
      tenantId: "tenant_default",
      projectId: "proj_cache",
      query: "cache retrieval",
      limit: 1
    });
    expect(semanticSearchCalls).toBe(3);
  });
});
