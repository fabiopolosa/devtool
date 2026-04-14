import type { MemoryEntry } from "@cp/domain";
import { newId } from "../utils/ids.js";

export interface MemoryRepository {
  insert(entry: MemoryEntry): Promise<MemoryEntry>;
  update(entryId: string, patch: Partial<MemoryEntry>): Promise<MemoryEntry>;
  get(entryId: string): Promise<MemoryEntry | null>;
  list(projectId: string): Promise<MemoryEntry[]>;
  listAll(): Promise<MemoryEntry[]>;
}

export class InMemoryMemoryRepository implements MemoryRepository {
  private readonly entries = new Map<string, MemoryEntry>();

  async insert(entry: MemoryEntry): Promise<MemoryEntry> {
    this.entries.set(entry.id, entry);
    return entry;
  }

  async update(entryId: string, patch: Partial<MemoryEntry>): Promise<MemoryEntry> {
    const existing = this.entries.get(entryId);
    if (!existing) {
      throw new Error(`Memory entry not found: ${entryId}`);
    }
    const updated: MemoryEntry = { ...existing, ...patch, updatedAt: patch.updatedAt ?? existing.updatedAt, updatedBy: patch.updatedBy ?? existing.updatedBy };
    this.entries.set(entryId, updated);
    return updated;
  }

  async get(entryId: string): Promise<MemoryEntry | null> {
    return this.entries.get(entryId) ?? null;
  }

  async list(projectId: string): Promise<MemoryEntry[]> {
    return [...this.entries.values()].filter((entry) => entry.projectId === projectId);
  }

  async listAll(): Promise<MemoryEntry[]> {
    return [...this.entries.values()];
  }
}

export const createAuditFields = (actor = "system"): Pick<MemoryEntry, "createdAt" | "createdBy" | "updatedAt" | "updatedBy"> => {
  const now = new Date().toISOString();
  return {
    createdAt: now,
    createdBy: actor,
    updatedAt: now,
    updatedBy: actor
  };
};

export const createMemoryEntryId = (): string => newId();
