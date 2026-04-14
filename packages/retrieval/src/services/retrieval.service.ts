import type { AgentRoleName, ContextPacket, EmbeddingProvider, ProviderRequestContext, RetrievalQuery, RetrievedChunk, RetrievalService } from "@cp/domain";
import type { ContextPacketBuilder } from "@cp/domain";
import type { RetrievalLogger } from "../logging/retrieval-logger.js";
import type { VectorRecord, VectorStore } from "../vector-store/types.js";
import { estimateTokens, normalizeText, uniqueBy } from "../utils/text.js";

export interface RetrievalExecutionContext extends ProviderRequestContext {
  role: AgentRoleName;
}

export interface SemanticRetrievalServiceOptions {
  vectorStore: VectorStore;
  embeddingProvider: EmbeddingProvider;
  contextPacketBuilder: ContextPacketBuilder;
  logger?: RetrievalLogger;
  vectorLimitMultiplier?: number;
}

export class SemanticRetrievalService implements RetrievalService {
  constructor(private readonly options: SemanticRetrievalServiceOptions) {}

  async retrieve(query: RetrievalQuery): Promise<RetrievedChunk[]> {
    const queryVector = await this.embedQuery(query);
    const vectorLimit = Math.max(query.topK * (this.options.vectorLimitMultiplier ?? 3), query.topK);
    const scored = await this.options.vectorStore.search(queryVector, query.filters, vectorLimit);
    const deduped = uniqueBy(scored, ({ record }) => record.memoryEntryId).slice(0, query.topK);
    const chunks = deduped.map(({ record, score }) => this.toRetrievedChunk(record, score));

    if (this.options.logger) {
      await this.options.logger.log({
        projectId: query.filters.projectId,
        role: query.role,
        queryText: query.query,
        topK: query.topK,
        filters: { ...query.filters } as Record<string, unknown>,
        returnedChunkIds: chunks.map((chunk) => chunk.chunkId),
        tokenEstimate: estimateTokens(query.query)
      });
    }

    return chunks;
  }

  async buildContextPacket(query: RetrievalQuery): Promise<ContextPacket> {
    const chunks = await this.retrieve(query);
    return this.options.contextPacketBuilder.build(query.role, query, chunks);
  }

  private async embedQuery(query: RetrievalQuery): Promise<number[]> {
    const context: ProviderRequestContext = {
      projectId: query.filters.projectId,
      ...(query.filters.taskId ? { taskId: query.filters.taskId } : {}),
      role: query.role
    };
    const response = await this.options.embeddingProvider.embed({ texts: [query.query] }, context);
    return response.vectors[0] ?? [];
  }

  private toRetrievedChunk(record: VectorRecord, score: number): RetrievedChunk {
    return {
      chunkId: record.chunkId,
      memoryEntryId: record.memoryEntryId,
      score,
      chunkText: normalizeText(record.chunkText),
      chunkTitle: record.chunkTitle,
      category: record.category,
      tokenEstimate: record.chunkText.length > 0 ? estimateTokens(record.chunkText) : 0,
      ...(record.sourceRef ? { sourceRef: record.sourceRef } : {})
    };
  }
}
