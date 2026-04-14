import type { AgentRoleName } from "../capabilities.js";
import type { ContextPacket } from "../schemas/context-packet.schema.js";

export interface SkillInstruction {
  name: string;
  instructions: string;
  repositoryUrl?: string;
}

export interface SecretReference {
  name: string;
  scope: string;
  description?: string;
}

export interface EnvironmentContext {
  environmentId: string;
  name: string;
  status: string;
  machines: Array<{
    machineId: string;
    name: string;
    status: string;
    cpuCores: number;
    gpuCount: number;
    ramGb: number;
    agents: string[];
    services: string[];
  }>;
}

export interface VersionSnapshotReference {
  snapshotId: string;
  label: string;
  trigger: string;
  localRepositoryId: string;
  taskId?: string;
}

export interface AgentRuntimeContext {
  agentId: string;
  agentName: string;
  role: string;
  runtimeConfig: Record<string, unknown>;
  skillInstructions?: SkillInstruction[];
}

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
  skillInstructions?: SkillInstruction[];
  agentContext?: AgentRuntimeContext;
  secretReferences?: SecretReference[];
  environmentContext?: EnvironmentContext;
  versionSnapshots?: VersionSnapshotReference[];
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
