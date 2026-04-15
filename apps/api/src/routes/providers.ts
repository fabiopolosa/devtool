import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ProviderConfig, ProviderName } from "@cp/domain";
import { resetNormalizedModelDiscoveryCache } from "@cp/providers";
import { apiStore } from "../services/api-store.js";
import { runProviderAutoDiscovery } from "../services/provider-discovery-service.js";
import { auditLogService } from "../services/audit-log-service.js";
import {
  prepareProviderCredentials,
  redactedProviderConfigForAudit,
  toProviderConfigResponse,
  validateProviderConfig
} from "../services/provider-config-service.js";

type UpsertProviderConfigBody = {
  provider?: ProviderName;
  providerId?: ProviderName;
  endpoint?: string;
  authRef?: string;
  apiKey?: string;
  enabled?: boolean;
  timeoutMs?: number;
  rpm?: number;
  tpm?: number;
  requestsPerMinute?: number;
  tokensPerMinute?: number;
  metadata?: Record<string, unknown>;
};

const defaultTimeoutMs = 30_000;

const requireOwnerRole = (
  request: FastifyRequest,
  reply: FastifyReply
): request is FastifyRequest & { tenantRole: "owner"; tenantId: string } => {
  if (request.tenantRole === "owner" && request.tenantId) {
    return true;
  }
  reply.code(403).send({
    error: "forbidden",
    message: "Only tenant owners can modify provider configuration."
  });
  return false;
};

const normalizeProviderName = (body: UpsertProviderConfigBody): ProviderName | undefined =>
  body.providerId ?? body.provider;

const normalizeRateLimits = (body: UpsertProviderConfigBody): Pick<ProviderConfig, "requestsPerMinute" | "tokensPerMinute"> => ({
  ...(Number.isFinite(body.requestsPerMinute)
    ? { requestsPerMinute: body.requestsPerMinute! > 0 ? body.requestsPerMinute : 0 }
    : Number.isFinite(body.rpm)
      ? { requestsPerMinute: body.rpm! > 0 ? body.rpm : 0 }
      : {}),
  ...(Number.isFinite(body.tokensPerMinute)
    ? { tokensPerMinute: body.tokensPerMinute! > 0 ? body.tokensPerMinute : 0 }
    : Number.isFinite(body.tpm)
      ? { tokensPerMinute: body.tpm! > 0 ? body.tpm : 0 }
      : {})
});

const changedFields = (before: Record<string, unknown> | undefined, after: Record<string, unknown>): string[] => {
  if (!before) return Object.keys(after);
  return Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
};

