import type { EmbeddingProvider } from "@cp/domain";
import { DefaultContextPacketBuilder } from "./services/context-packet-builder.js";
import { SemanticRetrievalService } from "./services/retrieval.service.js";
import { InMemoryRetrievalLogger } from "./logging/retrieval-logger.js";
import { InMemoryVectorStore } from "./vector-store/in-memory-vector-store.js";

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
  async embed() {
    return {
      vectors: [[1, 0, 0]],
      dimensions: 3,
      modelId: "test-embedding"
    };
  }
};

describe("retrieval service", () => {
  it("retrieves top-k with dedupe and logs query", async () => {
    const vectorStore = new InMemoryVectorStore();
    const logger = new InMemoryRetrievalLogger();

    await vectorStore.upsert([
      {
        id: "vec_1",
        projectId: "proj_001",
        memoryEntryId: "mem_1",
        chunkId: "chunk_1",
        chunkTitle: "Architecture",
        chunkText: "System architecture summary",
        category: "architecture_note",
        priority: 80,
        pinned: true,
        createdAt: "2026-04-14T10:00:00.000Z",
        updatedAt: "2026-04-14T10:00:00.000Z",
        metadata: {},
        embedding: [1, 0, 0]
      },
      {
        id: "vec_2",
        projectId: "proj_001",
        memoryEntryId: "mem_1",
        chunkId: "chunk_2",
        chunkTitle: "Architecture duplicate",
        chunkText: "Duplicate entry chunk",
        category: "architecture_note",
        priority: 70,
        pinned: false,
        createdAt: "2026-04-14T10:00:00.000Z",
        updatedAt: "2026-04-14T10:00:00.000Z",
        metadata: {},
        embedding: [0.9, 0, 0]
      },
      {
        id: "vec_3",
        projectId: "proj_001",
        memoryEntryId: "mem_2",
        chunkId: "chunk_3",
        chunkTitle: "Coding standards",
        chunkText: "Prefer strict TypeScript",
        category: "coding_standard",
        priority: 65,
        pinned: false,
        createdAt: "2026-04-14T10:00:00.000Z",
        updatedAt: "2026-04-14T10:00:00.000Z",
        metadata: {},
        embedding: [0.8, 0, 0]
      }
    ]);

    const service = new SemanticRetrievalService({
      vectorStore,
      embeddingProvider: embeddingProviderStub,
      contextPacketBuilder: new DefaultContextPacketBuilder(),
      logger
    });

    const chunks = await service.retrieve({
      role: "planner",
      query: "architecture",
      topK: 2,
      filters: {
        projectId: "proj_001",
        categories: ["architecture_note", "coding_standard"]
      }
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.memoryEntryId).toBe("mem_1");
    expect(chunks[1]?.memoryEntryId).toBe("mem_2");

    const logs = await logger.list("proj_001");
    expect(logs).toHaveLength(1);
    expect(logs[0]?.returnedChunkIds.length).toBe(2);
  });

  it("builds role-specific context packets with traceability", async () => {
    const vectorStore = new InMemoryVectorStore();

    await vectorStore.upsert([
      {
        id: "vec_4",
        projectId: "proj_001",
        memoryEntryId: "mem_4",
        chunkId: "chunk_4",
        chunkTitle: "Error summary",
        chunkText: "Null pointer on verification stage",
        category: "error_report",
        priority: 90,
        pinned: true,
        createdAt: "2026-04-14T10:00:00.000Z",
        updatedAt: "2026-04-14T10:00:00.000Z",
        metadata: {},
        embedding: [1, 0, 0]
      }
    ]);

    const service = new SemanticRetrievalService({
      vectorStore,
      embeddingProvider: embeddingProviderStub,
      contextPacketBuilder: new DefaultContextPacketBuilder()
    });

    const packet = await service.buildContextPacket({
      role: "claude_debugger",
      query: "why verification failed",
      topK: 1,
      filters: { projectId: "proj_001" },
      skillInstructions: [
        {
          name: "checks",
          instructions: "Always run lint, test, build before merge.",
          repositoryUrl: "https://github.com/example/skills-checks"
        }
      ],
      agentContext: {
        agentId: "agent_001",
        agentName: "debugger-primary",
        role: "claude_debugger",
        runtimeConfig: {
          timeoutMs: 45000,
          commandPrefix: "devtools-agent"
        },
        skillInstructions: [
          {
            name: "checks",
            instructions: "Always run lint, test, build before merge.",
            repositoryUrl: "https://github.com/example/skills-checks"
          },
          {
            name: "logs",
            instructions: "Inspect logs before patching.",
            repositoryUrl: "https://github.com/example/skills-logs"
          }
        ]
      },
      secretReferences: [
        {
          name: "OPENAI_API_KEY",
          scope: "provider",
          description: "Primary provider key"
        }
      ],
      contextNotes: [
        {
          noteId: "ctx_001",
          path: "/projects/proj_001/context/operating-model.md",
          title: "Operating model",
          scope: "context-notes",
          excerpt: "Use Obsidian-style linked notes for strategy and decisions.",
          score: 0.98,
          sourceType: "context-note"
        }
      ],
      environmentContext: {
        environmentId: "env_001",
        name: "staging",
        status: "active",
        machines: [
          {
            machineId: "machine_001",
            name: "node-a",
            status: "online",
            cpuCores: 8,
            gpuCount: 1,
            ramGb: 32,
            agents: ["claude_debugger"],
            services: ["api", "worker"]
          }
        ]
      },
      versionSnapshots: [
        {
          snapshotId: "snapshot_001",
          localRepositoryId: "lrepo_001",
          label: "task-start",
          trigger: "task_start",
          taskId: "task_001"
        }
      ]
    });

    expect(packet.role).toBe("claude_debugger");
    expect(packet.chunks).toHaveLength(1);
    expect(packet.sourceChunkIds[0]).toBe("chunk_4");
    expect(packet.compactSummary.toLowerCase()).toContain("debugger context");
    expect(packet.skillInstructions).toHaveLength(2);
    expect(packet.skillInstructions[0]?.name).toBe("checks");
    expect(packet.compactSummary.toLowerCase()).toContain("skills:");
    expect(packet.agentContext?.agentId).toBe("agent_001");
    expect(packet.compactSummary.toLowerCase()).toContain("agent:");
    expect(packet.secretReferences).toHaveLength(1);
    expect(packet.contextNotes).toHaveLength(1);
    expect(packet.contextNotes[0]?.scope).toBe("context-notes");
    expect(packet.environmentContext?.environmentId).toBe("env_001");
    expect(packet.versionSnapshots).toHaveLength(1);
    expect(packet.compactSummary.toLowerCase()).toContain("secrets:");
    expect(packet.compactSummary.toLowerCase()).toContain("environment:");
    expect(packet.compactSummary.toLowerCase()).toContain("snapshots:");
    expect(packet.compactSummary.toLowerCase()).toContain("context notes:");
  });
});
