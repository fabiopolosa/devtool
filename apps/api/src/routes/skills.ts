import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { Skill } from "@cp/domain";
import {
  dispatchAndAwaitRunnerJob,
  getRunnerJobOutput
} from "../services/job-dispatch-service.js";
import { defaultMarketplaceUrl, skillsService } from "../services/skills-service.js";
import { resolveTenantHeader } from "../tenant/runtime.js";
import { requireTenantPermission } from "../tenant/rbac.js";

interface InstallSkillBody {
  name: string;
  repositoryUrl: string;
  scope?: "system" | "tenant" | "user";
  categories?: string[];
  version?: string;
  description?: string;
  instructions?: string;
  sourceType?: "github" | "file" | "zip";
  sourceRef?: string;
}

interface InstallUploadSkillBody {
  name: string;
  sourceType: "file" | "zip";
  fileName?: string;
  contentBase64: string;
  scope?: "system" | "tenant" | "user";
  categories?: string[];
  version?: string;
  description?: string;
  instructions?: string;
}

type ExecutionMode = "remote" | "local" | "hybrid";

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
};

const toExecutionMode = (value: unknown): ExecutionMode | undefined => {
  const normalized = asString(value)?.toLowerCase();
  if (normalized === "remote" || normalized === "local" || normalized === "hybrid") {
    return normalized;
  }
  return undefined;
};

const resolveSkillScope = (skill: Skill): "system" | "tenant" | "user" => {
  if (skill.scope === "system" || skill.scope === "tenant" || skill.scope === "user") {
    return skill.scope;
  }
  const taggedScope = skill.categories.find((category) => category.startsWith("scope:"));
  if (taggedScope === "scope:system") return "system";
  if (taggedScope === "scope:user") return "user";
  if (taggedScope === "scope:tenant") return "tenant";
  if (skill.createdBy === "system" || skill.createdBy === "skills_service") return "system";
  if (skill.createdBy.startsWith("user:")) return "user";
  return "tenant";
};

const resolveActor = (userId: string | undefined): string => userId ?? "skills_service";
const resolveTenant = (tenantId: string | undefined): string => tenantId ?? "tenant_default";
const resolveRequestTenantId = (request: FastifyRequest): string =>
  resolveTenant(request.tenantId ?? resolveTenantHeader(request));

const getSkillTenantId = (skill: Skill): string | undefined =>
  skill.metadata && typeof skill.metadata["tenantId"] === "string" && skill.metadata["tenantId"].trim().length > 0
    ? String(skill.metadata["tenantId"]).trim()
    : undefined;

const isSkillVisibleForTenant = (skill: Skill, tenantId: string): boolean => {
  const skillTenantId = getSkillTenantId(skill);
  if (!skillTenantId) return true;
  return skillTenantId === tenantId;
};

const toAsyncRouteStatus = (status: string): "pending" | "running" | "waiting_user" | "done" | "error" =>
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

const forbidSkillAccess = (reply: FastifyReply): void => {
  reply.code(403).send({
    error: "forbidden",
    message: "Skill scope policy denies access for this actor"
  });
};

