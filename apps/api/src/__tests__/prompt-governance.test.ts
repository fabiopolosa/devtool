import { beforeEach, describe, expect, it, vi } from "vitest";
import { promptRegistryService } from "../services/prompt-registry-service.js";
import { formatPromptRegistryInstructions } from "../services/brainstorming-service.js";

vi.mock("../services/prompt-registry-service.js", () => ({
  promptRegistryService: {
    resolveActivePrompt: vi.fn()
  }
}));

const mockedResolveActivePrompt = vi.mocked(promptRegistryService.resolveActivePrompt);

describe("prompt governance", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("formats registry metadata into prompt instructions", () => {
    const formatted = formatPromptRegistryInstructions({
      id: "prompt_workflow_content_pipeline_v1",
      type: "workflow",
      scope: "system",
      target: "content_pipeline",
      version: "v1",
      content: "Generate long-form content through outline, draft, and refine."
    });

    expect(formatted).toContain("PROMPT METADATA: source=registry scope=system version=v1 type=workflow target=content_pipeline promptId=prompt_workflow_content_pipeline_v1");
    expect(formatted).toContain("Generate long-form content through outline, draft, and refine.");
  });

  it("resolves strict content prompts without hidden fallback", async () => {
    mockedResolveActivePrompt.mockResolvedValueOnce({
      id: "prompt_workflow_content_pipeline_v1",
      type: "workflow",
      scope: "system",
      target: "content_pipeline",
      version: "v1",
      content: "Generate long-form content through outline, draft, and refine.",
      status: "active",
      createdAt: "2025-01-01T00:00:00.000Z",
      createdBy: "system",
      updatedAt: "2025-01-01T00:00:00.000Z",
      updatedBy: "system"
    });

    const { resolveStrictPrompt } = await import("../services/content-pipeline-service.js");
    const resolved = await resolveStrictPrompt({
      tenantId: "tenant_default",
      type: "workflow",
      target: "content_pipeline"
    });

    expect(mockedResolveActivePrompt).toHaveBeenCalledWith({
      tenantId: "tenant_default",
      type: "workflow",
      target: "content_pipeline"
    });
    expect(resolved.metadata).toEqual({
      source: "registry",
      scope: "system",
      type: "workflow",
      target: "content_pipeline",
      version: "v1",
      promptId: "prompt_workflow_content_pipeline_v1"
    });
    expect(resolved.prompt).toContain("PROMPT METADATA: source=registry scope=system version=v1 type=workflow target=content_pipeline promptId=prompt_workflow_content_pipeline_v1");
  });

  it("fails closed when the autoresearch prompt is missing", async () => {
    mockedResolveActivePrompt.mockResolvedValueOnce(null);

    const { resolveAutoResearchPrompt } = await import("../services/autoresearch-service.js");

    await expect(resolveAutoResearchPrompt("tenant_default")).rejects.toThrow(
      "Missing active prompt registry entry for workflow/autoresearch"
    );
  });

  it("fails closed when a workflow step prompt is missing", async () => {
    mockedResolveActivePrompt.mockResolvedValueOnce(null);

    const { resolveStrictPrompt } = await import("../services/content-pipeline-service.js");

    await expect(
      resolveStrictPrompt({
        tenantId: "tenant_default",
        type: "workflow_step",
        target: "research_query_planning"
      })
    ).rejects.toThrow("Missing active prompt registry entry for workflow_step/research_query_planning");
  });
});
