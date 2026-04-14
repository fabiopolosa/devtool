import type { CapabilityClass } from "@cp/domain";
import { cosineSimilarity } from "../utils/text.js";
import type { VectorRecord, VectorSearchFilters, VectorSearchResult, VectorStore } from "./types.js";

export abstract class BaseInMemoryVectorStore implements VectorStore {
  protected readonly records = new Map<string, VectorRecord>();

  constructor(
    public readonly name: string,
    public readonly capabilityClass: CapabilityClass
  ) {}

  async upsert(records: VectorRecord[]): Promise<void> {
    for (const record of records) {
      this.records.set(record.chunkId, record);
    }
  }

  async deleteByChunkIds(chunkIds: string[]): Promise<void> {
    for (const chunkId of chunkIds) {
      this.records.delete(chunkId);
    }
  }

  async deleteByMemoryEntryId(memoryEntryId: string): Promise<void> {
    for (const [chunkId, record] of this.records.entries()) {
      if (record.memoryEntryId === memoryEntryId) {
        this.records.delete(chunkId);
      }
    }
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    for (const [chunkId, record] of this.records.entries()) {
      if (record.projectId === projectId) {
        this.records.delete(chunkId);
      }
    }
  }

  async getByChunkId(chunkId: string): Promise<VectorRecord | null> {
    return this.records.get(chunkId) ?? null;
  }

  async search(queryVector: number[], filters: VectorSearchFilters, limit: number): Promise<VectorSearchResult[]> {
    const candidates = [...this.records.values()].filter((record) => this.matchesFilters(record, filters));
    const scored = candidates
      .map((record) => ({ record, score: cosineSimilarity(queryVector, record.embedding) }))
      .sort((left, right) => right.score - left.score || right.record.priority - left.record.priority || Number(right.record.pinned) - Number(left.record.pinned));
    return scored.slice(0, limit);
  }

  protected matchesFilters(record: VectorRecord, filters: VectorSearchFilters): boolean {
    if (record.projectId !== filters.projectId) return false;
    if (filters.repositoryId && record.repositoryId !== filters.repositoryId) return false;
    if (filters.taskId && record.taskId !== filters.taskId) return false;
    if (filters.categories?.length && !filters.categories.includes(record.category)) return false;
    if (typeof filters.minPriority === "number" && record.priority < filters.minPriority) return false;
    if (filters.pinnedOnly && !record.pinned) return false;
    if (filters.from && record.createdAt < filters.from) return false;
    if (filters.to && record.createdAt > filters.to) return false;
    return true;
  }
}

export class PgVectorStoreAdapter extends BaseInMemoryVectorStore {
  constructor() {
    super("pgvector", "embedding");
  }
}

export class QdrantVectorStoreAdapter extends BaseInMemoryVectorStore {
  constructor() {
    super("qdrant", "embedding");
  }
}

export class InMemoryVectorStore extends BaseInMemoryVectorStore {
  constructor(name = "in-memory-vector-store") {
    super(name, "embedding");
  }
}
