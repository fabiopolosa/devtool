import type { CreateMemoryEntryInput, EmbeddingProvider, MemoryEntry, MemoryService, ProviderRequestContext } from "@cp/domain";
import type { MemoryIndexSink, MemoryIndexingPipeline, IndexableMemoryChunk } from "../indexing/indexing.js";
import { policyForCategory } from "../chunking/policies.js";
import type { MemoryChunkingStrategy } from "../chunking/chunker.js";
import { DefaultMemoryChunkingService } from "../chunking/chunker.js";
import { InMemoryMemoryRepository, createMemoryEntryId } from "../store/memory-store.js";

export interface MemoryControlPlaneOptions {
  repository?: InMemoryMemoryRepository;
  chunkingService?: MemoryChunkingStrategy;
  indexSink?: MemoryIndexSink;
  indexingPipeline?: MemoryIndexingPipeline;
  embeddingProvider?: EmbeddingProvider;
  actor?: string;
}

export class DefaultMemoryService implements MemoryService {
  constructor(
    private readonly repository: InMemoryMemoryRepository,
    private readonly actor = "system"
  ) {}

  async createEntry(input: CreateMemoryEntryInput): Promise<MemoryEntry> {
    const now = new Date().toISOString();
    const entry: MemoryEntry = {
      id: createMemoryEntryId(),
      projectId: input.projectId,
      ...(input.repositoryId ? { repositoryId: input.repositoryId } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {}),
      category: input.category,
      title: input.title,
      body: input.body,
      priority: input.priority ?? 50,
      pinned: input.pinned ?? false,
      ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
      isStale: false,
      createdAt: now,
      createdBy: this.actor,
      updatedAt: now,
      updatedBy: this.actor
    };

    return this.repository.insert(entry);
  }

  async updateEntry(entryId: string, patch: Partial<MemoryEntry>): Promise<MemoryEntry> {
    return this.repository.update(entryId, {
      ...patch,
      updatedAt: new Date().toISOString(),
      updatedBy: this.actor
    });
  }

  async getEntry(entryId: string): Promise<MemoryEntry | null> {
    return this.repository.get(entryId);
  }

  async listEntries(
    projectId: string,
    filters?: Partial<Pick<MemoryEntry, "repositoryId" | "taskId" | "category" | "pinned" | "isStale">>
  ): Promise<MemoryEntry[]> {
    const entries = await this.repository.list(projectId);
    return entries.filter((entry) => {
      if (filters?.repositoryId && entry.repositoryId !== filters.repositoryId) return false;
      if (filters?.taskId && entry.taskId !== filters.taskId) return false;
      if (filters?.category && entry.category !== filters.category) return false;
      if (typeof filters?.pinned === "boolean" && entry.pinned !== filters.pinned) return false;
      if (typeof filters?.isStale === "boolean" && entry.isStale !== filters.isStale) return false;
      return true;
    });
  }

  async markStale(entryId: string, reason: string): Promise<void> {
    const current = await this.repository.get(entryId);
    if (!current) {
      throw new Error(`Memory entry not found: ${entryId}`);
    }
    await this.repository.update(entryId, {
      isStale: true,
      sourceRef: current.sourceRef ? `${current.sourceRef}#stale:${reason}` : `stale:${reason}`,
      updatedAt: new Date().toISOString(),
      updatedBy: this.actor
    });
  }

  async pinEntry(entryId: string, pinned: boolean): Promise<void> {
    await this.repository.update(entryId, {
      pinned,
      updatedAt: new Date().toISOString(),
      updatedBy: this.actor
    });
  }
}

export class DefaultMemoryControlPlane {
  private readonly memoryService: DefaultMemoryService;
  private readonly repository: InMemoryMemoryRepository;
  private readonly chunkingService: MemoryChunkingStrategy;
  private readonly indexSink: MemoryIndexSink;
  private readonly indexingPipeline: MemoryIndexingPipeline;
  private readonly embeddingProvider: EmbeddingProvider | undefined;

  constructor(options: MemoryControlPlaneOptions = {}) {
    this.repository = options.repository ?? new InMemoryMemoryRepository();
    this.memoryService = new DefaultMemoryService(this.repository, options.actor);
    this.chunkingService = options.chunkingService ?? new DefaultMemoryChunkingService();
    this.embeddingProvider = options.embeddingProvider;
    this.indexSink = options.indexSink ?? new (class implements MemoryIndexSink {
      async upsertChunks(): Promise<void> {
        return;
      }
      async deleteChunksByMemoryEntryId(): Promise<void> {
        return;
      }
      async deleteChunksByProjectId(): Promise<void> {
        return;
      }
    })();
    this.indexingPipeline = options.indexingPipeline ?? new (class implements MemoryIndexingPipeline {
      async indexEntry(): Promise<void> {
        return;
      }
      async reindexEntry(): Promise<void> {
        return;
      }
    })();
  }

  get service(): MemoryService {
    return this.memoryService;
  }

  async createAndIndexEntry(input: CreateMemoryEntryInput): Promise<{ entry: MemoryEntry; chunks: IndexableMemoryChunk[] }> {
    const entry = await this.memoryService.createEntry(input);
    const policy = policyForCategory(entry.category);
    const chunks = await this.embedChunks(entry, await this.chunkingService.chunk(entry, policy));
    await this.indexSink.upsertChunks(chunks);
    await this.indexingPipeline.indexEntry(entry, chunks);
    return { entry, chunks };
  }

  async reindexEntry(entryId: string): Promise<IndexableMemoryChunk[]> {
    const entry = await this.memoryService.getEntry(entryId);
    if (!entry) {
      throw new Error(`Memory entry not found: ${entryId}`);
    }
    const policy = policyForCategory(entry.category);
    const chunks = await this.embedChunks(entry, await this.chunkingService.chunk(entry, policy));
    await this.indexSink.deleteChunksByMemoryEntryId(entryId);
    await this.indexSink.upsertChunks(chunks);
    await this.indexingPipeline.reindexEntry(entry, chunks);
    return chunks;
  }

  async reindexProject(projectId: string): Promise<void> {
    await this.indexSink.deleteChunksByProjectId(projectId);
    const entries = await this.repository.list(projectId);
    for (const entry of entries) {
      await this.reindexEntry(entry.id);
    }
  }

  private async embedChunks(entry: MemoryEntry, chunks: IndexableMemoryChunk[]): Promise<IndexableMemoryChunk[]> {
    if (!this.embeddingProvider) {
      return chunks.map((chunk) => ({ ...chunk }));
    }

    const context: ProviderRequestContext = {
      projectId: entry.projectId,
      ...(entry.taskId ? { taskId: entry.taskId } : {})
    };
    const response = await this.embeddingProvider.embed(
      {
        texts: chunks.map((chunk) => chunk.chunkText)
      },
      context
    );

    return chunks.map((chunk, index) => ({
      ...chunk,
      embeddingVector: response.vectors[index] ?? []
    }));
  }
}

export const createMemoryControlPlane = (options: MemoryControlPlaneOptions = {}): DefaultMemoryControlPlane =>
  new DefaultMemoryControlPlane({ ...options, actor: options.actor ?? "system" });
