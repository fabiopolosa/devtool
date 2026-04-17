import {
  applyBrainstormPlan,
  approveBrainstormPlan,
  startBrainstormSession
} from "./brainstorming-service.js";
import {
  approvePatch,
  approvePlan,
  createCodingWorkflow,
  rejectPatch,
  rejectPlan,
  requestPatchRevision,
  requestPlanRevision
} from "./coding-workflow-service.js";
import {
  evaluateAutoResearchExperiment,
  runAutoResearchExperiment
} from "./autoresearch-service.js";
import {
  runContentPipeline,
  runMultimodalPipeline,
  runResearchPipeline,
  runVisualPipeline
} from "./content-pipeline-service.js";
import { processAgentChatMessage } from "./chat-service.js";
import { agentsService } from "./agents-service.js";
import { auditLogService } from "./audit-log-service.js";
import { skillsService } from "./skills-service.js";
import {
  applyWorkspaceRuntimeAction,
  toWorkspaceRuntimeAction,
  updateWorkspace
} from "./workspaces-service.js";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const asPositiveNumber = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
};

const missingPayloadError = (field: string): Error => new Error(`Missing required payload field: ${field}`);

const summarizeSkillExecution = (result: unknown): Record<string, unknown> => {
  const record = asRecord(result);
  if (!record) {
    return {
      success: false,
      message: "skill result is not an object"
    };
  }
  const output = asRecord(record.output);
  return {
    success: record.success === true,
    logCount: Array.isArray(record.logs) ? record.logs.length : 0,
    ...(typeof record.error === "string" ? { error: record.error } : {}),
    ...(typeof record.exitCode === "number" ? { exitCode: record.exitCode } : {}),
    ...(output && typeof output.kind === "string" ? { outputKind: output.kind } : {})
  };
};

const summarizeAuditValue = (value: unknown): unknown => {
  if (value === null) return null;
  if (typeof value === "string") {
    return value.length > 160 ? `${value.slice(0, 157)}...` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return {
      kind: "array",
      length: value.length
    };
  }
  if (typeof value === "object") {
    const record = asRecord(value);
    if (!record) return typeof value;
    return {
      kind: "object",
      keys: Object.keys(record).slice(0, 12)
    };
  }
  return typeof value;
};

const summarizeSkillInput = (input: Record<string, unknown> | null): Record<string, unknown> => {
  if (!input) return {};
  const entries = Object.entries(input).slice(0, 20);
  const summary: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    summary[key] = summarizeAuditValue(value);
  }
  return summary;
};

const recordSkillAudit = async (input: Parameters<typeof auditLogService.record>[0]): Promise<void> => {
  try {
    await auditLogService.record(input);
  } catch {
    // Never block job completion on audit persistence errors.
  }
};

type WorkspaceDeployPipeline = "research" | "content" | "visual" | "multimodal";

const toWorkspaceDeployPipeline = (value: unknown): WorkspaceDeployPipeline => {
  const normalized = asString(value)?.toLowerCase();
  if (normalized === "research" || normalized === "visual" || normalized === "multimodal") {
    return normalized;
  }
  return "content";
};

const summarizeWorkspaceDeployResult = (
  pipeline: WorkspaceDeployPipeline,
  result: unknown
): string => {
  const record = asRecord(result) ?? {};
  if (pipeline === "research") {
    const sources = Array.isArray(record.sources) ? record.sources.length : 0;
    const confidence =
      typeof record.confidence === "number" ? Number(record.confidence.toFixed(3)) : undefined;
    const query = typeof record.query === "string" ? record.query : "n/a";
    return `Research pipeline completed (query: ${query}, sources: ${sources}${
      confidence !== undefined ? `, confidence: ${confidence}` : ""
    }).`;
  }
  if (pipeline === "visual") {
    const scenes = Array.isArray(record.scenes) ? record.scenes.length : 0;
    const concept = typeof record.concept === "string" ? record.concept : "n/a";
    return `Visual pipeline completed (concept: ${concept}, scenes: ${scenes}).`;
  }
  if (pipeline === "multimodal") {
    const visual = asRecord(record.visual);
    const assets = asRecord(record.assets);
    const scenes = Array.isArray(visual?.scenes) ? visual.scenes.length : 0;
    const images = Array.isArray(assets?.images) ? assets.images.length : 0;
    const topic = typeof record.topic === "string" ? record.topic : "n/a";
    return `Multimodal pipeline completed (topic: ${topic}, scenes: ${scenes}, images: ${images}).`;
  }
  const sections = Array.isArray(record.outline) ? record.outline.length : 0;
  const topic = typeof record.topic === "string" ? record.topic : "n/a";
  return `Content pipeline completed (topic: ${topic}, outline sections: ${sections}).`;
};

