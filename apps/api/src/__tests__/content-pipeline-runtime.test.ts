import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: {
    listContextNotes: vi.fn()
  },
  promptRegistry: {
    resolveActivePrompt: vi.fn()
  },
  providers: {
    createDefaultProviderRegistry: vi.fn(() => ({
      get: vi.fn(() => undefined)
    }))
  },
  providerConfig: {
    resolveProviderModelSelection: vi.fn()
  }
}));

vi.mock("../services/context-service.js", () => ({
  listContextNotes: mocks.context.listContextNotes
}));

vi.mock("../services/prompt-registry-service.js", () => ({
  promptRegistryService: {
    resolveActivePrompt: mocks.promptRegistry.resolveActivePrompt
  }
}));

vi.mock("../services/provider-config-service.js", () => ({
  resolveProviderModelSelection: mocks.providerConfig.resolveProviderModelSelection
}));

vi.mock("@cp/providers", () => ({
  createDefaultProviderRegistry: mocks.providers.createDefaultProviderRegistry
}));

const { runAssetPipeline, runResearchPipeline } = await import("../services/content-pipeline-service.js");

describe("content pipeline runtime failures", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CONTENT_PIPELINES_DISABLE_LIVE", "");
    vi.stubEnv("CONTENT_PIPELINES_FALLBACK_ONLY", "");

    mocks.promptRegistry.resolveActivePrompt.mockResolvedValue({
      id: "prompt_workflow_research_pipeline_v1",
      type: "workflow",
      scope: "system",
      target: "research_pipeline",
      version: "v1",
      content: "Plan targeted queries, validate evidence, and synthesize findings.",
      status: "active",
      createdAt: "2025-01-01T00:00:00.000Z",
      createdBy: "system",
      updatedAt: "2025-01-01T00:00:00.000Z",
      updatedBy: "system"
    });
    mocks.context.listContextNotes.mockResolvedValue({ items: [] });
    mocks.providerConfig.resolveProviderModelSelection.mockResolvedValue({
      provider: "openai",
      providerOrder: ["openai", "anthropic"],
      source: "system"
    });
    mocks.providers.createDefaultProviderRegistry.mockReturnValue({
      get: vi.fn(() => undefined)
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed when no live reasoning provider is available", async () => {
    await expect(
      runResearchPipeline({
        tenantId: "tenant_default",
        query: "deterministic audit controls"
      })
    ).rejects.toThrow('No live chat_reasoning provider succeeded for "research_query_planning"');
  });

  it("fails closed when no live image provider is available", async () => {
    await expect(
      runAssetPipeline({
        tenantId: "tenant_default",
        scenes: [
          {
            id: "scene_1",
            title: "Opening frame",
            durationSec: 5,
            camera: "35mm lens",
            framing: "wide establishing",
            movement: "static",
            subject: "Main subject",
            mood: "clear",
            prompt: "Main subject, clear mood"
          }
        ]
      })
    ).rejects.toThrow("No live image_generation provider succeeded.");
  });
});
