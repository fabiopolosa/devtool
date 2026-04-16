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
import { processAgentChatMessage } from "./chat-service.js";
import { agentsService } from "./agents-service.js";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const asPositiveNumber = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
};

const missingPayloadError = (field: string): Error => new Error(`Missing required payload field: ${field}`);

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
