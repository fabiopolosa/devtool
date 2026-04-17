import type { FastifyPluginAsync } from "fastify";
import { dispatchRunnerJob } from "../services/job-dispatch-service.js";
import { requireTenantPermission } from "../tenant/rbac.js";

type PipelineExecutionMode = "remote" | "local" | "hybrid";
type AsyncRouteStatus = "pending" | "running" | "waiting_user" | "done" | "error";

interface BasePipelineBody {
  actor?: string;
  mode?: PipelineExecutionMode;
}

interface ResearchPipelineBody extends BasePipelineBody {
  query: string;
}

interface ContentPipelineBody extends BasePipelineBody {
  topic: string;
  objective?: string;
  audience?: string;
  tone?: string;
  targetLengthWords?: number;
  researchQuery?: string;
}

interface VisualPipelineBody extends BasePipelineBody {
  concept: string;
  style?: string;
  contentSummary?: string;
}

interface MultimodalPipelineBody extends BasePipelineBody {
  topic: string;
  objective?: string;
  audience?: string;
  tone?: string;
  targetLengthWords?: number;
  style?: string;
  generateImages?: boolean;
}

const toActor = (
  request: { authPrincipal: { userId?: string } | undefined },
  actorFromBody?: string
): string => actorFromBody ?? request.authPrincipal?.userId ?? "content_pipeline_service";

const toExecutionMode = (value: unknown): PipelineExecutionMode | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "remote" || normalized === "local" || normalized === "hybrid") {
    return normalized;
  }
  return undefined;
};

const toAsyncRouteStatus = (status: string): AsyncRouteStatus =>
  status === "idle"
    ? "pending"
    : status === "running"
      ? "running"
      : status === "waiting_user"
        ? "waiting_user"
        : status === "done"
          ? "done"
          : "error";

const resolveErrorStatusCode = (error: unknown, fallback: number): number => {
  const status =
    typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as { statusCode?: number }).statusCode)
      : NaN;
  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    return status;
  }
  return fallback;
};

