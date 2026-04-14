import type { FastifyPluginAsync } from "fastify";
import { requireRole } from "../auth/runtime.js";
import { localRepositoriesService } from "../services/local-repos-service.js";

export const localRepositoriesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/local-repos",
    {
      schema: { tags: ["local-repos"], summary: "List local repositories" }
    },
    async () => {
      const items = await localRepositoriesService.listLocalRepositories();
      return { items };
    }
  );

  fastify.get<{ Params: { localRepositoryId: string } }>(
    "/local-repos/:localRepositoryId",
    {
      schema: { tags: ["local-repos"], summary: "Get local repository detail" }
    },
    async (request, reply) => {
      const item = await localRepositoriesService.getLocalRepository(request.params.localRepositoryId);
      if (!item) {
        return reply.code(404).send({ error: "not_found", message: "Local repository not found" });
      }
      return { item };
    }
  );

  fastify.post(
    "/local-repos",
    {
      schema: { tags: ["local-repos"], summary: "Register local repository path" }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;
      const body = request.body as Record<string, unknown>;
      if (typeof body.name !== "string" || typeof body.rootPath !== "string") {
        return reply.code(400).send({ error: "invalid_request", message: "name and rootPath are required" });
      }
      const item = await localRepositoriesService.createLocalRepository(
        {
          name: body.name,
          rootPath: body.rootPath,
          ...(typeof body.description === "string" ? { description: body.description } : {}),
          ...(typeof body.status === "string"
            ? { status: body.status as "active" | "disabled" | "error" }
            : {})
        },
        request.authPrincipal?.userId ?? "system"
      );
      return { item };
    }
  );

  fastify.put<{ Params: { localRepositoryId: string } }>(
    "/local-repos/:localRepositoryId",
    {
      schema: { tags: ["local-repos"], summary: "Update local repository metadata" }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;
      const body = request.body as Record<string, unknown>;
      const item = await localRepositoriesService.updateLocalRepository(
        request.params.localRepositoryId,
        {
          ...(typeof body.name === "string" ? { name: body.name } : {}),
          ...(typeof body.rootPath === "string" ? { rootPath: body.rootPath } : {}),
          ...(typeof body.description === "string" ? { description: body.description } : {}),
          ...(typeof body.status === "string"
            ? { status: body.status as "active" | "disabled" | "error" }
            : {})
        },
        request.authPrincipal?.userId ?? "system"
      );
      return { item };
    }
  );

  fastify.delete<{ Params: { localRepositoryId: string } }>(
    "/local-repos/:localRepositoryId",
    {
      schema: { tags: ["local-repos"], summary: "Delete local repository registration" }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;
      await localRepositoriesService.deleteLocalRepository(request.params.localRepositoryId);
      return { ok: true as const };
    }
  );

  fastify.get<{ Params: { localRepositoryId: string }; Querystring: { path?: string } }>(
    "/local-repos/:localRepositoryId/files",
    {
      schema: { tags: ["local-repos"], summary: "List files/folders for file manager" }
    },
    async (request) => {
      const items = await localRepositoriesService.listFiles(
        request.params.localRepositoryId,
        request.query.path ?? "."
      );
      return { items };
    }
  );

  fastify.get<{ Params: { localRepositoryId: string }; Querystring: { path: string } }>(
    "/local-repos/:localRepositoryId/file",
    {
      schema: { tags: ["local-repos"], summary: "Read repository file content (read-only)" }
    },
    async (request, reply) => {
      if (!request.query.path || request.query.path.trim().length === 0) {
        return reply.code(400).send({ error: "invalid_request", message: "path query parameter is required" });
      }
      const item = await localRepositoriesService.readFileContent(
        request.params.localRepositoryId,
        request.query.path
      );
      return { item };
    }
  );

  fastify.get<{ Params: { localRepositoryId: string }; Querystring: { limit?: string } }>(
    "/local-repos/:localRepositoryId/history",
    {
      schema: { tags: ["local-repos"], summary: "Get git commit history for repository" }
    },
    async (request) => {
      const limit = request.query.limit ? Number.parseInt(request.query.limit, 10) : 30;
      const items = await localRepositoriesService.getGitHistory(request.params.localRepositoryId, limit);
      return { items };
    }
  );

  fastify.post<{ Params: { localRepositoryId: string } }>(
    "/local-repos/:localRepositoryId/scan",
    {
      schema: { tags: ["local-repos"], summary: "Scan and index repository synchronously" }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;
      const item = await localRepositoriesService.scanRepository(
        request.params.localRepositoryId,
        request.authPrincipal?.userId ?? "system"
      );
      return { item };
    }
  );

  fastify.post<{ Params: { localRepositoryId: string } }>(
    "/local-repos/:localRepositoryId/scan/schedule",
    {
      schema: { tags: ["local-repos"], summary: "Schedule repository scan with BullMQ" }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;
      const item = await localRepositoriesService.scheduleScan(request.params.localRepositoryId);
      return { item };
    }
  );

  fastify.get<{ Params: { jobId: string } }>(
    "/local-repos/jobs/:jobId",
    {
      schema: { tags: ["local-repos"], summary: "Get scheduled local-repo job snapshot" }
    },
    async (request, reply) => {
      const item = await localRepositoriesService.getJob(request.params.jobId);
      if (!item) {
        return reply.code(404).send({ error: "not_found", message: "Job not found" });
      }
      return { item };
    }
  );
};
