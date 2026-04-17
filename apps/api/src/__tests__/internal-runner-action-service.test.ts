import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  brainstorming: {
    applyBrainstormPlan: vi.fn(),
    approveBrainstormPlan: vi.fn(),
    startBrainstormSession: vi.fn()
  },
  coding: {
    approvePatch: vi.fn(),
    approvePlan: vi.fn(),
    createCodingWorkflow: vi.fn(),
    rejectPatch: vi.fn(),
    rejectPlan: vi.fn(),
    requestPatchRevision: vi.fn(),
    requestPlanRevision: vi.fn()
  },
  autoresearch: {
    evaluateAutoResearchExperiment: vi.fn(),
    runAutoResearchExperiment: vi.fn()
  },
  content: {
    runContentPipeline: vi.fn(),
    runMultimodalPipeline: vi.fn(),
    runResearchPipeline: vi.fn(),
    runVisualPipeline: vi.fn()
  },
  chat: {
    processAgentChatMessage: vi.fn()
  },
  agents: {
    runHeartbeat: vi.fn(),
    diagnoseAgent: vi.fn()
  },
  audit: {
    record: vi.fn()
  },
  skills: {
    getSkill: vi.fn(),
    executeSkill: vi.fn()
  },
  workspaces: {
    applyWorkspaceRuntimeAction: vi.fn(),
    ensureWorkspaceActionReadiness: vi.fn(),
    toWorkspaceRuntimeAction: vi.fn(),
    updateWorkspace: vi.fn()
  }
}));

vi.mock("../services/brainstorming-service.js", () => ({
  applyBrainstormPlan: mocks.brainstorming.applyBrainstormPlan,
  approveBrainstormPlan: mocks.brainstorming.approveBrainstormPlan,
  startBrainstormSession: mocks.brainstorming.startBrainstormSession
}));

vi.mock("../services/coding-workflow-service.js", () => ({
  approvePatch: mocks.coding.approvePatch,
  approvePlan: mocks.coding.approvePlan,
  createCodingWorkflow: mocks.coding.createCodingWorkflow,
  rejectPatch: mocks.coding.rejectPatch,
  rejectPlan: mocks.coding.rejectPlan,
  requestPatchRevision: mocks.coding.requestPatchRevision,
  requestPlanRevision: mocks.coding.requestPlanRevision
}));

vi.mock("../services/autoresearch-service.js", () => ({
  evaluateAutoResearchExperiment: mocks.autoresearch.evaluateAutoResearchExperiment,
  runAutoResearchExperiment: mocks.autoresearch.runAutoResearchExperiment
}));

vi.mock("../services/content-pipeline-service.js", () => ({
  runContentPipeline: mocks.content.runContentPipeline,
  runMultimodalPipeline: mocks.content.runMultimodalPipeline,
  runResearchPipeline: mocks.content.runResearchPipeline,
  runVisualPipeline: mocks.content.runVisualPipeline
}));

vi.mock("../services/chat-service.js", () => ({
  processAgentChatMessage: mocks.chat.processAgentChatMessage
}));

vi.mock("../services/agents-service.js", () => ({
  agentsService: {
    runHeartbeat: mocks.agents.runHeartbeat,
    diagnoseAgent: mocks.agents.diagnoseAgent
  }
}));

vi.mock("../services/audit-log-service.js", () => ({
  auditLogService: {
    record: mocks.audit.record
  }
}));

vi.mock("../services/skills-service.js", () => ({
  skillsService: {
    getSkill: mocks.skills.getSkill,
    executeSkill: mocks.skills.executeSkill
  }
}));

vi.mock("../services/workspaces-service.js", () => ({
  applyWorkspaceRuntimeAction: mocks.workspaces.applyWorkspaceRuntimeAction,
  ensureWorkspaceActionReadiness: mocks.workspaces.ensureWorkspaceActionReadiness,
  toWorkspaceRuntimeAction: mocks.workspaces.toWorkspaceRuntimeAction,
  updateWorkspace: mocks.workspaces.updateWorkspace
}));

const { executeInternalRunnerAction } = await import("../services/internal-runner-action-service.js");

describe("internal runner action service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaces.ensureWorkspaceActionReadiness.mockResolvedValue({
      id: "workspace_001",
      tenantId: "tenant_default"
    });
    mocks.workspaces.toWorkspaceRuntimeAction.mockReturnValue("deploy");
  });

  it("propagates skill audit persistence failures", async () => {
    mocks.skills.getSkill.mockResolvedValue({
      id: "skill_001",
      categories: [],
      currentVersion: "1.0.0",
      version: "1.0.0",
      scope: "tenant"
    });
    mocks.skills.executeSkill.mockResolvedValue({
      success: true,
      skillId: "skill_001",
      logs: ["ok"]
    });
    mocks.audit.record.mockRejectedValue(new Error("audit store down"));

    await expect(
      executeInternalRunnerAction({
        action: "skill.execute",
        payload: {
          skillId: "skill_001"
        }
      })
    ).rejects.toThrow("audit store down");

    expect(mocks.skills.executeSkill).toHaveBeenCalledOnce();
    expect(mocks.audit.record).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid workspace deploy pipelines instead of falling back to content", async () => {
    await expect(
      executeInternalRunnerAction({
        action: "workspace.deploy",
        payload: {
          tenantId: "tenant_default",
          workspaceId: "workspace_001",
          projectId: "project_001",
          metadata: {
            deploy: {
              pipeline: "bogus"
            }
          }
        }
      })
    ).rejects.toThrow("Unsupported workspace.deploy pipeline: bogus");

    expect(mocks.content.runContentPipeline).not.toHaveBeenCalled();
    expect(mocks.content.runResearchPipeline).not.toHaveBeenCalled();
    expect(mocks.content.runVisualPipeline).not.toHaveBeenCalled();
    expect(mocks.content.runMultimodalPipeline).not.toHaveBeenCalled();
    expect(mocks.workspaces.updateWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_default",
        workspaceId: "workspace_001",
        runtimeStatus: "error"
      })
    );
  });
});
