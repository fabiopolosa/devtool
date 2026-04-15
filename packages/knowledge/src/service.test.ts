import path from "node:path";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { KnowledgeNode, KnowledgeScope } from "@cp/domain";
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
});
