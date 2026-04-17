import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { DEFAULT_TENANT_ID, runWithTenantContext } from "@cp/db";
import { createAuthRuntime, resolveRequestPrincipal } from "./auth/runtime.js";
import { apiStore } from "./services/api-store.js";
import { maybeRunStartupProviderDiscovery } from "./services/provider-discovery-service.js";
import { syncKnowledgeFromFilesystem } from "./services/knowledge-service.js";
import { syncSubpromptsCatalog } from "./services/subprompts-service.js";
import { applyRequestTenantContext, resolveTenantHeader } from "./tenant/runtime.js";
import {
  authRoutes,
  adminRoutes,
  internalRunnerRoutes,
  brainstormRoutes,
  approvalsRoutes,
  artifactsRoutes,
  chatRoutes,
  environmentsRoutes,
  experimentsRoutes,
  healthRoutes,
  localRepositoriesRoutes,
  jobsRoutes,
  executionRoutes,
  modelsRoutes,
  memoryRoutes,
  knowledgeRoutes,
  contextRoutes,
  auditRoutes,
  usageRoutes,
  schemaDocsRoutes,
  schemaObservabilityRoutes,
  secretsRoutes,
  providersRoutes,
  subpromptsRoutes,
  promptsRoutes,
  skillsRoutes,
  agentsRoutes,
  mcpRoutes,
  codingWorkflowRoutes,
  projectsRoutes,
  workspacesRoutes,
  pipelinesRoutes,
  repositoriesRoutes,
  retrievalRoutes,
  roadmapRoutes,
  runsRoutes,
  tasksRoutes,
  versioningRoutes,
  verificationRoutes
} from "./routes/index.js";

export async function buildApp() {
  const app = Fastify({ logger: true });
  await apiStore.initialize();
  await syncSubpromptsCatalog().catch(() => undefined);
  await syncKnowledgeFromFilesystem("startup_sync").catch(() => undefined);
  await maybeRunStartupProviderDiscovery();
  const authRuntime = await createAuthRuntime();

  await app.register(cors, { origin: true });
  await app.register(sensible);
  await app.register(swagger, {
    openapi: {
      info: {
        title: "AI Control Plane API",
        description: "Fastify control-plane backend for multi-agent development orchestration.",
        version: "0.1.0"
      }
    }
  });
  await app.register(swaggerUi, { routePrefix: "/documentation" });

  app.decorate("authRuntime", authRuntime);
  app.addHook("onRequest", (request, _reply, done) => {
    const tenantId = resolveTenantHeader(request) ?? DEFAULT_TENANT_ID;
    runWithTenantContext({ tenantId }, async () => {
      done();
    }).catch(done);
  });
  app.addHook("preHandler", async (request, reply) => {
    request.authPrincipal = await resolveRequestPrincipal(request, authRuntime);
    try {
      await applyRequestTenantContext(request);
    } catch (error) {
      const statusCode =
        typeof error === "object" && error && "statusCode" in error
          ? Number((error as { statusCode?: number }).statusCode)
          : 500;

      if (statusCode === 403) {
        return reply.code(403).send({
          error: "forbidden",
          message: error instanceof Error ? error.message : "Tenant access denied"
        });
      }

      throw error;
    }
  });

  app.get("/", async () => ({
    service: "ai-control-plane-api",
    status: "ok",
    documentation: "/documentation",
    openapi: "/documentation/json"
  }));

  await app.register(healthRoutes);
  await app.register(projectsRoutes);
  await app.register(workspacesRoutes);
  await app.register(pipelinesRoutes);
  await app.register(repositoriesRoutes);
  await app.register(roadmapRoutes);
  await app.register(tasksRoutes);
  await app.register(runsRoutes);
  await app.register(approvalsRoutes);
  await app.register(artifactsRoutes);
  await app.register(verificationRoutes);
  await app.register(memoryRoutes);
  await app.register(knowledgeRoutes);
  await app.register(contextRoutes);
  await app.register(retrievalRoutes);
  await app.register(experimentsRoutes);
  await app.register(providersRoutes);
  await app.register(modelsRoutes);
  await app.register(auditRoutes);
  await app.register(usageRoutes);
  await app.register(subpromptsRoutes);
  await app.register(promptsRoutes);
  await app.register(brainstormRoutes);
  await app.register(skillsRoutes);
  await app.register(agentsRoutes);
  await app.register(mcpRoutes);
  await app.register(codingWorkflowRoutes);
  await app.register(secretsRoutes);
  await app.register(schemaDocsRoutes);
  await app.register(schemaObservabilityRoutes);
  await app.register(environmentsRoutes);
  await app.register(localRepositoriesRoutes);
  await app.register(jobsRoutes);
  await app.register(executionRoutes);
  await app.register(versioningRoutes);
  await app.register(chatRoutes);
  await app.register(authRoutes);
  await app.register(adminRoutes);
  await app.register(internalRunnerRoutes);

  app.addHook("onClose", async () => {
    await apiStore.close();
  });

  return app;
}