export const pipelinesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { projectId: string };
    Body: ResearchPipelineBody;
  }>(
    "/projects/:projectId/pipelines/research",
    {
      schema: { tags: ["pipelines"], summary: "Run project research pipeline via runner" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      const query = request.body?.query?.trim();
      if (!query) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "query is required"
        });
      }

      try {
        const actor = toActor(request, request.body.actor);
        const mode = toExecutionMode(request.body.mode);
        const job = await dispatchRunnerJob(
          {
            tenantId: request.tenantId ?? "tenant_default",
            projectId: request.params.projectId,
            type: "processing",
            title: `Research pipeline: ${query.slice(0, 72)}`,
            createdBy: actor,
            payload: {
              internalAction: "pipeline.research.run",
              tenantId: request.tenantId ?? "tenant_default",
              projectId: request.params.projectId,
              query,
              ...(mode ? { execution: { mode } } : {})
            },
            resourceType: "project",
            resourceId: request.params.projectId
          }
        );
        return {
          jobId: job.id,
          status: toAsyncRouteStatus(job.status)
        };
      } catch (error) {
        return reply.code(resolveErrorStatusCode(error, 400)).send({
          error: "research_pipeline_failed",
          message: error instanceof Error ? error.message : "Unable to run research pipeline"
        });
      }
    }
  );

  fastify.post<{
    Params: { projectId: string };
    Body: ContentPipelineBody;
  }>(
    "/projects/:projectId/pipelines/content",
    {
      schema: { tags: ["pipelines"], summary: "Run project long-form content pipeline via runner" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      const topic = request.body?.topic?.trim();
      if (!topic) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "topic is required"
        });
      }

      try {
        const actor = toActor(request, request.body.actor);
        const mode = toExecutionMode(request.body.mode);
        const job = await dispatchRunnerJob(
          {
            tenantId: request.tenantId ?? "tenant_default",
            projectId: request.params.projectId,
            type: "processing",
            title: `Content pipeline: ${topic.slice(0, 72)}`,
            createdBy: actor,
            payload: {
              internalAction: "pipeline.content.run",
              tenantId: request.tenantId ?? "tenant_default",
              projectId: request.params.projectId,
              topic,
              ...(request.body.objective ? { objective: request.body.objective } : {}),
              ...(request.body.audience ? { audience: request.body.audience } : {}),
              ...(request.body.tone ? { tone: request.body.tone } : {}),
              ...(typeof request.body.targetLengthWords === "number"
                ? { targetLengthWords: request.body.targetLengthWords }
                : {}),
              ...(request.body.researchQuery ? { researchQuery: request.body.researchQuery } : {}),
              ...(mode ? { execution: { mode } } : {})
            },
            resourceType: "project",
            resourceId: request.params.projectId
          }
        );
        return {
          jobId: job.id,
          status: toAsyncRouteStatus(job.status)
        };
      } catch (error) {
        return reply.code(resolveErrorStatusCode(error, 400)).send({
          error: "content_pipeline_failed",
          message: error instanceof Error ? error.message : "Unable to run content pipeline"
        });
      }
    }
  );

  fastify.post<{
    Params: { projectId: string };
    Body: VisualPipelineBody;
  }>(
    "/projects/:projectId/pipelines/visual",
    {
      schema: { tags: ["pipelines"], summary: "Run project visual planning pipeline via runner" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      const concept = request.body?.concept?.trim();
      if (!concept) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "concept is required"
        });
      }

      try {
        const actor = toActor(request, request.body.actor);
        const mode = toExecutionMode(request.body.mode);
        const job = await dispatchRunnerJob(
          {
            tenantId: request.tenantId ?? "tenant_default",
            projectId: request.params.projectId,
            type: "processing",
            title: `Visual pipeline: ${concept.slice(0, 72)}`,
            createdBy: actor,
            payload: {
              internalAction: "pipeline.visual.run",
              tenantId: request.tenantId ?? "tenant_default",
              projectId: request.params.projectId,
              concept,
              ...(request.body.style ? { style: request.body.style } : {}),
              ...(request.body.contentSummary ? { contentSummary: request.body.contentSummary } : {}),
              ...(mode ? { execution: { mode } } : {})
            },
            resourceType: "project",
            resourceId: request.params.projectId
          }
        );
        return {
          jobId: job.id,
          status: toAsyncRouteStatus(job.status)
        };
      } catch (error) {
        return reply.code(resolveErrorStatusCode(error, 400)).send({
          error: "visual_pipeline_failed",
          message: error instanceof Error ? error.message : "Unable to run visual pipeline"
        });
      }
    }
  );

  fastify.post<{
    Params: { projectId: string };
    Body: MultimodalPipelineBody;
  }>(
    "/projects/:projectId/pipelines/multimodal",
    {
      schema: { tags: ["pipelines"], summary: "Run full multimodal content pipeline via runner" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      const topic = request.body?.topic?.trim();
      if (!topic) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "topic is required"
        });
      }

      try {
        const actor = toActor(request, request.body.actor);
        const mode = toExecutionMode(request.body.mode);
        const job = await dispatchRunnerJob(
          {
            tenantId: request.tenantId ?? "tenant_default",
            projectId: request.params.projectId,
            type: "processing",
            title: `Multimodal pipeline: ${topic.slice(0, 72)}`,
            createdBy: actor,
            payload: {
              internalAction: "pipeline.multimodal.run",
              tenantId: request.tenantId ?? "tenant_default",
              projectId: request.params.projectId,
              topic,
              ...(request.body.objective ? { objective: request.body.objective } : {}),
              ...(request.body.audience ? { audience: request.body.audience } : {}),
              ...(request.body.tone ? { tone: request.body.tone } : {}),
              ...(request.body.style ? { style: request.body.style } : {}),
              ...(typeof request.body.targetLengthWords === "number"
                ? { targetLengthWords: request.body.targetLengthWords }
                : {}),
              ...(typeof request.body.generateImages === "boolean"
                ? { generateImages: request.body.generateImages }
                : {}),
              ...(mode ? { execution: { mode } } : {})
            },
            resourceType: "project",
            resourceId: request.params.projectId
          }
        );
        return {
          jobId: job.id,
          status: toAsyncRouteStatus(job.status)
        };
      } catch (error) {
        return reply.code(resolveErrorStatusCode(error, 400)).send({
          error: "multimodal_pipeline_failed",
          message: error instanceof Error ? error.message : "Unable to run multimodal pipeline"
        });
      }
    }
  );
};
