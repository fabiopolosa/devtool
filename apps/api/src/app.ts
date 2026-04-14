import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { createAuthRuntime, resolveRequestPrincipal } from "./auth/runtime.js";
import { apiStore } from "./services/api-store.js";
import { maybeRunStartupProviderDiscovery } from "./services/provider-discovery-service.js";
import { syncSubpromptsCatalog } from "./services/subprompts-service.js";
import {
  authRoutes,
  adminRoutes,
  brainstormRoutes,
  approvalsRoutes,
  artifactsRoutes,
  chatRoutes,
  environmentsRoutes,
  experimentsRoutes,
  healthRoutes,
  localRepositoriesRoutes,
  memoryRoutes,
  schemaDocsRoutes,
  secretsRoutes,
  providersRoutes,
  subpromptsRoutes,
  skillsRoutes,
  agentsRoutes,
  mcpRoutes,
  projectsRoutes,
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
  app.addHook("preHandler", async (request) => {
    request.authPrincipal = await resolveRequestPrincipal(request, authRuntime);
  });

  app.get("/", async () => ({
    service: "ai-control-plane-api",
    status: "ok",
    documentation: "/documentation",
    openapi: "/documentation/json"
  }));

  await app.register(healthRoutes);
  await app.register(projectsRoutes);
  await app.register(repositoriesRoutes);
  await app.register(roadmapRoutes);
  await app.register(tasksRoutes);
  await app.register(runsRoutes);
  await app.register(approvalsRoutes);
  await app.register(artifactsRoutes);
  await app.register(verificationRoutes);
  await app.register(memoryRoutes);
  await app.register(retrievalRoutes);
  await app.register(experimentsRoutes);
  await app.register(providersRoutes);
  await app.register(subpromptsRoutes);
  await app.register(brainstormRoutes);
  await app.register(skillsRoutes);
  await app.register(agentsRoutes);
  await app.register(mcpRoutes);
  await app.register(secretsRoutes);
  await app.register(schemaDocsRoutes);
  await app.register(environmentsRoutes);
  await app.register(localRepositoriesRoutes);
  await app.register(versioningRoutes);
  await app.register(chatRoutes);
  await app.register(authRoutes);
  await app.register(adminRoutes);

  app.addHook("onClose", async () => {
    await apiStore.close();
  });

  return app;
}
