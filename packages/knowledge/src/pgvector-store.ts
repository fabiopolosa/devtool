import type { KnowledgeNode } from "@cp/domain";
import type { SearchKnowledgeResult } from "./service.js";

export interface SqlQueryExecutor {
  query<T extends Record<string, unknown>>(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<{ rows: T[] }>;
}

export interface PgVectorStoreAdapterOptions {
  executor: SqlQueryExecutor;
  dimensions?: number;
  logger?: {
    warn?(message: string, metadata?: Record<string, unknown>): void;
  };
}

export interface PgVectorKnowledgeSearchInput {
  tenantId: string;
  projectId?: string;
  queryEmbedding: number[];
  limit: number;
  threshold: number;
}

interface AvailabilityCheckRow extends Record<string, unknown> {
  available?: boolean;
}

interface ColumnCheckRow extends Record<string, unknown> {
  exists?: boolean;
}

interface KnowledgeVectorRow extends Record<string, unknown> {
  id: string;
  tenant_id: string | null;
  project_id: string | null;
  scope: string;
  path: string;
  content: string;
  embedding: number[] | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  score: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const normalizeEmbedding = (embedding: number[], dimensions: number): number[] => {
  if (embedding.length === dimensions) return embedding;
  if (embedding.length > dimensions) return embedding.slice(0, dimensions);
  return [...embedding, ...new Array(dimensions - embedding.length).fill(0)];
};

const toVectorLiteral = (embedding: number[]): string =>
  `[${embedding.map((value) => Number(value.toFixed(8))).join(",")}]`;

const asIsoString = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value;
};

const asKnowledgeNode = (row: KnowledgeVectorRow): KnowledgeNode => ({
  id: row.id,
  ...(row.tenant_id ? { tenantId: row.tenant_id } : {}),
  ...(row.project_id ? { projectId: row.project_id } : {}),
  scope: row.scope === "tenant" || row.scope === "project" ? row.scope : "system",
  path: row.path,
  content: row.content,
  ...(Array.isArray(row.embedding) ? { embedding: row.embedding } : {}),
  createdAt: asIsoString(row.created_at),
  createdBy: asIsoString(row.created_by),
  updatedAt: asIsoString(row.updated_at),
  updatedBy: asIsoString(row.updated_by)
});

const isPgVectorUnavailableError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const pgCode = (error as { code?: unknown }).code;
  if (pgCode === "42883" || pgCode === "42704" || pgCode === "58P01") {
    return true;
  }
  const message =
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message.toLowerCase()
      : "";
  return (
    message.includes("operator does not exist") ||
    message.includes("type \"vector\" does not exist") ||
    message.includes("embedding_vector")
  );
};

export class PgVectorStoreAdapter {
  private readonly dimensions: number;
  private availability: "unknown" | "available" | "unavailable" = "unknown";

  constructor(private readonly options: PgVectorStoreAdapterOptions) {
    this.dimensions = Math.max(1, Math.trunc(options.dimensions ?? 3072));
  }

  async isAvailable(): Promise<boolean> {
    if (this.availability === "available") return true;
    if (this.availability === "unavailable") return false;

    try {
      const extensionCheck = await this.options.executor.query<AvailabilityCheckRow>(
        `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') AS available`
      );
      const extensionEnabled = Boolean(extensionCheck.rows[0]?.available);
      if (!extensionEnabled) {
        this.availability = "unavailable";
        return false;
      }

      const columnCheck = await this.options.executor.query<ColumnCheckRow>(
        `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'knowledge_nodes'
            AND column_name = 'embedding_vector'
        ) AS exists
        `
      );

      const hasColumn = Boolean(columnCheck.rows[0]?.exists);
      this.availability = hasColumn ? "available" : "unavailable";
      return hasColumn;
    } catch (error) {
      this.availability = "unavailable";
      this.options.logger?.warn?.("pgvector availability check failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  async upsertKnowledgeEmbedding(nodeId: string, embedding: number[]): Promise<boolean> {
    if (!(await this.isAvailable())) {
      return false;
    }

    if (embedding.length === 0) return false;

    const normalized = normalizeEmbedding(embedding, this.dimensions);
    const literal = toVectorLiteral(normalized);

    try {
      await this.options.executor.query(
        `
        UPDATE knowledge_nodes
        SET embedding_vector = $2::vector
        WHERE id = $1
        `,
        [nodeId, literal]
      );
      return true;
    } catch (error) {
      if (isPgVectorUnavailableError(error)) {
        this.availability = "unavailable";
        this.options.logger?.warn?.("pgvector embedding write unavailable", {
          error: error instanceof Error ? error.message : String(error)
        });
        return false;
      }
      throw error;
    }
  }

  async searchKnowledge(input: PgVectorKnowledgeSearchInput): Promise<{ available: boolean; hits: SearchKnowledgeResult[] }> {
    const limit = Math.max(1, Math.trunc(input.limit));
    const threshold = clamp(input.threshold, 0, 1);

    if (!(await this.isAvailable())) {
      return { available: false, hits: [] };
    }

    const queryEmbedding = normalizeEmbedding(input.queryEmbedding, this.dimensions);
    const queryVector = toVectorLiteral(queryEmbedding);

    try {
      const rows = await this.options.executor.query<KnowledgeVectorRow>(
        `
        SELECT
          id,
          tenant_id,
          project_id,
          scope,
          path,
          content,
          embedding,
          created_at,
          created_by,
          updated_at,
          updated_by,
          1 - (embedding_vector <=> $1::vector) AS score
        FROM knowledge_nodes
        WHERE embedding_vector IS NOT NULL
          AND (
            scope = 'system'
            OR (scope = 'tenant' AND tenant_id = $2)
            OR ($3::text IS NOT NULL AND scope = 'project' AND tenant_id = $2 AND project_id = $3)
          )
        ORDER BY embedding_vector <=> $1::vector ASC, updated_at DESC
        LIMIT $4
        `,
        [queryVector, input.tenantId, input.projectId ?? null, limit]
      );

      const hits: SearchKnowledgeResult[] = rows.rows
        .map((row) => {
          const score = typeof row.score === "number" ? row.score : Number(row.score ?? 0);
          return {
            item: asKnowledgeNode(row),
            score,
            source: "semantic" as const
          };
        })
        .filter((entry) => Number.isFinite(entry.score) && entry.score >= threshold)
        .sort((left, right) => right.score - left.score || right.item.updatedAt.localeCompare(left.item.updatedAt))
        .slice(0, limit);

      return {
        available: true,
        hits
      };
    } catch (error) {
      if (isPgVectorUnavailableError(error)) {
        this.availability = "unavailable";
        this.options.logger?.warn?.("pgvector semantic query unavailable", {
          error: error instanceof Error ? error.message : String(error)
        });
        return { available: false, hits: [] };
      }
      throw error;
    }
  }
}
