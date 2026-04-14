import type { FastifyPluginAsync } from "fastify";
import { requireRole } from "../auth/runtime.js";
import { localRepositoriesService } from "../services/local-repos-service.js";
import { versioningService } from "../services/versioning-service.js";

interface CreateSnapshotBody {
  localRepositoryId: string;
  taskId?: string;
  label: string;
  trigger: "task_start" | "task_end" | "manual";
  maxFiles?: number;
  maxFileBytes?: number;
}

export const versioningRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { localRepositoryId?: string; taskId?: string } }>(
    "/versioning/snapshots",
    {
      schema: { tags: ["versioning"], summary: "List version snapshots" }
    },
    async (request) => {
      const items = await versioningService.listSnapshots({
        ...(request.query.localRepositoryId ? { localRepositoryId: request.query.localRepositoryId } : {}),
        ...(request.query.taskId ? { taskId: request.query.taskId } : {})
      });
      return { items };
    }
  );

  fastify.get<{ Params: { snapshotId: string } }>(
    "/versioning/snapshots/:snapshotId",
    {
      schema: { tags: ["versioning"], summary: "Get snapshot detail" }
    },
    async (request, reply) => {
      const item = await versioningService.getSnapshot(request.params.snapshotId);
      if (!item) {
        return reply.code(404).send({ error: "not_found", message: "Snapshot not found" });
      }
      return { item };
    }
  );

  fastify.post<{ Body: CreateSnapshotBody }>(
    "/versioning/snapshots",
    {
      schema: { tags: ["versioning"], summary: "Create a version snapshot" }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;
      const body = request.body;
      if (!body?.localRepositoryId || !body?.label || !body?.trigger) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "localRepositoryId, label and trigger are required"
        });
      }
      const localRepository = await localRepositoriesService.getLocalRepository(body.localRepositoryId);
      if (!localRepository) {
        return reply.code(404).send({
          error: "not_found",
          message: "Local repository not found"
        });
      }
      const item = await versioningService.createSnapshot(
        {
          localRepositoryId: body.localRepositoryId,
          repositoryPath: localRepository.rootPath,
          label: body.label,
          trigger: body.trigger,
          ...(body.taskId ? { taskId: body.taskId } : {}),
          ...(body.maxFiles !== undefined ? { maxFiles: body.maxFiles } : {}),
          ...(body.maxFileBytes !== undefined ? { maxFileBytes: body.maxFileBytes } : {})
        },
        request.authPrincipal?.userId ?? "system"
      );
      return { item };
    }
  );

  fastify.get<{ Querystring: { leftSnapshotId: string; rightSnapshotId: string } }>(
    "/versioning/diff",
    {
      schema: { tags: ["versioning"], summary: "Compute snapshot diff" }
    },
    async (request, reply) => {
      if (!request.query.leftSnapshotId || !request.query.rightSnapshotId) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "leftSnapshotId and rightSnapshotId are required"
        });
      }
      const item = await versioningService.diffSnapshots(
        request.query.leftSnapshotId,
        request.query.rightSnapshotId
      );
      return { item };
    }
  );
};
