import type { FastifyPluginAsync } from "fastify";
import { defaultMarketplaceUrl, skillsService } from "../services/skills-service.js";

interface InstallSkillBody {
  name: string;
  repositoryUrl: string;
}

export const skillsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { marketplace?: string; query?: string } }>(
    "/skills/catalog",
    {
      schema: { tags: ["skills"], summary: "Fetch and list skill catalog from a marketplace URL" }
    },
    async (request, reply) => {
      const marketplace = request.query.marketplace?.trim() || defaultMarketplaceUrl;
      const query = request.query.query?.trim() || "";
      try {
        const catalog = await skillsService.fetchMarketplace(marketplace);
        const items = query
          ? catalog.filter((skill) => {
              const normalized = query.toLowerCase();
              return (
                skill.name.toLowerCase().includes(normalized) ||
                skill.description.toLowerCase().includes(normalized) ||
                skill.categories.some((category) => category.toLowerCase().includes(normalized))
              );
            })
          : catalog;
        return {
          items,
          marketplace
        };
      } catch (error) {
        return reply.code(502).send({
          error: "skills_catalog_unavailable",
          message: error instanceof Error ? error.message : "Unable to fetch marketplace catalog",
          marketplace
        });
      }
    }
  );

  fastify.get<{ Querystring: { query?: string } }>(
    "/skills/installed",
    {
      schema: { tags: ["skills"], summary: "List installed skills" }
    },
    async (request) => {
      const query = request.query.query?.trim();
      const items = query ? await skillsService.searchSkills(query) : await skillsService.listInstalled();
      return {
        items: query ? items.filter((item) => item.installed) : items
      };
    }
  );

  fastify.post<{ Body: InstallSkillBody }>(
    "/skills/install",
    {
      schema: { tags: ["skills"], summary: "Install a skill from repository URL" }
    },
    async (request, reply) => {
      const body = request.body;
      if (!body?.name || !body?.repositoryUrl) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "name and repositoryUrl are required"
        });
      }

      const result = await skillsService.installSkill({
        name: body.name,
        repositoryUrl: body.repositoryUrl
      });

      // Skill installation is optional; return success envelope even when install command fails.
      return {
        item: result.item,
        installed: result.installed,
        ...(result.error ? { warning: result.error } : {})
      };
    }
  );
};
