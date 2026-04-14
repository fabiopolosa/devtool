import type { FastifyPluginAsync } from "fastify";
import type { Subprompt } from "@cp/domain";
import {
  composeSubprompts,
  getSubprompt,
  listSubprompts,
  syncSubpromptsCatalog
} from "../services/subprompts-service.js";

const parseBoolean = (value: string | undefined): boolean | undefined => {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  return undefined;
};

export const subpromptsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: {
      category?: Subprompt["category"];
      enabled?: string;
      refresh?: string;
      tag?: string;
      includeContent?: string;
    };
  }>(
    "/subprompts",
    {
      schema: { tags: ["subprompts"], summary: "List subprompt templates with optional refresh" }
    },
    async (request) => {
      const enabled = parseBoolean(request.query.enabled);
      const refresh = parseBoolean(request.query.refresh) ?? false;
      const includeContent = parseBoolean(request.query.includeContent) ?? false;
      const items = await listSubprompts({
        ...(request.query.category ? { category: request.query.category } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
        ...(request.query.tag ? { tag: request.query.tag } : {}),
        refresh
      });
      if (includeContent) {
        return { items };
      }
      return {
        items: items.map(({ prompt: _prompt, ...metadata }) => metadata)
      };
    }
  );

  fastify.post(
    "/subprompts/sync",
    {
      schema: { tags: ["subprompts"], summary: "Sync subprompt files from configs/subprompts into DB" }
    },
    async () => {
      const items = await syncSubpromptsCatalog();
      return { items, count: items.length };
    }
  );

  fastify.get<{ Params: { subpromptId: string } }>(
    "/subprompts/:subpromptId",
    {
      schema: { tags: ["subprompts"], summary: "Get one subprompt template" }
    },
    async (request, reply) => {
      const item = await getSubprompt(request.params.subpromptId);
      if (!item) {
        return reply.code(404).send({ item: null });
      }
      return { item };
    }
  );

  fastify.post<{ Body: { selectedIds?: string[]; includeDisabled?: boolean; additionalInstructions?: string[] } }>(
    "/subprompts/compose",
    {
      schema: { tags: ["subprompts"], summary: "Compose selected subprompts into a single prompt string" }
    },
    async (request, reply) => {
      const selectedIds = request.body?.selectedIds ?? [];
      if (!Array.isArray(selectedIds)) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "selectedIds must be an array"
        });
      }

      const item = await composeSubprompts({
        selectedIds,
        ...(typeof request.body?.includeDisabled === "boolean"
          ? { includeDisabled: request.body.includeDisabled }
          : {}),
        ...(Array.isArray(request.body?.additionalInstructions)
          ? { additionalInstructions: request.body.additionalInstructions }
          : {})
      });
      return { item };
    }
  );
};
