import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";
import { runProviderAutoDiscovery } from "../services/provider-discovery-service.js";

export const providersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/providers", { schema: { tags: ["providers"], summary: "List provider configs" } }, async () => ({
    items: await apiStore.listProviderConfigs()
  }));

  fastify.get("/providers/capabilities", { schema: { tags: ["providers"], summary: "List provider capabilities" } }, async () => ({
    items: await apiStore.listProviderCapabilities()
  }));

  fastify.get("/providers/models", { schema: { tags: ["providers"], summary: "List provider models" } }, async () => ({
    items: await apiStore.listProviderModels()
  }));

  fastify.get<{ Querystring: { projectId?: string } }>("/providers/bindings", { schema: { tags: ["providers"], summary: "List project provider bindings" } }, async (request) => ({
    items: await apiStore.listProviderBindings(request.query.projectId)
  }));

  fastify.get("/providers/health", { schema: { tags: ["providers"], summary: "List provider healthchecks" } }, async () => ({
    items: await apiStore.listProviderHealthchecks()
  }));

  fastify.get(
    "/providers/discovery/logs",
    { schema: { tags: ["providers"], summary: "List provider auto-discovery logs" } },
    async () => ({
      items: await apiStore.listProviderDiscoveryLogs()
    })
  );

  fastify.post(
    "/providers/discovery/update",
    { schema: { tags: ["providers"], summary: "Run provider auto-discovery and update registry tables" } },
    async () => {
      const item = await runProviderAutoDiscovery("manual");
      return { item };
    }
  );
};
