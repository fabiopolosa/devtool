import { describe, expect, it } from "vitest";
import { PgVectorStoreAdapter, type SqlQueryExecutor } from "./pgvector-store.js";

interface TestKnowledgeRow {
  id: string;
  tenant_id: string | null;
  project_id: string | null;
  scope: "system" | "tenant" | "project";
  path: string;
  content: string;
  embedding: number[] | null;
  embedding_vector: number[] | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}

const cosineSimilarity = (left: number[], right: number[]): number => {
  const size = Math.min(left.length, right.length);
  if (size === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < size; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    dot += l * r;
    leftNorm += l * l;
    rightNorm += r * r;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
};

const parseVectorLiteral = (value: unknown): number[] => {
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  const body = trimmed.slice(1, -1).trim();
  if (!body) return [];
  return body
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
};

class FakeExecutor implements SqlQueryExecutor {
  constructor(
    private readonly rows: TestKnowledgeRow[],
    private readonly options: { extensionEnabled?: boolean; columnExists?: boolean } = {}
  ) {}

  async query<T extends Record<string, unknown>>(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<{ rows: T[] }> {
    if (text.includes("FROM pg_extension")) {
      return {
        rows: [{ available: this.options.extensionEnabled ?? true }] as unknown as T[]
      };
    }

    if (text.includes("FROM information_schema.columns")) {
      return {
        rows: [{ exists: this.options.columnExists ?? true }] as unknown as T[]
      };
    }

    if (text.includes("UPDATE knowledge_nodes") && params) {
      const nodeId = String(params[0] ?? "");
      const vector = parseVectorLiteral(params[1]);
      const row = this.rows.find((item) => item.id === nodeId);
      if (row) {
        row.embedding_vector = vector;
      }
      return { rows: [] };
    }

    if (text.includes("FROM knowledge_nodes") && params) {
      const queryVector = parseVectorLiteral(params[0]);
      const tenantId = typeof params[1] === "string" ? params[1] : "";
      const projectId = typeof params[2] === "string" ? params[2] : null;
      const limit = typeof params[3] === "number" ? params[3] : Number(params[3] ?? 10);

      const scoped = this.rows
        .filter((row) => Array.isArray(row.embedding_vector) && row.embedding_vector.length > 0)
        .filter((row) => {
          if (row.scope === "system") return true;
          if (row.scope === "tenant") return row.tenant_id === tenantId;
          if (row.scope === "project") {
            if (!projectId) return false;
            return row.tenant_id === tenantId && row.project_id === projectId;
          }
          return false;
        })
        .map((row) => ({
          ...row,
          score: cosineSimilarity(queryVector, row.embedding_vector ?? [])
        }))
        .sort((left, right) => right.score - left.score || right.updated_at.localeCompare(left.updated_at))
        .slice(0, Math.max(1, limit));

      return {
        rows: scoped as unknown as T[]
      };
    }

    return { rows: [] };
  }
}

const node = (input: {
  id: string;
  scope: "system" | "tenant" | "project";
  tenantId?: string;
  projectId?: string;
  vector?: number[];
}): TestKnowledgeRow => ({
  id: input.id,
  tenant_id: input.tenantId ?? null,
  project_id: input.projectId ?? null,
  scope: input.scope,
  path: `/node/${input.id}.md`,
  content: `content:${input.id}`,
  embedding: input.vector ?? null,
  embedding_vector: input.vector ?? null,
  created_at: "2026-01-01T00:00:00.000Z",
  created_by: "test",
  updated_at: "2026-01-01T00:00:00.000Z",
  updated_by: "test"
});

describe("PgVectorStoreAdapter", () => {
  it("upserts embeddings into vector column", async () => {
    const rows = [node({ id: "node_1", scope: "system" })];
    const adapter = new PgVectorStoreAdapter({
      executor: new FakeExecutor(rows),
      dimensions: 4
    });

    const inserted = await adapter.upsertKnowledgeEmbedding("node_1", [1, 2]);

    expect(inserted).toBe(true);
    expect(rows[0]?.embedding_vector).toEqual([1, 2, 0, 0]);
  });

  it("queries similarity with tenant/project scope isolation", async () => {
    const rows = [
      node({ id: "sys", scope: "system", vector: [1, 0, 0, 0] }),
      node({ id: "tenant_ok", scope: "tenant", tenantId: "tenant_a", vector: [0.95, 0, 0, 0] }),
      node({ id: "tenant_other", scope: "tenant", tenantId: "tenant_b", vector: [0.99, 0, 0, 0] }),
      node({
        id: "project_ok",
        scope: "project",
        tenantId: "tenant_a",
        projectId: "project_1",
        vector: [0.9, 0, 0, 0]
      }),
      node({
        id: "project_other",
        scope: "project",
        tenantId: "tenant_a",
        projectId: "project_2",
        vector: [0.98, 0, 0, 0]
      })
    ];

    const adapter = new PgVectorStoreAdapter({
      executor: new FakeExecutor(rows),
      dimensions: 4
    });

    const result = await adapter.searchKnowledge({
      tenantId: "tenant_a",
      projectId: "project_1",
      queryEmbedding: [1, 0, 0, 0],
      limit: 8,
      threshold: 0
    });

    expect(result.available).toBe(true);
    const ids = result.hits.map((hit) => hit.item.id);
    expect(ids).toContain("sys");
    expect(ids).toContain("tenant_ok");
    expect(ids).toContain("project_ok");
    expect(ids).not.toContain("tenant_other");
    expect(ids).not.toContain("project_other");
  });

  it("returns unavailable when pgvector extension is missing", async () => {
    const adapter = new PgVectorStoreAdapter({
      executor: new FakeExecutor([], { extensionEnabled: false })
    });

    const result = await adapter.searchKnowledge({
      tenantId: "tenant_a",
      queryEmbedding: [1, 0, 0],
      limit: 4,
      threshold: 0
    });

    expect(result.available).toBe(false);
    expect(result.hits).toEqual([]);
  });
});
