import type { CapabilityClass } from "@cp/domain";

export interface VectorRecordMetadata {
  [key: string]: string | number | boolean | undefined;
}

export interface VectorRecord {
  id: string;
  projectId: string;
  repositoryId?: string;
  taskId?: string;
  memoryEntryId: string;
  chunkId: string;
  chunkTitle: string;
  chunkText: string;
  category: string;
  sourceRef?: string;
  priority: number;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  metadata: VectorRecordMetadata;
  embedding: number[];
}

export interface VectorSearchFilters {
  projectId: string;
  repositoryId?: string;
  taskId?: string;
  categories?: string[];
  from?: string;
  to?: string;
  minPriority?: number;
  pinnedOnly?: boolean;
}

export interface VectorSearchResult {
  record: VectorRecord;
  score: number;
}

export interface VectorStore {
  name: string;
  capabilityClass: CapabilityClass;
  upsert(records: VectorRecord[]): Promise<void>;
  deleteByChunkIds(chunkIds: string[]): Promise<void>;
  deleteByMemoryEntryId(memoryEntryId: string): Promise<void>;
  deleteByProjectId(projectId: string): Promise<void>;
  search(queryVector: number[], filters: VectorSearchFilters, limit: number): Promise<VectorSearchResult[]>;
  getByChunkId(chunkId: string): Promise<VectorRecord | null>;
}