export const providersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/providers", { schema: { tags: ["providers"], summary: "List provider configs" } }, async () => {
    const items = await apiStore.listProviderConfigs();
    return { items: await Promise.all(items.map((item) => toProviderConfigResponse(item))) };
  });

  fastify.get(
    "/providers/config",
    { schema: { tags: ["providers"], summary: "List tenant-scoped provider configuration records" } },
    async () => {
      const items = await apiStore.listProviderConfigs();
      return { items: await Promise.all(items.map((item) => toProviderConfigResponse(item))) };
    }
  );

  fastify.post<{ Body: UpsertProviderConfigBody }>(
    "/providers/config",
    { schema: { tags: ["providers"], summary: "Create provider configuration (owner role required)" } },
    async (request, reply) => {
      if (!requireOwnerRole(request, reply)) return;

      const provider = normalizeProviderName(request.body ?? {});
      if (!provider) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "providerId (or provider) is required."
        });
      }

      const providerConfigId = randomUUID();
      const now = new Date().toISOString();
      const actor = request.authPrincipal?.userId ?? "system";
      const credentials = await prepareProviderCredentials({
        tenantId: request.tenantId,
        provider,
        providerConfigId,
        actor,
        ...(request.body?.apiKey !== undefined ? { apiKeyInput: request.body.apiKey } : {}),
        ...(request.body?.authRef !== undefined ? { authRefInput: request.body.authRef } : {})
      });
      const validation = await validateProviderConfig({
        provider,
        tenantId: request.tenantId,
        authRef: credentials.authRef,
        ...(request.body?.endpoint !== undefined ? { endpoint: request.body.endpoint } : {}),
        timeoutMs: request.body?.timeoutMs ?? defaultTimeoutMs
      });

      const created = await apiStore.createProviderConfig({
        id: providerConfigId,
        tenantId: request.tenantId,
        provider,
        providerId: provider,
        ...(request.body?.endpoint ? { endpoint: request.body.endpoint } : {}),
        authRef: credentials.authRef,
        ...(credentials.secretRef ? { secretRef: credentials.secretRef } : {}),
        enabled: request.body?.enabled ?? true,
        timeoutMs: request.body?.timeoutMs ?? defaultTimeoutMs,
        validationStatus: validation.status,
        lastValidatedAt: validation.lastValidatedAt,
        validationError: validation.error ?? "",
        ...normalizeRateLimits(request.body ?? {}),
        metadata: request.body?.metadata ?? {},
        createdAt: now,
        createdBy: actor,
        updatedAt: now,
        updatedBy: actor
      });

      resetNormalizedModelDiscoveryCache(request.tenantId);

      await auditLogService.record({
        tenantId: request.tenantId,
        userId: actor,
        action: "provider.config.create",
        resourceType: "provider_config",
        resourceId: created.id,
        status: "success",
        metadata: {
          after: redactedProviderConfigForAudit(created),
          validationStatus: created.validationStatus
        },
        actor
      });

      return { item: await toProviderConfigResponse(created) };
    }
  );

  fastify.patch<{ Params: { id: string }; Body: UpsertProviderConfigBody }>(
    "/providers/config/:id",
    { schema: { tags: ["providers"], summary: "Patch provider configuration (owner role required)" } },
    async (request, reply) => {
      if (!requireOwnerRole(request, reply)) return;

      const current = (await apiStore.listProviderConfigs()).find((item) => item.id === request.params.id);
      if (!current) {
        return reply.code(404).send({
          error: "not_found",
          message: "Provider config not found for current tenant."
        });
      }

      const provider = normalizeProviderName(request.body ?? {});
      const effectiveProvider = provider ?? current.providerId ?? current.provider;
      const actor = request.authPrincipal?.userId ?? "system";
      const credentials = await prepareProviderCredentials({
        tenantId: request.tenantId,
        provider: effectiveProvider,
        providerConfigId: current.id,
        actor,
        ...(request.body?.apiKey !== undefined ? { apiKeyInput: request.body.apiKey } : {}),
        ...(request.body?.authRef !== undefined ? { authRefInput: request.body.authRef } : {}),
        existingConfig: current
      });

      const validation = await validateProviderConfig({
        provider: effectiveProvider,
        tenantId: request.tenantId,
        authRef: credentials.authRef,
        ...((request.body?.endpoint ?? current.endpoint) !== undefined
          ? { endpoint: request.body?.endpoint ?? current.endpoint }
          : {}),
        timeoutMs: request.body?.timeoutMs ?? current.timeoutMs
      });

      const patch: Partial<ProviderConfig> = {
        ...(provider ? { provider: effectiveProvider, providerId: effectiveProvider } : {}),
        ...(request.body?.endpoint !== undefined ? { endpoint: request.body.endpoint } : {}),
        authRef: credentials.authRef,
        ...(credentials.secretRef ? { secretRef: credentials.secretRef } : {}),
        ...(request.body?.enabled !== undefined ? { enabled: request.body.enabled } : {}),
        ...(request.body?.timeoutMs !== undefined ? { timeoutMs: request.body.timeoutMs } : {}),
        ...normalizeRateLimits(request.body ?? {}),
        validationStatus: validation.status,
        lastValidatedAt: validation.lastValidatedAt,
        validationError: validation.error ?? "",
        ...(request.body?.metadata !== undefined ? { metadata: request.body.metadata } : {}),
        updatedAt: new Date().toISOString(),
        updatedBy: actor
      };

      try {
        const updated = await apiStore.updateProviderConfig(request.params.id, patch);
        resetNormalizedModelDiscoveryCache(request.tenantId);

        const before = redactedProviderConfigForAudit(current);
        const after = redactedProviderConfigForAudit(updated) ?? {};
        await auditLogService.record({
          tenantId: request.tenantId,
          userId: actor,
          action: "provider.config.update",
          resourceType: "provider_config",
          resourceId: updated.id,
          status: "success",
          metadata: {
            before,
            after,
            changedFields: changedFields(before, after),
            validationStatus: updated.validationStatus
          },
          actor
        });

        return { item: await toProviderConfigResponse(updated) };
      } catch (error) {
        if (error instanceof Error && error.message.includes("Record not found")) {
          return reply.code(404).send({
            error: "not_found",
            message: "Provider config not found for current tenant."
          });
        }
        throw error;
      }
    }
  );

  fastify.get("/providers/capabilities", { schema: { tags: ["providers"], summary: "List provider capabilities" } }, async () => ({
    items: await apiStore.listProviderCapabilities()
  }));

  fastify.get("/providers/models", { schema: { tags: ["providers"], summary: "List provider models" } }, async () => {
    const [configs, models] = await Promise.all([apiStore.listProviderConfigs(), apiStore.listProviderModels()]);
    const enabledIds = new Set(configs.filter((item) => item.enabled).map((item) => item.id));
    const items = enabledIds.size > 0 ? models.filter((model) => enabledIds.has(model.providerConfigId)) : models;
    return { items };
  });

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
    async (request, reply) => {
      if (!requireOwnerRole(request, reply)) return;
      const item = await runProviderAutoDiscovery("manual");
      resetNormalizedModelDiscoveryCache(request.tenantId);
      return { item };
    }
  );

  fastify.get(
    "/tenants",
    { schema: { tags: ["tenants"], summary: "List tenants (owner role required)" } },
    async (request, reply) => {
      if (!requireOwnerRole(request, reply)) return;
      return { items: await apiStore.listTenants() };
    }
  );
};
