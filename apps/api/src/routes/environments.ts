import type { FastifyPluginAsync } from "fastify";
import { requireRole } from "../auth/runtime.js";
import { environmentsService } from "../services/environments-service.js";

export const environmentsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/environments",
    {
      schema: { tags: ["environments"], summary: "List environments" }
    },
    async () => {
      const items = await environmentsService.listEnvironments();
      return { items };
    }
  );

  fastify.get<{ Params: { environmentId: string } }>(
    "/environments/:environmentId",
    {
      schema: { tags: ["environments"], summary: "Get environment detail" }
    },
    async (request, reply) => {
      const item = await environmentsService.getEnvironment(request.params.environmentId);
      if (!item) {
        return reply.code(404).send({ error: "not_found", message: "Environment not found" });
      }
      return { item };
    }
  );

  fastify.post(
    "/environments",
    {
      schema: { tags: ["environments"], summary: "Create environment" }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;
      const body = request.body as Record<string, unknown>;
      if (typeof body.name !== "string" || typeof body.description !== "string" || typeof body.type !== "string") {
        return reply.code(400).send({ error: "invalid_request", message: "name, description, type are required" });
      }
      const item = await environmentsService.createEnvironment(
        {
          name: body.name,
          description: body.description,
          type: body.type as "local" | "development" | "staging" | "production",
          ...(typeof body.region === "string" ? { region: body.region } : {}),
          ...(typeof body.baseUrl === "string" ? { baseUrl: body.baseUrl } : {}),
          ...(Array.isArray(body.notes)
            ? { notes: body.notes.filter((entry): entry is string => typeof entry === "string") }
            : {})
        },
        request.authPrincipal?.userId ?? "system"
      );
      return { item };
    }
  );

  fastify.put<{ Params: { environmentId: string } }>(
    "/environments/:environmentId",
    {
      schema: { tags: ["environments"], summary: "Update environment" }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;
      const body = request.body as Record<string, unknown>;
      const item = await environmentsService.updateEnvironment(
        request.params.environmentId,
        {
          ...(typeof body.name === "string" ? { name: body.name } : {}),
          ...(typeof body.description === "string" ? { description: body.description } : {}),
          ...(typeof body.type === "string"
            ? { type: body.type as "local" | "development" | "staging" | "production" }
            : {}),
          ...(typeof body.region === "string" ? { region: body.region } : {}),
          ...(typeof body.baseUrl === "string" ? { baseUrl: body.baseUrl } : {}),
          ...(typeof body.status === "string"
            ? { status: body.status as "active" | "degraded" | "down" | "maintenance" }
            : {}),
          ...(Array.isArray(body.notes)
            ? { notes: body.notes.filter((entry): entry is string => typeof entry === "string") }
            : {})
        },
        request.authPrincipal?.userId ?? "system"
      );
      return { item };
    }
  );

  fastify.delete<{ Params: { environmentId: string } }>(
    "/environments/:environmentId",
    {
      schema: { tags: ["environments"], summary: "Delete environment" }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;
      await environmentsService.deleteEnvironment(request.params.environmentId);
      return { ok: true as const };
    }
  );

  fastify.get<{ Querystring: { environmentId?: string } }>(
    "/machines",
    {
      schema: { tags: ["environments"], summary: "List machines" }
    },
    async (request) => {
      const items = await environmentsService.listMachines(request.query.environmentId);
      return { items };
    }
  );

  fastify.get<{ Params: { machineId: string } }>(
    "/machines/:machineId",
    {
      schema: { tags: ["environments"], summary: "Get machine detail" }
    },
    async (request, reply) => {
      const item = await environmentsService.getMachine(request.params.machineId);
      if (!item) {
        return reply.code(404).send({ error: "not_found", message: "Machine not found" });
      }
      return { item };
    }
  );

  fastify.post(
    "/machines",
    {
      schema: { tags: ["environments"], summary: "Create machine" }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;
      const body = request.body as Record<string, unknown>;
      if (
        typeof body.environmentId !== "string" ||
        typeof body.name !== "string" ||
        typeof body.host !== "string"
      ) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "environmentId, name and host are required"
        });
      }
      const item = await environmentsService.createMachine(
        {
          environmentId: body.environmentId,
          name: body.name,
          host: body.host,
          cpuCores: Number(body.cpuCores ?? 0),
          gpuCount: Number(body.gpuCount ?? 0),
          ramGb: Number(body.ramGb ?? 0),
          ...(Array.isArray(body.services)
            ? { services: body.services.filter((entry): entry is string => typeof entry === "string") }
            : {}),
          ...(Array.isArray(body.agents)
            ? { agents: body.agents.filter((entry): entry is string => typeof entry === "string") }
            : {}),
          ...(body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? { metadata: body.metadata as Record<string, unknown> }
            : {})
        },
        request.authPrincipal?.userId ?? "system"
      );
      return { item };
    }
  );

  fastify.put<{ Params: { machineId: string } }>(
    "/machines/:machineId",
    {
      schema: { tags: ["environments"], summary: "Update machine" }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;
      const body = request.body as Record<string, unknown>;
      const item = await environmentsService.updateMachine(
        request.params.machineId,
        {
          ...(typeof body.environmentId === "string" ? { environmentId: body.environmentId } : {}),
          ...(typeof body.name === "string" ? { name: body.name } : {}),
          ...(typeof body.host === "string" ? { host: body.host } : {}),
          ...(typeof body.status === "string"
            ? { status: body.status as "online" | "degraded" | "offline" | "maintenance" }
            : {}),
          ...(body.cpuCores !== undefined ? { cpuCores: Number(body.cpuCores) } : {}),
          ...(body.gpuCount !== undefined ? { gpuCount: Number(body.gpuCount) } : {}),
          ...(body.ramGb !== undefined ? { ramGb: Number(body.ramGb) } : {}),
          ...(Array.isArray(body.services)
            ? { services: body.services.filter((entry): entry is string => typeof entry === "string") }
            : {}),
          ...(Array.isArray(body.agents)
            ? { agents: body.agents.filter((entry): entry is string => typeof entry === "string") }
            : {}),
          ...(body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? { metadata: body.metadata as Record<string, unknown> }
            : {})
        },
        request.authPrincipal?.userId ?? "system"
      );
      return { item };
    }
  );

  fastify.delete<{ Params: { machineId: string } }>(
    "/machines/:machineId",
    {
      schema: { tags: ["environments"], summary: "Delete machine" }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;
      await environmentsService.deleteMachine(request.params.machineId);
      return { ok: true as const };
    }
  );

  fastify.post<{ Params: { machineId: string } }>(
    "/machines/:machineId/healthcheck",
    {
      schema: { tags: ["environments"], summary: "Run health check for a machine" }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;
      const item = await environmentsService.runMachineHealthcheck(request.params.machineId);
      return { item };
    }
  );
};
