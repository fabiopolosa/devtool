import type { EmbeddingProvider } from "@cp/domain";
import { DefaultMemoryChunkingService } from "./chunking/chunker.js";
import { createMemoryControlPlane } from "./services/memory.service.js";

const embeddingProviderStub: EmbeddingProvider = {
  provider: "openai",
  capabilityClass: "embedding",
  async discoverModels() {
    return [
      {
        id: "openai:embedding:test",
        provider: "openai",
        modelId: "test-embedding",
        capabilityClass: "embedding"
      }
    ];
  },
  async healthcheck() {
    return { status: "healthy", checkedAt: new Date().toISOString() };
  },
  async embed(request) {
    return {
      vectors: request.texts.map((text) => [text.length, 1, 0]),
      dimensions: 3,
      modelId: "test-embedding"
    };
  }
};

describe("memory service", () => {
  it("chunks markdown entries with semantic headings", async () => {
    const chunker = new DefaultMemoryChunkingService();

    const chunks = await chunker.chunk(
      {
        id: "mem_001",
        projectId: "proj_001",
        category: "architecture_note",
        title: "System architecture",
        body: "# Intake\nPlanner receives requests.\n\n# Execution\nBuilder applies code changes.",
        priority: 80,
        pinned: false,
        isStale: false,
        createdAt: "2026-04-14T10:00:00.000Z",
        createdBy: "tester",
        updatedAt: "2026-04-14T10:00:00.000Z",
        updatedBy: "tester"
      },
      { targetTokens: 200, maxTokens: 220, overlapTokens: 20, splitByHeadings: true }
    );

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.chunkTitle.toLowerCase()).toContain("system architecture");
    expect(chunks.every((chunk) => chunk.tokenEstimate > 0)).toBe(true);
  });

  it("creates, retrieves, and reindexes entries with embedded chunks", async () => {
    const upsertedBatches: number[] = [];

    const controlPlane = createMemoryControlPlane({
      embeddingProvider: embeddingProviderStub,
      indexSink: {
        async upsertChunks(chunks) {
          upsertedBatches.push(chunks.length);
        },
        async deleteChunksByMemoryEntryId() {
          return;
        },
        async deleteChunksByProjectId() {
          return;
        }
      },
      indexingPipeline: {
        async indexEntry() {
          return;
        },
        async reindexEntry() {
          return;
        }
      }
    });

    const created = await controlPlane.createAndIndexEntry({
      projectId: "proj_001",
      category: "task_summary",
      title: "Task execution summary",
      body: "Planner created task specs. Builder implemented route handlers.",
      priority: 60,
      pinned: true,
      sourceRef: "tasks/task_001.md"
    });

    expect(created.entry.id.length).toBeGreaterThan(0);
    expect(created.chunks.length).toBeGreaterThan(0);
    expect(created.chunks.every((chunk) => Array.isArray(chunk.embeddingVector))).toBe(true);
    expect(upsertedBatches[0]).toBeGreaterThan(0);

    const entries = await controlPlane.service.listEntries("proj_001", { pinned: true });
    expect(entries).toHaveLength(1);

    const reindexed = await controlPlane.reindexEntry(created.entry.id);
    expect(reindexed.length).toBeGreaterThan(0);
    expect(upsertedBatches.length).toBeGreaterThanOrEqual(2);
  });
});
