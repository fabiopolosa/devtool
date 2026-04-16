import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ProviderConfig, ProviderName } from "@cp/domain";
import { createDefaultProviderRegistry, resetNormalizedModelDiscoveryCache } from "@cp/providers";
import { apiStore } from "../services/api-store.js";
import { runProviderAutoDiscovery } from "../services/provider-discovery-service.js";
import { auditLogService } from "../services/audit-log-service.js";
import {
  prepareProviderCredentials,
  redactedProviderConfigForAudit,
  toProviderConfigResponse,
  validateProviderConfig
} from "../services/provider-config-service.js";
import { usageService } from "../services/usage-service.js";

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

type ProviderDefaultsBody = {
  defaultProviderConfigId?: string | null;
  defaultModelId?: string | null;
};

const defaultTimeoutMs = 30_000;
const defaultProviderMetadataKey = "isDefaultProvider";
const defaultModelMetadataKey = "defaultModelId";

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

const parseTruthy = (value: string | undefined): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const toMetadata = (metadata: Record<string, unknown> | undefined): Record<string, unknown> => ({
  ...(metadata ?? {})
});

const isDefaultProviderConfig = (config: ProviderConfig): boolean =>
  config.metadata?.[defaultProviderMetadataKey] === true;

const defaultModelIdFromConfig = (config: ProviderConfig): string | undefined => {
  const raw = config.metadata?.[defaultModelMetadataKey];
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
};

const resolveProviderDefaults = (
  configs: ProviderConfig[]
): {
  defaultProviderConfigId?: string;
  defaultProvider?: ProviderName;
  defaultModelId?: string;
} => {
  const selected = configs.find((config) => isDefaultProviderConfig(config));
  if (!selected) return {};
  const defaultModelId = defaultModelIdFromConfig(selected);
  return {
    defaultProviderConfigId: selected.id,
    defaultProvider: selected.providerId ?? selected.provider,
    ...(defaultModelId ? { defaultModelId } : {})
  };
};

const withDefaultsMetadata = (
  existing: Record<string, unknown> | undefined,
  input: { isDefaultProvider: boolean; defaultModelId?: string }
): Record<string, unknown> => {
  const next = toMetadata(existing);
  delete next[defaultProviderMetadataKey];
  delete next[defaultModelMetadataKey];
  if (input.isDefaultProvider) {
    next[defaultProviderMetadataKey] = true;
    if (input.defaultModelId) {
      next[defaultModelMetadataKey] = input.defaultModelId;
    }
  }
  return next;
};

const enabledFromValidation = (
  requestedEnabled: boolean,
  validationStatus: ProviderConfig["validationStatus"]
): boolean => requestedEnabled && validationStatus === "valid";

const resolveAvailableModelIds = async (
  provider: ProviderName,
  providerConfigId: string
): Promise<string[]> => {
  const persistedModels = (await apiStore.listProviderModels())
    .filter((model) => model.providerConfigId === providerConfigId && model.enabled)
    .map((model) => model.modelId);

  try {
    const registry = createDefaultProviderRegistry();
    const discoveredModels = (await registry.discoverAllModels())
      .filter((model) => model.provider === provider)
      .map((model) => model.modelId);
    return [...new Set([...persistedModels, ...discoveredModels])].sort((left, right) =>
      left.localeCompare(right)
    );
  } catch {
    return [...new Set(persistedModels)].sort((left, right) => left.localeCompare(right));
  }
};

