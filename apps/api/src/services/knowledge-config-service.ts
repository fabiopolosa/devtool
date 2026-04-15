import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  createKnowledgeConfigSchema,
  updateKnowledgeConfigSchema,
  type CreateKnowledgeConfigSchema,
  type KnowledgeConfig,
  type KnowledgeScope
} from "@cp/domain";
import { apiStore } from "./api-store.js";

type KnowledgeConfigSource = "project" | "tenant" | "system" | "default";

const defaultPolicy: Pick<
  KnowledgeConfig,
  "autoCapture" | "captureModes" | "requireApproval" | "maxNodes" | "relevanceThreshold" | "versioning" | "requireReview"
> = {
  autoCapture: false,
  captureModes: ["generation_output"],
  requireApproval: false,
  maxNodes: 8,
  relevanceThreshold: 0.2,
  versioning: true,
  requireReview: false
};

const nowIso = (): string => new Date().toISOString();

const normalizeScope = (scope: KnowledgeScope, projectId?: string): { scope: KnowledgeScope; projectId?: string } => {
  if (scope === "project") {
    if (!projectId) {
      throw new Error("projectId is required when scope is project");
    }
    return { scope, projectId };
  }
  return { scope };
};

const defaultKnowledgeConfig = (
  tenantId: string,
  scope: KnowledgeScope,
  projectId?: string
): KnowledgeConfig => {
  const normalized = normalizeScope(scope, projectId);
  const timestamp = nowIso();
  return {
    id: `knowledge_cfg_default_${tenantId}_${scope}_${normalized.projectId ?? "global"}`,
    tenantId,
    ...(normalized.projectId ? { projectId: normalized.projectId } : {}),
    scope: normalized.scope,
    ...defaultPolicy,
    createdAt: timestamp,
    createdBy: "system",
    updatedAt: timestamp,
    updatedBy: "system"
  };
};

const findScopeConfig = (
  items: KnowledgeConfig[],
  scope: KnowledgeScope,
  projectId?: string
): KnowledgeConfig | undefined => {
  if (scope === "project") {
    return items.find((item) => item.scope === "project" && item.projectId === projectId);
  }
  return items.find((item) => item.scope === scope && !item.projectId);
};

const toPatchPayload = (parsed: Record<string, unknown>): Partial<KnowledgeConfig> => {
  const patch: Partial<KnowledgeConfig> = {};
  if (typeof parsed.autoCapture === "boolean") patch.autoCapture = parsed.autoCapture;
  if (Array.isArray(parsed.captureModes)) patch.captureModes = parsed.captureModes.filter((item): item is string => typeof item === "string");
  if (typeof parsed.requireApproval === "boolean") patch.requireApproval = parsed.requireApproval;
  if (typeof parsed.maxNodes === "number") patch.maxNodes = parsed.maxNodes;
  if (typeof parsed.relevanceThreshold === "number") patch.relevanceThreshold = parsed.relevanceThreshold;
  if (typeof parsed.versioning === "boolean") patch.versioning = parsed.versioning;
  if (typeof parsed.requireReview === "boolean") patch.requireReview = parsed.requireReview;
  return patch;
};

const patchKnowledgeConfigBodySchema = z
  .object({
    id: z.string().min(1).optional()
  })
  .and(updateKnowledgeConfigSchema);

export const listKnowledgeConfigs = async (
  tenantId: string,
  projectId?: string
): Promise<KnowledgeConfig[]> => {
  if (typeof apiStore.listKnowledgeConfigs !== "function") {
    return [];
  }
  const rows = await apiStore.listKnowledgeConfigs();
  return rows
    .filter((item) => {
      if (item.tenantId !== tenantId) return false;
      if (!projectId) return true;
      return !item.projectId || item.projectId === projectId;
    })
    .sort((left, right) => {
      if (left.scope !== right.scope) return left.scope.localeCompare(right.scope);
      return (left.projectId ?? "").localeCompare(right.projectId ?? "");
    });
};

