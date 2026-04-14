import type { AgentRoleName } from "../capabilities.js";
import type { ContextPacket } from "../schemas/context-packet.schema.js";

export interface RetrievalFilters {
  projectId: string;
  repositoryId?: string;
  taskId?: string;
  categories?: string[];
  from?: string;
  to?: string;
  minPriority?: number;
  pinnedOnly?: boolean;
}

export interface RetrievalQuery {
  role: AgentRoleName;
  query: string;
  topK: number;
  filters: RetrievalFilters;
}

export interface RetrievedChunk {
  chunkId: string;
  memoryEntryId: string;
  score: number;
  chunkText: string;
  chunkTitle: string;
  category: string;
  tokenEstimate: number;
  sourceRef?: string;
}

export interface RetrievalService {
  retrieve(query: RetrievalQuery): Promise<RetrievedChunk[]>;
}

export interface ContextPacketBuilder {
  build(role: AgentRoleName, query: RetrievalQuery, chunks: RetrievedChunk[]): Promise<ContextPacket>;
}