const resolveProviderRateLimitUsage = async (
  tenantId: string,
  provider: ProviderName
): Promise<{ rpmUsed: number; tpmUsed: number }> => {
  const windowStartMs = Date.now() - 60_000;
  const events = await usageService.list({ tenantId, provider });
  return events.reduce(
    (acc, event) => {
      const occurredAt = Date.parse(event.createdAt);
      if (Number.isNaN(occurredAt) || occurredAt < windowStartMs) {
        return acc;
      }
      return {
        rpmUsed: acc.rpmUsed + 1,
        tpmUsed: acc.tpmUsed + Math.max(0, event.inputTokens + event.outputTokens)
      };
    },
    { rpmUsed: 0, tpmUsed: 0 }
  );
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
      const requestedEnabled = request.body?.enabled ?? true;
      const enabled = enabledFromValidation(requestedEnabled, validation.status);

      const created = await apiStore.createProviderConfig({
        id: providerConfigId,
        tenantId: request.tenantId,
        provider,
        providerId: provider,
        ...(request.body?.endpoint ? { endpoint: request.body.endpoint } : {}),
        authRef: credentials.authRef,
        ...(credentials.secretRef ? { secretRef: credentials.secretRef } : {}),
        enabled,
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
          validationStatus: created.validationStatus,
          requestedEnabled,
          enabled
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
      const requestedEnabled = request.body?.enabled ?? current.enabled;
      const enabled = enabledFromValidation(requestedEnabled, validation.status);

      const patch: Partial<ProviderConfig> = {
        ...(provider ? { provider: effectiveProvider, providerId: effectiveProvider } : {}),
        ...(request.body?.endpoint !== undefined ? { endpoint: request.body.endpoint } : {}),
        authRef: credentials.authRef,
        ...(credentials.secretRef ? { secretRef: credentials.secretRef } : {}),
        enabled,
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
            validationStatus: updated.validationStatus,
            requestedEnabled,
            enabled
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

  fastify.post<{ Params: { id: string } }>(
    "/providers/config/:id/test",
    { schema: { tags: ["providers"], summary: "Test provider configuration credentials and endpoint" } },
    async (request, reply) => {
      if (!requireOwnerRole(request, reply)) return;

      const current = (await apiStore.listProviderConfigs()).find((item) => item.id === request.params.id);
      if (!current) {
        return reply.code(404).send({
          error: "not_found",
          message: "Provider config not found for current tenant."
        });
      }

      const provider = current.providerId ?? current.provider;
      const actor = request.authPrincipal?.userId ?? "system";
      const validation = await validateProviderConfig({
        provider,
        tenantId: request.tenantId,
        authRef: current.authRef,
        ...(current.endpoint ? { endpoint: current.endpoint } : {}),
        timeoutMs: current.timeoutMs
      });

      const metadata =
        validation.status === "valid"
          ? current.metadata
          : withDefaultsMetadata(current.metadata, { isDefaultProvider: false });
      const enabled = enabledFromValidation(current.enabled, validation.status);
      const updated = await apiStore.updateProviderConfig(current.id, {
        validationStatus: validation.status,
        lastValidatedAt: validation.lastValidatedAt,
        validationError: validation.error ?? "",
        enabled,
        metadata,
        updatedAt: new Date().toISOString(),
        updatedBy: actor
      });
      resetNormalizedModelDiscoveryCache(request.tenantId);

      const availableModels = await resolveAvailableModelIds(provider, updated.id);
      await auditLogService.record({
        tenantId: request.tenantId,
        userId: actor,
        action: "provider.config.test",
        resourceType: "provider_config",
        resourceId: updated.id,
        status: validation.status === "valid" ? "success" : "failure",
        metadata: {
          validationStatus: validation.status,
          availableModelCount: availableModels.length
        },
        actor
      });
      const usageWindow = await resolveProviderRateLimitUsage(request.tenantId, provider);

      return {
        status: validation.status === "valid" ? "ok" : "error",
        latencyMs: validation.latencyMs ?? 0,
        models: availableModels,
        ...(validation.error ? { error: validation.error } : {}),
        rateLimit: {
          rpm: {
            used: usageWindow.rpmUsed,
            limit: updated.requestsPerMinute ?? null
          },
          tpm: {
            used: usageWindow.tpmUsed,
            limit: updated.tokensPerMinute ?? null
          }
        },
        item: await toProviderConfigResponse(updated),
        // Compatibility alias for existing clients.
        availableModels
      };
    }
  );

  fastify.get(
    "/providers/defaults",
    { schema: { tags: ["providers"], summary: "Get tenant default provider/model selection" } },
    async () => {
      const configs = await apiStore.listProviderConfigs();
      return { item: resolveProviderDefaults(configs) };
    }
  );

  fastify.patch<{ Body: ProviderDefaultsBody }>(
    "/providers/defaults",
    { schema: { tags: ["providers"], summary: "Set tenant default provider/model selection" } },
    async (request, reply) => {
      if (!requireOwnerRole(request, reply)) return;
      const actor = request.authPrincipal?.userId ?? "system";
      const configs = await apiStore.listProviderConfigs();
      const defaultProviderConfigId = request.body?.defaultProviderConfigId?.trim();
      const defaultModelId = request.body?.defaultModelId?.trim();

      if (defaultModelId && !defaultProviderConfigId) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "defaultProviderConfigId is required when defaultModelId is set."
        });
      }

      if (!defaultProviderConfigId) {
        for (const config of configs) {
          if (!isDefaultProviderConfig(config) && !defaultModelIdFromConfig(config)) continue;
          await apiStore.updateProviderConfig(config.id, {
            metadata: withDefaultsMetadata(config.metadata, { isDefaultProvider: false }),
            updatedAt: new Date().toISOString(),
            updatedBy: actor
          });
        }
        return { item: {} };
      }

      const selectedConfig = configs.find((config) => config.id === defaultProviderConfigId);
      if (!selectedConfig) {
        return reply.code(404).send({
          error: "not_found",
          message: "Default provider config not found for current tenant."
        });
      }

      if (!selectedConfig.enabled || selectedConfig.validationStatus !== "valid") {
        return reply.code(400).send({
          error: "invalid_provider",
          message: "Default provider must be enabled and valid."
        });
      }

      const providerModels = (await apiStore.listProviderModels()).filter(
        (model) => model.providerConfigId === selectedConfig.id && model.enabled
      );
      const nextDefaultModelId =
        defaultModelId ??
        defaultModelIdFromConfig(selectedConfig) ??
        providerModels[0]?.modelId;
      if (nextDefaultModelId) {
        const modelExists = providerModels.some((model) => model.modelId === nextDefaultModelId);
        if (!modelExists) {
          return reply.code(400).send({
            error: "invalid_model",
            message: "defaultModelId must belong to the selected default provider and be enabled."
          });
        }
      }

      for (const config of configs) {
        const isDefault = config.id === selectedConfig.id;
        const metadata = withDefaultsMetadata(config.metadata, {
          isDefaultProvider: isDefault,
          ...(isDefault && nextDefaultModelId ? { defaultModelId: nextDefaultModelId } : {})
        });
        if (JSON.stringify(metadata) === JSON.stringify(toMetadata(config.metadata))) continue;
        await apiStore.updateProviderConfig(config.id, {
          metadata,
          updatedAt: new Date().toISOString(),
          updatedBy: actor
        });
      }

      return {
        item: {
          defaultProviderConfigId: selectedConfig.id,
          defaultProvider: selectedConfig.providerId ?? selectedConfig.provider,
          ...(nextDefaultModelId ? { defaultModelId: nextDefaultModelId } : {})
        }
      };
    }
  );

  fastify.get("/providers/capabilities", { schema: { tags: ["providers"], summary: "List provider capabilities" } }, async () => ({
    items: await apiStore.listProviderCapabilities()
  }));

  fastify.get<{ Querystring: { includeDisabled?: string } }>("/providers/models", { schema: { tags: ["providers"], summary: "List provider models" } }, async (request) => {
    const [configs, models] = await Promise.all([apiStore.listProviderConfigs(), apiStore.listProviderModels()]);
    if (parseTruthy(request.query.includeDisabled)) {
      return { items: models };
    }
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
