import { getJob, updateJobStatus } from "./jobs-service.js";

export interface ProcessAgentChatMessageInput {
  message: string;
  jobId?: string;
  context?: Record<string, unknown>;
}

export interface ProcessAgentChatMessageResult {
  response: string;
  job?: Awaited<ReturnType<typeof updateJobStatus>>;
  context: {
    jobId?: string;
    planId?: string;
  };
}

export const processAgentChatMessage = async (
  input: ProcessAgentChatMessageInput
): Promise<ProcessAgentChatMessageResult> => {
  const normalized = input.message.toLowerCase();
  const context = input.context ?? {};
  const jobId = input.jobId;
  let updatedJob: Awaited<ReturnType<typeof updateJobStatus>> | undefined;

  if (jobId) {
    const existing = await getJob(jobId);
    if (!existing) {
      throw new Error("Job not found");
    }

    if (/(need|missing|input|details?)/.test(normalized)) {
      updatedJob = await updateJobStatus(jobId, "waiting_user", {
        actionRequired: true,
        actionType: "input"
      });
    } else if (/(approve|approval)/.test(normalized)) {
      updatedJob = await updateJobStatus(jobId, "waiting_user", {
        actionRequired: true,
        actionType: "approve"
      });
    } else if (/(review|check|validate)/.test(normalized)) {
      updatedJob = await updateJobStatus(jobId, "waiting_user", {
        actionRequired: true,
        actionType: "review"
      });
    } else if (/(done|complete|completed|resolved|fixed)/.test(normalized)) {
      updatedJob = await updateJobStatus(jobId, "done", {
        actionRequired: false
      });
    }
  }

  const planId = typeof context.planId === "string" ? context.planId : undefined;
  const knowledgeSummary =
    typeof context.knowledgeSummary === "string" && context.knowledgeSummary.trim().length > 0
      ? context.knowledgeSummary.trim()
      : undefined;
  const contextNoteCount =
    typeof context.contextNoteCount === "number" && Number.isFinite(context.contextNoteCount)
      ? Math.max(0, context.contextNoteCount)
      : undefined;
  const contextHint =
    knowledgeSummary || typeof contextNoteCount === "number"
      ? `Injected context${typeof contextNoteCount === "number" ? `: ${contextNoteCount} notes` : ""}${
          knowledgeSummary ? " + knowledge summary" : ""
        }.`
      : undefined;
  const responseText = updatedJob
    ? `Context received for job ${updatedJob.id}. Status is now ${updatedJob.status}.${contextHint ? ` ${contextHint}` : ""}`
    : `Message received${jobId ? ` for job ${jobId}` : ""}${planId ? ` (plan ${planId})` : ""}. No job transition was required.${contextHint ? ` ${contextHint}` : ""}`;

  return {
    response: responseText,
    ...(updatedJob ? { job: updatedJob } : {}),
    context: {
      ...(jobId ? { jobId } : {}),
      ...(planId ? { planId } : {})
    }
  };
};
