import { randomUUID } from "node:crypto";
import {
  type PromptRegistryEntry,
  promptRegistryCreateSchema,
  promptRegistryUpdateSchema
} from "@cp/domain";
import { apiStore } from "./api-store.js";

export interface PromptRegistryListInput {
  tenantId: string;
  projectId?: string;
  scope?: PromptRegistryEntry["scope"];
  type?: string;
  target?: string;
  status?: PromptRegistryEntry["status"];
}

export interface PromptRegistryCreateInput {
  tenantId?: string;
  projectId?: string;
  type: string;
  scope: PromptRegistryEntry["scope"];
  target: string;
  version: string;
  content: string;
  status?: PromptRegistryEntry["status"];
  metadata?: Record<string, unknown>;
}

export interface PromptRegistryUpdateInput {
  tenantId?: string;
  projectId?: string;
  type?: string;
  scope?: PromptRegistryEntry["scope"];
  target?: string;
  version?: string;
  content?: string;
  status?: PromptRegistryEntry["status"];
  metadata?: Record<string, unknown>;
}

const nowIso = (): string => new Date().toISOString();

const normalizeText = (value: string): string => value.trim();

const isVisiblePrompt = (
  item: PromptRegistryEntry,
  tenantId: string,
  projectId?: string
): boolean => {
  if (item.scope === "system") return true;
  if (item.scope === "tenant") {
    return item.tenantId === tenantId;
  }
  if (item.scope === "project") {
    if (!projectId) return item.tenantId === tenantId;
    return item.tenantId === tenantId && item.projectId === projectId;
  }
  return false;
};

const applyScopeContext = (
  record: PromptRegistryCreateInput | PromptRegistryUpdateInput
): Pick<PromptRegistryEntry, "tenantId" | "projectId"> => {
  if (record.scope === "system") {
    return {};
  }
  if (record.scope === "tenant") {
    if (!record.tenantId) {
      throw new Error("tenantId is required for tenant-scoped prompts");
    }
    return { tenantId: record.tenantId };
  }
  if (!record.tenantId) {
    throw new Error("tenantId is required for project-scoped prompts");
  }
  if (!record.projectId) {
    throw new Error("projectId is required for project-scoped prompts");
  }
  return {
    tenantId: record.tenantId,
    projectId: record.projectId
  };
};

const ensureActivatedExclusive = async (item: PromptRegistryEntry, actor: string): Promise<void> => {
  const siblings = await apiStore.listPromptRegistry({
    ...(item.scope ? { scope: item.scope } : {}),
    ...(item.type ? { type: item.type } : {}),
    ...(item.target ? { target: item.target } : {}),
    ...(item.tenantId ? { tenantId: item.tenantId } : {}),
    ...(item.projectId ? { projectId: item.projectId } : {})
  });

  await Promise.all(
    siblings
      .filter((sibling) => sibling.id !== item.id && sibling.status === "active")
      .map((sibling) =>
        apiStore.updatePromptRegistry(sibling.id, {
          status: "deprecated",
          updatedAt: item.updatedAt,
          updatedBy: actor
        })
      )
  );
}

