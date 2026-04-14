import type { FastifyPluginAsync } from "fastify";
import { requireRole } from "../auth/runtime.js";
import { schemaDocsService } from "../services/schema-docs-service.js";

interface IntrospectBody {
  id?: string;
  title: string;
  description: string;
  conventions?: Array<{ key: string; value: string }>;
  stackNotes?: string[];
}

export const schemaDocsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/schema-docs",
    {
      schema: {
        tags: ["schema-docs"],
        summary: "List schema documentation records"
      }
    },
    async () => {
      const items = await schemaDocsService.listSchemaDocs();
      return { items };
    }
  );

  fastify.get<{ Params: { schemaDocId: string } }>(
    "/schema-docs/:schemaDocId",
    {
      schema: {
        tags: ["schema-docs"],
        summary: "Get one schema documentation record"
      }
    },
    async (request, reply) => {
      const item = await schemaDocsService.getSchemaDoc(request.params.schemaDocId);
      if (!item) {
        return reply.code(404).send({ error: "not_found", message: "Schema doc not found" });
      }
      return { item };
    }
  );

  fastify.post<{ Body: IntrospectBody }>(
    "/schema-docs/introspect",
    {
      schema: {
        tags: ["schema-docs"],
        summary: "Introspect DB schema and upsert schema documentation"
      }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;
      if (!request.body?.title || !request.body?.description) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "title and description are required"
        });
      }

      const item = await schemaDocsService.introspectAndStore(
        {
          title: request.body.title,
          description: request.body.description,
          ...(request.body.id ? { id: request.body.id } : {}),
          ...(request.body.conventions ? { conventions: request.body.conventions } : {}),
          ...(request.body.stackNotes ? { stackNotes: request.body.stackNotes } : {})
        },
        request.authPrincipal?.userId ?? "system"
      );

      return { item };
    }
  );
};
