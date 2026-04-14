import type { MemoryChunk, MemoryEntry } from "@cp/domain";

export interface IndexableMemoryChunk extends MemoryChunk {
  embeddingVector?: number[];
}

export interface MemoryIndexSink {
  upsertChunks(chunks: IndexableMemoryChunk[]): Promise<void>;
  deleteChunksByMemoryEntryId(memoryEntryId: string): Promise<void>;
  deleteChunksByProjectId(projectId: string): Promise<void>;
}

export interface MemoryIndexingPipeline {
  indexEntry(entry: MemoryEntry, chunks: IndexableMemoryChunk[]): Promise<void>;
  reindexEntry(entry: MemoryEntry, chunks: IndexableMemoryChunk[]): Promise<void>;
}

export class NoopMemoryIndexSink implements MemoryIndexSink {
  async upsertChunks(): Promise<void> {
    return;
  }

  async deleteChunksByMemoryEntryId(): Promise<void> {
    return;
  }

  async deleteChunksByProjectId(): Promise<void> {
    return;
  }
}

export class NoopMemoryIndexingPipeline implements MemoryIndexingPipeline {
  async indexEntry(): Promise<void> {
    return;
  }

  async reindexEntry(): Promise<void> {
    return;
  }
}