export const resolveEffectiveKnowledgeConfig = async (input: {
  tenantId: string;
  projectId?: string;
  scope?: KnowledgeScope;
}): Promise<{ item: KnowledgeConfig; source: KnowledgeConfigSource }> => {
  const items = await listKnowledgeConfigs(input.tenantId, input.projectId);

  if (input.scope) {
    const normalized = normalizeScope(input.scope, input.projectId);
    const exact = findScopeConfig(items, normalized.scope, normalized.projectId);
    if (exact) return { item: exact, source: input.scope };
    return { item: defaultKnowledgeConfig(input.tenantId, normalized.scope, normalized.projectId), source: "default" };
  }

  if (input.projectId) {
    const projectConfig = findScopeConfig(items, "project", input.projectId);
    if (projectConfig) return { item: projectConfig, source: "project" };
  }

  const tenantConfig = findScopeConfig(items, "tenant");
  if (tenantConfig) return { item: tenantConfig, source: "tenant" };

  const systemConfig = findScopeConfig(items, "system");
  if (systemConfig) return { item: systemConfig, source: "system" };

  return { item: defaultKnowledgeConfig(input.tenantId, "tenant"), source: "default" };
};

export const createKnowledgeConfig = async (
  raw: unknown,
  actor: string,
  tenantId: string
): Promise<KnowledgeConfig> => {
  const payload = (raw && typeof raw === "object"
    ? { ...(raw as Record<string, unknown>) }
    : {}) as Record<string, unknown>;
  const parsed = createKnowledgeConfigSchema.parse({
    ...payload,
    tenantId
  }) as CreateKnowledgeConfigSchema;
  const normalized = normalizeScope(parsed.scope, parsed.projectId);
  const existing = (await listKnowledgeConfigs(tenantId, normalized.projectId)).find((item) =>
    normalized.scope === "project"
      ? item.scope === "project" && item.projectId === normalized.projectId
      : item.scope === normalized.scope && !item.projectId
  );
  if (existing) {
    throw new Error(`Knowledge config already exists for ${normalized.scope}${normalized.projectId ? `:${normalized.projectId}` : ""}`);
  }

  const timestamp = nowIso();
  return apiStore.createKnowledgeConfig({
    id: randomUUID(),
    tenantId,
    ...(normalized.projectId ? { projectId: normalized.projectId } : {}),
    scope: normalized.scope,
    autoCapture: parsed.autoCapture,
    captureModes: parsed.captureModes,
    requireApproval: parsed.requireApproval,
    maxNodes: parsed.maxNodes,
    relevanceThreshold: parsed.relevanceThreshold,
    versioning: parsed.versioning,
    requireReview: parsed.requireReview,
    createdAt: timestamp,
    createdBy: actor,
    updatedAt: timestamp,
    updatedBy: actor
  });
};

export const patchKnowledgeConfig = async (input: {
  raw: unknown;
  actor: string;
  tenantId: string;
  projectId?: string;
}): Promise<{ item: KnowledgeConfig; created: boolean }> => {
  const parsed = patchKnowledgeConfigBodySchema.parse(input.raw) as Record<string, unknown>;
  const patch = toPatchPayload(parsed);

  let target: KnowledgeConfig | null = null;
  let created = false;
  if (typeof parsed.id === "string") {
    const row = await apiStore.getKnowledgeConfig(parsed.id);
    if (!row || row.tenantId !== input.tenantId) {
      throw new Error("Knowledge config not found");
    }
    target = row;
  } else {
    const scopeValue =
      parsed.scope === "project" || parsed.scope === "tenant" || parsed.scope === "system"
        ? parsed.scope
        : (input.projectId ? "project" : "tenant");
    const projectIdValue =
      typeof parsed.projectId === "string"
        ? parsed.projectId
        : scopeValue === "project"
          ? input.projectId
          : undefined;
    const normalized = normalizeScope(scopeValue, projectIdValue);
    target =
      findScopeConfig(await listKnowledgeConfigs(input.tenantId, normalized.projectId), normalized.scope, normalized.projectId) ??
      null;
    if (!target) {
      const createdConfig = await createKnowledgeConfig(
        {
          ...defaultPolicy,
          scope: normalized.scope,
          ...(normalized.projectId ? { projectId: normalized.projectId } : {})
        },
        input.actor,
        input.tenantId
      );
      target = createdConfig;
      created = true;
    }
  }

  const updated = await apiStore.updateKnowledgeConfig(target.id, {
    ...patch,
    updatedAt: nowIso(),
    updatedBy: input.actor
  });
  return { item: updated, created };
};