const loadAuthorizedSkill = async (
  skillId: string,
  actor: string,
  tenantId: string,
  reply: FastifyReply
): Promise<Skill | null> => {
  const skill = await skillsService.getSkill(skillId);
  if (!skill) {
    reply.code(404).send({
      error: "not_found",
      message: "Skill not found"
    });
    return null;
  }
  if (!isSkillVisibleForTenant(skill, tenantId)) {
    reply.code(404).send({
      error: "not_found",
      message: "Skill not found"
    });
    return null;
  }
  if (!skillsService.canActorAccessSkill(skill, actor)) {
    forbidSkillAccess(reply);
    return null;
  }
  return skill;
};

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

  fastify.get<{ Querystring: { query?: string; scope?: "system" | "tenant" | "user"; includeDisabled?: string } }>(
    "/skills/installed",
    {
      schema: { tags: ["skills"], summary: "List installed skills" }
    },
    async (request) => {
      const query = request.query.query?.trim();
      const scope = request.query.scope;
      const includeDisabled = request.query.includeDisabled === "1" || request.query.includeDisabled === "true";
      const actor = resolveActor(request.authPrincipal?.userId);
      const tenantId = resolveRequestTenantId(request);
      const items = query
        ? await skillsService.searchSkills(query)
        : includeDisabled
          ? await skillsService.listAll()
          : await skillsService.listInstalled();
      const scoped =
        scope && (scope === "system" || scope === "tenant" || scope === "user")
          ? items.filter((item) => resolveSkillScope(item) === scope)
          : items;
      const visible = scoped.filter(
        (item) => isSkillVisibleForTenant(item, tenantId) && skillsService.canActorAccessSkill(item, actor)
      );
      return {
        items: includeDisabled ? visible : visible.filter((item) => item.installed)
      };
    }
  );

  fastify.post<{ Body: InstallSkillBody }>(
    "/skills/install",
    {
      schema: { tags: ["skills"], summary: "Install a skill from repository URL" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      const body = request.body;
      if (!body?.name || !body?.repositoryUrl) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "name and repositoryUrl are required"
        });
      }

      const scope =
        body.scope === "system" || body.scope === "tenant" || body.scope === "user"
          ? body.scope
          : "user";
      const scopeTag = `scope:${scope}`;
      const categories = [...new Set([...(Array.isArray(body.categories) ? body.categories : []), scopeTag])];

      const result = await skillsService.installSkill({
        name: body.name,
        repositoryUrl: body.repositoryUrl,
        categories,
        scope,
        ...(body.version ? { version: body.version } : {}),
        ...(body.description ? { description: body.description } : {}),
        ...(body.instructions ? { instructions: body.instructions } : {}),
        ...(body.sourceType ? { sourceType: body.sourceType } : {}),
        ...(body.sourceRef ? { sourceRef: body.sourceRef } : {}),
        metadata: {
          tenantId: resolveRequestTenantId(request)
        },
        actor: resolveActor(request.authPrincipal?.userId)
      });

      return {
        item: result.item,
        installed: result.installed,
        validation: result.validation,
        ...(result.error ? { warning: result.error } : {})
      };
    }
  );

  fastify.post<{ Body: InstallUploadSkillBody }>(
    "/skills/install-upload",
    {
      schema: { tags: ["skills"], summary: "Install a skill from file/zip upload" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      const body = request.body;
      const name = asString(body?.name);
      const sourceType = body?.sourceType;
      const contentBase64 = asString(body?.contentBase64);
      if (!name || (sourceType !== "file" && sourceType !== "zip") || !contentBase64) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "name, sourceType(file|zip), contentBase64 are required"
        });
      }

      const scope =
        body.scope === "system" || body.scope === "tenant" || body.scope === "user"
          ? body.scope
          : "user";
      const fileName = asString(body.fileName) ?? `${name}.${sourceType === "zip" ? "zip" : "txt"}`;
      const repositoryUrl = `upload://${sourceType}/${encodeURIComponent(fileName)}`;
      const scopeTag = `scope:${scope}`;
      const categories = [...new Set([...(Array.isArray(body.categories) ? body.categories : []), scopeTag])];

      const result = await skillsService.installSkill({
        name,
        repositoryUrl,
        sourceType,
        sourceRef: fileName,
        sourcePayloadBase64: contentBase64,
        scope,
        categories,
        ...(body.version ? { version: body.version } : {}),
        ...(body.description ? { description: body.description } : {}),
        ...(body.instructions ? { instructions: body.instructions } : {}),
        metadata: {
          uploaded: true,
          fileName,
          tenantId: resolveRequestTenantId(request)
        },
        actor: resolveActor(request.authPrincipal?.userId)
      });

      return {
        item: result.item,
        installed: result.installed,
        validation: result.validation,
        ...(result.error ? { warning: result.error } : {})
      };
    }
  );

  fastify.post<{ Params: { skillId: string } }>(
    "/skills/:skillId/validate",
    {
      schema: { tags: ["skills"], summary: "Validate a skill and refresh capability detection" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      try {
        const actor = resolveActor(request.authPrincipal?.userId);
        const skill = await loadAuthorizedSkill(
          request.params.skillId,
          actor,
          resolveRequestTenantId(request),
          reply
        );
        if (!skill) return;
        const result = await skillsService.validateSkill(skill.id, actor);
        return result;
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "Skill not found"
        });
      }
    }
  );

  fastify.get<{ Params: { skillId: string } }>(
    "/skills/:skillId/history",
    {
      schema: { tags: ["skills"], summary: "List skill version history" }
    },
    async (request, reply) => {
      try {
        const actor = resolveActor(request.authPrincipal?.userId);
        const skill = await loadAuthorizedSkill(
          request.params.skillId,
          actor,
          resolveRequestTenantId(request),
          reply
        );
        if (!skill) return;
        const items = await skillsService.listVersionHistory(skill.id);
        return { items };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "Skill not found"
        });
      }
    }
  );

  fastify.post<{ Params: { skillId: string }; Body?: { version?: string; sourceRef?: string; notes?: string } }>(
    "/skills/:skillId/update",
    {
      schema: { tags: ["skills"], summary: "Update skill version metadata" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      const version = asString(request.body?.version);
      if (!version) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "version is required"
        });
      }
      try {
        const actor = resolveActor(request.authPrincipal?.userId);
        const skill = await loadAuthorizedSkill(
          request.params.skillId,
          actor,
          resolveRequestTenantId(request),
          reply
        );
        if (!skill) return;
        const sourceRef = asString(request.body?.sourceRef);
        const notes = asString(request.body?.notes);
        const item = await skillsService.updateSkillVersion({
          skillId: skill.id,
          version,
          ...(sourceRef ? { sourceRef } : {}),
          ...(notes ? { notes } : {}),
          actor
        });
        return { item };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "Skill not found"
        });
      }
    }
  );

  fastify.post<{ Params: { skillId: string }; Body?: { version?: string; notes?: string } }>(
    "/skills/:skillId/rollback",
    {
      schema: { tags: ["skills"], summary: "Rollback skill to previous (or specified) version" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      try {
        const actor = resolveActor(request.authPrincipal?.userId);
        const skill = await loadAuthorizedSkill(
          request.params.skillId,
          actor,
          resolveRequestTenantId(request),
          reply
        );
        if (!skill) return;
        const targetVersion = asString(request.body?.version);
        const notes = asString(request.body?.notes);
        const item = await skillsService.rollbackSkillVersion({
          skillId: skill.id,
          ...(targetVersion ? { version: targetVersion } : {}),
          ...(notes ? { notes } : {}),
          actor
        });
        return { item };
      } catch (error) {
        return reply.code(400).send({
          error: "rollback_failed",
          message: error instanceof Error ? error.message : "Unable to rollback skill"
        });
      }
    }
  );

  fastify.post<{ Params: { skillId: string }; Body?: { notes?: string } }>(
    "/skills/:skillId/enable",
    {
      schema: { tags: ["skills"], summary: "Enable an installed skill" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      try {
        const actor = resolveActor(request.authPrincipal?.userId);
        const skill = await loadAuthorizedSkill(
          request.params.skillId,
          actor,
          resolveRequestTenantId(request),
          reply
        );
        if (!skill) return;
        const notes = asString(request.body?.notes);
        const item = await skillsService.setSkillEnabled({
          skillId: skill.id,
          enabled: true,
          actor,
          ...(notes ? { notes } : {})
        });
        return { item };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "Skill not found"
        });
      }
    }
  );

  fastify.post<{ Params: { skillId: string }; Body?: { notes?: string } }>(
    "/skills/:skillId/disable",
    {
      schema: { tags: ["skills"], summary: "Disable a skill without removing version history" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      try {
        const actor = resolveActor(request.authPrincipal?.userId);
        const skill = await loadAuthorizedSkill(
          request.params.skillId,
          actor,
          resolveRequestTenantId(request),
          reply
        );
        if (!skill) return;
        const notes = asString(request.body?.notes);
        const item = await skillsService.setSkillEnabled({
          skillId: skill.id,
          enabled: false,
          actor,
          ...(notes ? { notes } : {})
        });
        return { item };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "Skill not found"
        });
      }
    }
  );

  fastify.delete<{ Params: { skillId: string } }>(
    "/skills/:skillId",
    {
      schema: { tags: ["skills"], summary: "Uninstall a skill" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      try {
        const actor = resolveActor(request.authPrincipal?.userId);
        const skill = await loadAuthorizedSkill(
          request.params.skillId,
          actor,
          resolveRequestTenantId(request),
          reply
        );
        if (!skill) return;
        await skillsService.uninstallSkill({
          skillId: skill.id,
          actor,
          hardDelete: true
        });
        return { ok: true };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "Skill not found"
        });
      }
    }
  );

  fastify.post<{
    Params: { skillId: string };
    Body?: { mode?: ExecutionMode; command?: string; args?: string[]; input?: Record<string, unknown>; confirm?: boolean };
  }>(
    "/skills/:skillId/execute",
    {
      schema: { tags: ["skills"], summary: "Execute skill via runner internal action" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canRunAgent")) return;
      try {
        const body = request.body ?? {};
        const mode = toExecutionMode(body.mode);
        const actor = resolveActor(request.authPrincipal?.userId);
        const skill = await loadAuthorizedSkill(
          request.params.skillId,
          actor,
          resolveRequestTenantId(request),
          reply
        );
        if (!skill) return;
        const job = await dispatchAndAwaitRunnerJob(
          {
            tenantId: request.tenantId ?? "tenant_default",
            type: "system",
            title: `Skill execute ${skill.id}`,
            createdBy: actor,
            payload: {
              internalAction: "skill.execute",
              skillId: skill.id,
              actor,
              tenantId: request.tenantId ?? "tenant_default",
              ...(typeof body.input?.projectId === "string" ? { projectId: body.input.projectId } : {}),
              ...(asString(body.command) ? { command: asString(body.command) } : {}),
              ...(asStringArray(body.args).length > 0 ? { args: asStringArray(body.args) } : {}),
              ...(asRecord(body.input) ? { input: asRecord(body.input) as Record<string, unknown> } : {}),
              ...(typeof body.confirm === "boolean" ? { confirm: body.confirm } : {}),
              ...(mode ? { execution: { mode } } : {})
            },
            resourceType: "skill",
            resourceId: request.params.skillId
          },
          { timeoutMs: 120_000 }
        );

        const output = getRunnerJobOutput<{ result?: unknown }>(job);
        return {
          jobId: job.id,
          status: toAsyncRouteStatus(job.status),
          item: output?.result ?? output ?? null
        };
      } catch (error) {
        return reply.code(resolveErrorStatusCode(error, 400)).send({
          error: "skill_execute_failed",
          message: error instanceof Error ? error.message : "Unable to execute skill"
        });
      }
    }
  );
};