export interface InternalRunnerExecutionInput {
  action: string;
  payload?: Record<string, unknown>;
}

export const executeInternalRunnerAction = async (
  input: InternalRunnerExecutionInput
): Promise<unknown> => {
  const action = input.action.trim();
  const payload = asRecord(input.payload) ?? {};

  if (action === "brainstorm.start_session") {
    const projectIntent = asString(payload.projectIntent);
    const tenantId = asString(payload.tenantId);
    const threadId = asString(payload.threadId);
    const projectId = asString(payload.projectId);
    const actor = asString(payload.actor);
    if (!projectIntent) throw missingPayloadError("projectIntent");
    return startBrainstormSession({
      ...(tenantId ? { tenantId } : {}),
      projectIntent,
      ...(threadId ? { threadId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(Array.isArray(payload.selectedSubpromptIds)
        ? {
            selectedSubpromptIds: payload.selectedSubpromptIds.filter(
              (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
            )
          }
        : {}),
      ...(asRecord(payload.guidedAnswers)
        ? {
            guidedAnswers: Object.fromEntries(
              Object.entries(payload.guidedAnswers as Record<string, unknown>).filter(
                ([, value]) => typeof value === "string"
              )
            ) as Record<string, string>
          }
        : {}),
      ...(actor ? { actor } : {}),
      ...(typeof payload.generatePlan === "boolean" ? { generatePlan: payload.generatePlan } : {}),
      jobManaged: true
    });
  }

  if (action === "brainstorm.apply_plan") {
    const planId = asString(payload.planId);
    const tenantId = asString(payload.tenantId);
    const actor = asString(payload.actor);
    const projectName = asString(payload.projectName);
    const projectKey = asString(payload.projectKey);
    const description = asString(payload.description);
    if (!planId) throw missingPayloadError("planId");
    return applyBrainstormPlan({
      ...(tenantId ? { tenantId } : {}),
      planId,
      ...(actor ? { actor } : {}),
      ...(projectName ? { projectName } : {}),
      ...(projectKey ? { projectKey } : {}),
      ...(description ? { description } : {}),
      ...(Array.isArray(payload.repositoryIds)
        ? {
            repositoryIds: payload.repositoryIds.filter(
              (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
            )
          }
        : {}),
      ...(Array.isArray(payload.repositoryUrls)
        ? {
            repositoryUrls: payload.repositoryUrls.filter(
              (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
            )
          }
        : {}),
      jobManaged: true
    });
  }

  if (action === "brainstorm.approve_plan") {
    const planId = asString(payload.planId);
    if (!planId) throw missingPayloadError("planId");
    const actor = asString(payload.actor) ?? "brainstorming_approval";
    return approveBrainstormPlan(planId, actor);
  }

  if (action === "coding.workflow.create") {
    const projectId = asString(payload.projectId);
    const tenantId = asString(payload.tenantId);
    const actor = asString(payload.actor);
    const requestText = asString(payload.request);
    if (!projectId) throw missingPayloadError("projectId");
    if (!tenantId) throw missingPayloadError("tenantId");
    if (!actor) throw missingPayloadError("actor");
    if (!requestText) throw missingPayloadError("request");
    return createCodingWorkflow({
      tenantId,
      projectId,
      title: asString(payload.title) ?? requestText.slice(0, 64),
      request: requestText,
      actor
    });
  }

  if (action === "coding.plan.approve") {
    const workflowId = asString(payload.workflowId);
    const projectId = asString(payload.projectId);
    const tenantId = asString(payload.tenantId);
    const actor = asString(payload.actor);
    if (!workflowId) throw missingPayloadError("workflowId");
    if (!projectId) throw missingPayloadError("projectId");
    if (!tenantId) throw missingPayloadError("tenantId");
    if (!actor) throw missingPayloadError("actor");
    return approvePlan(workflowId, projectId, tenantId, actor);
  }

  if (action === "coding.plan.reject") {
    const workflowId = asString(payload.workflowId);
    const projectId = asString(payload.projectId);
    const tenantId = asString(payload.tenantId);
    const actor = asString(payload.actor);
    if (!workflowId) throw missingPayloadError("workflowId");
    if (!projectId) throw missingPayloadError("projectId");
    if (!tenantId) throw missingPayloadError("tenantId");
    if (!actor) throw missingPayloadError("actor");
    return rejectPlan(workflowId, projectId, tenantId, actor, asString(payload.note) ?? "Plan rejected");
  }

  if (action === "coding.plan.request_revision") {
    const workflowId = asString(payload.workflowId);
    const projectId = asString(payload.projectId);
    const tenantId = asString(payload.tenantId);
    const actor = asString(payload.actor);
    if (!workflowId) throw missingPayloadError("workflowId");
    if (!projectId) throw missingPayloadError("projectId");
    if (!tenantId) throw missingPayloadError("tenantId");
    if (!actor) throw missingPayloadError("actor");
    return requestPlanRevision(
      workflowId,
      projectId,
      tenantId,
      actor,
      asString(payload.note) ?? "Revision requested"
    );
  }

  if (action === "coding.patch.approve") {
    const workflowId = asString(payload.workflowId);
    const projectId = asString(payload.projectId);
    const tenantId = asString(payload.tenantId);
    const actor = asString(payload.actor);
    if (!workflowId) throw missingPayloadError("workflowId");
    if (!projectId) throw missingPayloadError("projectId");
    if (!tenantId) throw missingPayloadError("tenantId");
    if (!actor) throw missingPayloadError("actor");
    return approvePatch(workflowId, projectId, tenantId, actor);
  }

  if (action === "coding.patch.reject") {
    const workflowId = asString(payload.workflowId);
    const projectId = asString(payload.projectId);
    const tenantId = asString(payload.tenantId);
    const actor = asString(payload.actor);
    if (!workflowId) throw missingPayloadError("workflowId");
    if (!projectId) throw missingPayloadError("projectId");
    if (!tenantId) throw missingPayloadError("tenantId");
    if (!actor) throw missingPayloadError("actor");
    return rejectPatch(workflowId, projectId, tenantId, actor, asString(payload.note) ?? "Patch rejected");
  }

  if (action === "coding.patch.request_revision") {
    const workflowId = asString(payload.workflowId);
    const projectId = asString(payload.projectId);
    const tenantId = asString(payload.tenantId);
    const actor = asString(payload.actor);
    if (!workflowId) throw missingPayloadError("workflowId");
    if (!projectId) throw missingPayloadError("projectId");
    if (!tenantId) throw missingPayloadError("tenantId");
    if (!actor) throw missingPayloadError("actor");
    return requestPatchRevision(
      workflowId,
      projectId,
      tenantId,
      actor,
      asString(payload.note) ?? "Patch revision requested"
    );
  }

  if (action === "autoresearch.run_experiment") {
    const experimentId = asString(payload.experimentId);
    const tenantId = asString(payload.tenantId);
    const actor = asString(payload.actor) ?? "autoresearch_service";
    const query = asString(payload.query);
    if (!experimentId) throw missingPayloadError("experimentId");
    if (!tenantId) throw missingPayloadError("tenantId");
    return runAutoResearchExperiment({
      experimentId,
      tenantId,
      actor,
      ...(query ? { query } : {}),
      ...(Array.isArray(payload.variantIds)
        ? {
            variantIds: payload.variantIds.filter(
              (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
            )
          }
        : {})
    });
  }

  if (action === "autoresearch.evaluate_experiment") {
    const experimentId = asString(payload.experimentId);
    const actor = asString(payload.actor) ?? "autoresearch_service";
    if (!experimentId) throw missingPayloadError("experimentId");
    return evaluateAutoResearchExperiment({
      experimentId,
      actor
    });
  }

  if (action === "pipeline.research.run") {
    const tenantId = asString(payload.tenantId);
    const query = asString(payload.query);
    const projectId = asString(payload.projectId);
    if (!tenantId) throw missingPayloadError("tenantId");
    if (!query) throw missingPayloadError("query");
    return runResearchPipeline({
      tenantId,
      ...(projectId ? { projectId } : {}),
      query
    });
  }

  if (action === "pipeline.content.run") {
    const tenantId = asString(payload.tenantId);
    const topic = asString(payload.topic);
    const projectId = asString(payload.projectId);
    const objective = asString(payload.objective);
    const audience = asString(payload.audience);
    const tone = asString(payload.tone);
    const researchQuery = asString(payload.researchQuery);
    const targetLengthWords =
      typeof payload.targetLengthWords === "number" ? payload.targetLengthWords : undefined;
    if (!tenantId) throw missingPayloadError("tenantId");
    if (!topic) throw missingPayloadError("topic");
    return runContentPipeline({
      tenantId,
      ...(projectId ? { projectId } : {}),
      topic,
      ...(objective ? { objective } : {}),
      ...(audience ? { audience } : {}),
      ...(tone ? { tone } : {}),
      ...(typeof targetLengthWords === "number" ? { targetLengthWords } : {}),
      ...(researchQuery ? { researchQuery } : {})
    });
  }

  if (action === "pipeline.visual.run") {
    const tenantId = asString(payload.tenantId);
    const concept = asString(payload.concept);
    const projectId = asString(payload.projectId);
    const style = asString(payload.style);
    const contentSummary = asString(payload.contentSummary);
    if (!tenantId) throw missingPayloadError("tenantId");
    if (!concept) throw missingPayloadError("concept");
    return runVisualPipeline({
      tenantId,
      ...(projectId ? { projectId } : {}),
      concept,
      ...(style ? { style } : {}),
      contentSummary: contentSummary ?? `Visual plan for ${concept}`
    });
  }

  if (action === "pipeline.multimodal.run") {
    const tenantId = asString(payload.tenantId);
    const topic = asString(payload.topic);
    const projectId = asString(payload.projectId);
    const objective = asString(payload.objective);
    const audience = asString(payload.audience);
    const tone = asString(payload.tone);
    const style = asString(payload.style);
    const targetLengthWords =
      typeof payload.targetLengthWords === "number" ? payload.targetLengthWords : undefined;
    const generateImages =
      typeof payload.generateImages === "boolean" ? payload.generateImages : undefined;
    if (!tenantId) throw missingPayloadError("tenantId");
    if (!topic) throw missingPayloadError("topic");
    return runMultimodalPipeline({
      tenantId,
      ...(projectId ? { projectId } : {}),
      topic,
      ...(objective ? { objective } : {}),
      ...(audience ? { audience } : {}),
      ...(tone ? { tone } : {}),
      ...(style ? { style } : {}),
      ...(typeof targetLengthWords === "number" ? { targetLengthWords } : {}),
      ...(typeof generateImages === "boolean" ? { generateImages } : {})
    });
  }

  if (
    action === "workspace.start" ||
    action === "workspace.stop" ||
    action === "workspace.deploy" ||
    action === "workspace.restart"
  ) {
    const workspaceId = asString(payload.workspaceId);
    const tenantId = asString(payload.tenantId);
    const projectId = asString(payload.projectId);
    const actor = asString(payload.actor) ?? "workspace_runtime";
    const runtimeAction = toWorkspaceRuntimeAction(action.replace("workspace.", ""));
    const metadata = asRecord(payload.metadata);
    if (!workspaceId) throw missingPayloadError("workspaceId");
    if (!tenantId) throw missingPayloadError("tenantId");
    if (!runtimeAction) {
      throw new Error(`Unsupported workspace action: ${action}`);
    }

    if (runtimeAction === "deploy") {
      if (!projectId) throw missingPayloadError("projectId");
      const deployConfig = asRecord(metadata?.deploy) ?? metadata ?? {};
      const pipeline = toWorkspaceDeployPipeline(deployConfig.pipeline);
      const executedAt = new Date().toISOString();
      const deployQuery = asString(deployConfig.query) ?? `Deployment strategy for ${projectId}`;
      const deployConcept = asString(deployConfig.concept) ?? `Deployment visual for ${projectId}`;
      const deployVisualStyle = asString(deployConfig.style);
      const deployContentSummary =
        asString(deployConfig.contentSummary) ?? `Visual deployment package for ${projectId}`;
      const deployTopic = asString(deployConfig.topic) ?? `Deployment plan for ${projectId}`;
      const deployObjective = asString(deployConfig.objective);
      const deployAudience = asString(deployConfig.audience);
      const deployTone = asString(deployConfig.tone);
      const deployResearchQuery = asString(deployConfig.researchQuery);
      const deployTargetLengthWords =
        typeof deployConfig.targetLengthWords === "number"
          ? deployConfig.targetLengthWords
          : undefined;
      const deployGenerateImages =
        typeof deployConfig.generateImages === "boolean" ? deployConfig.generateImages : undefined;

      try {
        const pipelineResult =
          pipeline === "research"
            ? await runResearchPipeline({
                tenantId,
                projectId,
                query: deployQuery
              })
            : pipeline === "visual"
              ? await runVisualPipeline({
                  tenantId,
                  projectId,
                  concept: deployConcept,
                  ...(deployVisualStyle ? { style: deployVisualStyle } : {}),
                  contentSummary: deployContentSummary
                })
              : pipeline === "multimodal"
                ? await runMultimodalPipeline({
                    tenantId,
                    projectId,
                    topic: deployTopic,
                    ...(deployObjective ? { objective: deployObjective } : {}),
                    ...(deployAudience ? { audience: deployAudience } : {}),
                    ...(deployTone ? { tone: deployTone } : {}),
                    ...(deployVisualStyle ? { style: deployVisualStyle } : {}),
                    ...(deployTargetLengthWords !== undefined
                      ? { targetLengthWords: deployTargetLengthWords }
                      : {}),
                    ...(deployGenerateImages !== undefined ? { generateImages: deployGenerateImages } : {})
                  })
                : await runContentPipeline({
                    tenantId,
                    projectId,
                    topic: deployTopic,
                    ...(deployObjective ? { objective: deployObjective } : {}),
                    ...(deployAudience ? { audience: deployAudience } : {}),
                    ...(deployTone ? { tone: deployTone } : {}),
                    ...(deployTargetLengthWords !== undefined
                      ? { targetLengthWords: deployTargetLengthWords }
                      : {}),
                    ...(deployResearchQuery ? { researchQuery: deployResearchQuery } : {})
                  });

        const deploymentSummary = summarizeWorkspaceDeployResult(pipeline, pipelineResult);
        const usage = asRecord(asRecord(pipelineResult)?.usage);
        const workspaceRuntimeResult = await applyWorkspaceRuntimeAction({
          tenantId,
          workspaceId,
          actor,
          action: runtimeAction,
          metadata: {
            ...(metadata ?? {}),
            deployExecution: {
              pipeline,
              executedAt,
              summary: deploymentSummary
            }
          }
        });
        return {
          ...workspaceRuntimeResult,
          deployment: {
            pipeline,
            executedAt,
            summary: deploymentSummary
          },
          ...(usage ? { usage } : {})
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Workspace deploy pipeline execution failed";
        await updateWorkspace({
          tenantId,
          workspaceId,
          actor,
          runtimeStatus: "error",
          runtimeDetails: {
            lastAction: "deploy",
            lastActionAt: new Date().toISOString(),
            deployError: message
          }
        });
        throw error;
      }
    }

    return applyWorkspaceRuntimeAction({
      tenantId,
      workspaceId,
      actor,
      action: runtimeAction,
      ...(metadata ? { metadata } : {})
    });
  }


  if (action === "skill.execute") {
    const skillId = asString(payload.skillId);
    if (!skillId) throw missingPayloadError("skillId");
    const skill = await skillsService.getSkill(skillId);
    const actor = asString(payload.actor) ?? "skills_service";
    const command = asString(payload.command);
    const args = Array.isArray(payload.args)
      ? payload.args.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [];
    const inputRecord = asRecord(payload.input);
    const confirm = typeof payload.confirm === "boolean" ? payload.confirm : undefined;
    const tenantId = asString(payload.tenantId);
    const projectId = asString(payload.projectId);
    const jobId = asString(payload.jobId);
    const auditBase = {
      ...(tenantId ? { tenantId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(jobId ? { jobId } : {}),
      userId: actor,
      action: "skill.execute",
      resourceType: "skill",
      resourceId: skillId,
      actor
    } as const;
    const startedAt = Date.now();
    const scope =
      skill?.scope ??
      (skill?.categories.some((entry) => entry === "scope:system")
        ? "system"
        : skill?.categories.some((entry) => entry === "scope:user")
          ? "user"
          : "tenant");
    const version = skill?.currentVersion ?? skill?.version ?? "unknown";
    const sanitizedInput = summarizeSkillInput(inputRecord);

    try {
      const result = await skillsService.executeSkill({
        skillId,
        actor,
        ...(command ? { command } : {}),
        ...(args.length > 0 ? { args } : {}),
        ...(inputRecord ? { input: inputRecord } : {}),
        ...(typeof confirm === "boolean" ? { confirm } : {})
      });
      await recordSkillAudit({
        ...auditBase,
        status: result.success ? "success" : "failure",
        metadata: {
          skillVersion: version,
          scope,
          durationMs: Date.now() - startedAt,
          command: command ?? "declarative",
          argsCount: args.length,
          input: sanitizedInput,
          output: summarizeSkillExecution(result)
        }
      });
      return result;
    } catch (error) {
      await recordSkillAudit({
        ...auditBase,
        status: "failure",
        metadata: {
          skillVersion: version,
          scope,
          durationMs: Date.now() - startedAt,
          command: command ?? "declarative",
          argsCount: args.length,
          input: sanitizedInput,
          error: error instanceof Error ? error.message : "Unknown skill execution failure"
        }
      });
      throw error;
    }
  }

  if (action === "chat.process_message") {
    const message = asString(payload.message);
    const jobId = asString(payload.jobId);
    if (!message) throw missingPayloadError("message");
    return processAgentChatMessage({
      message,
      ...(jobId ? { jobId } : {}),
      ...(asRecord(payload.context) ? { context: payload.context as Record<string, unknown> } : {})
    });
  }

  if (action === "agent.runtime.heartbeat") {
    const agentId = asString(payload.agentId);
    if (!agentId) throw missingPayloadError("agentId");
    const options: { reason?: string; timeoutMs?: number; metadata?: Record<string, unknown> } = {};
    const reason = asString(payload.reason);
    if (reason) options.reason = reason;
    const timeoutMs = asPositiveNumber(payload.timeoutMs);
    if (timeoutMs) options.timeoutMs = timeoutMs;
    const metadata = asRecord(payload.metadata);
    if (metadata) options.metadata = metadata;
    return agentsService.runHeartbeat(agentId, Object.keys(options).length > 0 ? options : undefined);
  }

  if (action === "agent.runtime.diagnose") {
    const agentId = asString(payload.agentId);
    if (!agentId) throw missingPayloadError("agentId");
    const options: { reason?: string; timeoutMs?: number; metadata?: Record<string, unknown> } = {};
    const reason = asString(payload.reason);
    if (reason) options.reason = reason;
    const timeoutMs = asPositiveNumber(payload.timeoutMs);
    if (timeoutMs) options.timeoutMs = timeoutMs;
    const metadata = asRecord(payload.metadata);
    if (metadata) options.metadata = metadata;
    return agentsService.diagnoseAgent(agentId, Object.keys(options).length > 0 ? options : undefined);
  }

  throw new Error(`Unsupported action: ${action}`);
};