export const promptRegistryService = {
  async listPrompts(input: PromptRegistryListInput): Promise<PromptRegistryEntry[]> {
    const rows = await apiStore.listPromptRegistry({
      ...(input.scope ? { scope: input.scope } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.target ? { target: input.target } : {}),
      ...(input.status ? { status: input.status } : {})
    });
    return rows
      .filter((item) => isVisiblePrompt(item, input.tenantId, input.projectId))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  },

  async getPrompt(promptId: string, tenantId: string, projectId?: string): Promise<PromptRegistryEntry | null> {
    const item = await apiStore.getPromptRegistry(promptId);
    if (!item) return null;
    if (!isVisiblePrompt(item, tenantId, projectId)) return null;
    return item;
  },

  async createPrompt(input: PromptRegistryCreateInput, actor: string): Promise<PromptRegistryEntry> {
    const scopeContext = applyScopeContext(input);
    const now = nowIso();
    const parsed = promptRegistryCreateSchema.parse({
      type: normalizeText(input.type),
      scope: input.scope,
      target: normalizeText(input.target),
      version: normalizeText(input.version),
      content: normalizeText(input.content),
      status: input.status ?? "draft",
      ...(scopeContext.tenantId ? { tenantId: scopeContext.tenantId } : {}),
      ...(scopeContext.projectId ? { projectId: scopeContext.projectId } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {})
    });
    const created = await apiStore.createPromptRegistry({
      id: randomUUID(),
      type: parsed.type,
      scope: parsed.scope,
      target: parsed.target,
      version: parsed.version,
      content: parsed.content,
      status: parsed.status,
      ...(parsed.tenantId ? { tenantId: parsed.tenantId } : {}),
      ...(parsed.projectId ? { projectId: parsed.projectId } : {}),
      ...(parsed.metadata ? { metadata: parsed.metadata } : {}),
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor
    });
    if (created.status === "active") {
      await ensureActivatedExclusive(created, actor);
    }
    return created;
  },

  async updatePrompt(promptId: string, input: PromptRegistryUpdateInput, actor: string): Promise<PromptRegistryEntry> {
    const existing = await apiStore.getPromptRegistry(promptId);
    if (!existing) {
      throw new Error(`Prompt registry entry not found: ${promptId}`);
    }

    const scope = input.scope ?? existing.scope;
    const scopeContext = applyScopeContext({
      scope,
      ...(input.tenantId ?? existing.tenantId ? { tenantId: input.tenantId ?? existing.tenantId } : {}),
      ...(input.projectId ?? existing.projectId ? { projectId: input.projectId ?? existing.projectId } : {})
    });

    const parsed = promptRegistryUpdateSchema.parse({
      ...(input.type !== undefined ? { type: normalizeText(input.type) } : {}),
      scope,
      ...(input.target !== undefined ? { target: normalizeText(input.target) } : {}),
      ...(input.version !== undefined ? { version: normalizeText(input.version) } : {}),
      ...(input.content !== undefined ? { content: normalizeText(input.content) } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      ...(scopeContext.tenantId ? { tenantId: scopeContext.tenantId } : {}),
      ...(scopeContext.projectId ? { projectId: scopeContext.projectId } : {})
    });

    const updated = await apiStore.updatePromptRegistry(promptId, {
      ...(parsed.type !== undefined ? { type: parsed.type } : {}),
      ...(parsed.scope !== undefined ? { scope: parsed.scope } : {}),
      ...(parsed.target !== undefined ? { target: parsed.target } : {}),
      ...(parsed.version !== undefined ? { version: parsed.version } : {}),
      ...(parsed.content !== undefined ? { content: parsed.content } : {}),
      ...(parsed.status !== undefined ? { status: parsed.status } : {}),
      ...(parsed.tenantId !== undefined ? { tenantId: parsed.tenantId } : {}),
      ...(parsed.projectId !== undefined ? { projectId: parsed.projectId } : {}),
      ...(parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}),
      updatedAt: nowIso(),
      updatedBy: actor
    });

    if (updated.status === "active") {
      await ensureActivatedExclusive(updated, actor);
    }
    return updated;
  },

  async activatePrompt(promptId: string, actor: string): Promise<PromptRegistryEntry> {
    const existing = await apiStore.getPromptRegistry(promptId);
    if (!existing) {
      throw new Error(`Prompt registry entry not found: ${promptId}`);
    }
    const updated = await apiStore.updatePromptRegistry(promptId, {
      status: "active",
      updatedAt: nowIso(),
      updatedBy: actor
    });
    await ensureActivatedExclusive(updated, actor);
    return updated;
  },

  async deprecatePrompt(promptId: string, actor: string): Promise<PromptRegistryEntry> {
    const existing = await apiStore.getPromptRegistry(promptId);
    if (!existing) {
      throw new Error(`Prompt registry entry not found: ${promptId}`);
    }
    return apiStore.updatePromptRegistry(promptId, {
      status: "deprecated",
      updatedAt: nowIso(),
      updatedBy: actor
    });
  },

  async resolveActivePrompt(
    input: {
      tenantId: string;
      projectId?: string;
      scope?: PromptRegistryEntry["scope"];
      type?: string;
      target?: string;
    }
  ): Promise<PromptRegistryEntry | null> {
    const candidates = await this.listPrompts({
      tenantId: input.tenantId,
      ...(input.scope ? { scope: input.scope } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.target ? { target: input.target } : {}),
      status: "active"
    });
    const scoped = candidates
      .filter((item) => isVisiblePrompt(item, input.tenantId, input.projectId))
      .filter((item) => (input.projectId ? true : item.scope !== "project"))
      .sort((left, right) => {
        const rank = (item: PromptRegistryEntry): number => {
          if (input.projectId && item.scope === "project" && item.projectId === input.projectId) return 0;
          if (item.scope === "tenant" && item.tenantId === input.tenantId) return 1;
          if (item.scope === "system") return 2;
          return 99;
        };
        const byScope = rank(left) - rank(right);
        if (byScope !== 0) return byScope;
        return right.updatedAt.localeCompare(left.updatedAt);
      });
    return scoped[0] ?? null;
  }
};
