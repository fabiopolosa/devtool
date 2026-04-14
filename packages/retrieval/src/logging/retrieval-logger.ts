import type { RetrievalQueryLog } from "@cp/domain";
import { randomUUID } from "node:crypto";

export interface RetrievalLogInput extends Omit<RetrievalQueryLog, "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"> {
  id?: string;
}

export interface RetrievalLogger {
  log(entry: RetrievalLogInput): Promise<RetrievalQueryLog>;
  list(projectId: string): Promise<RetrievalQueryLog[]>;
}

export class InMemoryRetrievalLogger implements RetrievalLogger {
  private readonly entries: RetrievalQueryLog[] = [];

  async log(entry: RetrievalLogInput): Promise<RetrievalQueryLog> {
    const now = new Date().toISOString();
    const record: RetrievalQueryLog = {
      id: entry.id ?? randomUUID(),
      projectId: entry.projectId,
      ...(entry.taskRunId ? { taskRunId: entry.taskRunId } : {}),
      role: entry.role,
      queryText: entry.queryText,
      topK: entry.topK,
      filters: entry.filters,
      returnedChunkIds: entry.returnedChunkIds,
      tokenEstimate: entry.tokenEstimate,
      createdAt: now,
      createdBy: "system",
      updatedAt: now,
      updatedBy: "system"
    };
    this.entries.push(record);
    return record;
  }

  async list(projectId: string): Promise<RetrievalQueryLog[]> {
    return this.entries.filter((entry) => entry.projectId === projectId);
  }
}
