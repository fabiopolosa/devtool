import type { ID, MemoryCategory, MemoryChunk, MemoryEntry } from "../entities.js";

export interface CreateMemoryEntryInput {
  projectId: ID;
  repositoryId?: ID;
  taskId?: ID;
  category: MemoryCategory;
  title: string;
  body: string;
  priority?: number;
  pinned?: boolean;
  sourceRef?: string;
}

export interface ChunkingPolicy {
  targetTokens: number;
  maxTokens: number;
  overlapTokens: number;
  splitByHeadings: boolean;
}

export interface MemoryChunkingService {
  chunk(entry: MemoryEntry, policy: ChunkingPolicy): Promise<MemoryChunk[]>;
}

export interface MemoryService {
  createEntry(input: CreateMemoryEntryInput): Promise<MemoryEntry>;
  updateEntry(entryId: ID, patch: Partial<MemoryEntry>): Promise<MemoryEntry>;
  getEntry(entryId: ID): Promise<MemoryEntry | null>;
  listEntries(projectId: ID, filters?: Partial<Pick<MemoryEntry, "repositoryId" | "taskId" | "category" | "pinned" | "isStale">>): Promise<MemoryEntry[]>;
  markStale(entryId: ID, reason: string): Promise<void>;
  pinEntry(entryId: ID, pinned: boolean): Promise<void>;
}
