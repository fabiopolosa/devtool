import {
  createKnowledgeNodeSchema,
  type ContextNote,
  type CreateKnowledgeNodeSchema,
  type KnowledgeNode,
  type KnowledgeScope,
  type UpdateKnowledgeNodeSchema,
  updateKnowledgeNodeSchema
} from "@cp/domain";
import {
  KnowledgeService,
  type CompactKnowledgeContextEntry,
  type CompactKnowledgeContextNote,
  type CreateKnowledgeNodeInput,
  type SearchKnowledgeInput,
  type UpdateKnowledgeNodeInput
} from "@cp/knowledge";
import { apiStore } from "./api-store.js";
import { resolveEffectiveKnowledgeConfig } from "./knowledge-config-service.js";

const nowIso = (): string => new Date().toISOString();

const knowledgeService = new KnowledgeService({
  store: {
    listKnowledgeNodes: async (filters) =>
      typeof apiStore.listKnowledgeNodes === "function" ? apiStore.listKnowledgeNodes(filters) : [],
    getKnowledgeNodeById: async (knowledgeNodeId) =>
      typeof apiStore.getKnowledgeNode === "function" ? apiStore.getKnowledgeNode(knowledgeNodeId) : null,
    findKnowledgeNodeByScopePath: async (scope, nodePath) =>
      typeof apiStore.findKnowledgeNodeByScopePath === "function"
        ? apiStore.findKnowledgeNodeByScopePath(scope, nodePath)
        : null,
    createKnowledgeNode: async (node) =>
      typeof apiStore.createKnowledgeNode === "function" ? apiStore.createKnowledgeNode(node) : node,
    updateKnowledgeNode: async (knowledgeNodeId, patch) =>
      typeof apiStore.updateKnowledgeNode === "function"
        ? apiStore.updateKnowledgeNode(knowledgeNodeId, patch)
        : ({ id: knowledgeNodeId, ...patch } as never),
    deleteKnowledgeNode: async (knowledgeNodeId) => {
      if (typeof apiStore.deleteKnowledgeNode === "function") {
        await apiStore.deleteKnowledgeNode(knowledgeNodeId);
      }
    }
  }
});

const normalizePathFilter = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
};

const asScope = (value: string | undefined): KnowledgeScope | undefined => {
  if (!value) return undefined;
  if (value === "system" || value === "tenant" || value === "project") return value;
  return undefined;
};

const isVisibleNode = (item: KnowledgeNode, tenantId: string, projectId?: string): boolean => {
  if (item.scope === "system") return true;
  if (item.scope === "tenant") return item.tenantId === tenantId;
  if (item.scope === "project") {
    if (!projectId) return item.tenantId === tenantId;
    return item.tenantId === tenantId && item.projectId === projectId;
  }
  return false;
};

const visibleComparator = (left: KnowledgeNode, right: KnowledgeNode): number =>
  right.updatedAt.localeCompare(left.updatedAt);

const normalizeCompactContextEntries = (
  entries: CompactKnowledgeContextEntry[]
): CompactKnowledgeContextEntry[] =>
  entries.map((entry) => ({
    ...entry,
    excerpt: entry.excerpt.trim()
  }));

export interface ListKnowledgeInput {
  tenantId: string;
  projectId?: string;
  scope?: string;
  path?: string;
  query?: string;
  limit?: number;
}

export interface KnowledgeSearchHit {
  item: KnowledgeNode;
  score: number;
  source: "semantic" | "lexical";
}

export interface KnowledgeListResult {
  items: KnowledgeNode[];
  hits?: KnowledgeSearchHit[];
}

export const listKnowledge = async (input: ListKnowledgeInput): Promise<KnowledgeListResult> => {
  const normalizedScope = asScope(input.scope);
  if (normalizedScope) {
    const pathFilter = normalizePathFilter(input.path);
    const directFilters: {
      scope: KnowledgeScope;
      tenantId?: string;
      projectId?: string;
      path?: string;
    } = { scope: normalizedScope };
    if (normalizedScope === "tenant" || normalizedScope === "project") {
      directFilters.tenantId = input.tenantId;
    }
    if (normalizedScope === "project" && input.projectId) {
      directFilters.projectId = input.projectId;
    }
    if (pathFilter) {
      directFilters.path = pathFilter;
    }
    const directRows = await knowledgeService.listKnowledge(directFilters);
    const visibleItems = directRows
      .filter((item) => isVisibleNode(item, input.tenantId, input.projectId))
      .sort(visibleComparator);
    return { items: visibleItems };
  }

  const query = input.query?.trim();
  if (query) {
    const searchInput: SearchKnowledgeInput = {
      tenantId: input.tenantId,
      query
    };
    if (input.projectId) {
      searchInput.projectId = input.projectId;
    }
    if (typeof input.limit === "number") {
      searchInput.limit = input.limit;
    }
    const hits = await knowledgeService.searchKnowledge(searchInput);
    return {
      items: hits.map((hit) => hit.item),
      hits
    };
  }

  const all = await knowledgeService.listKnowledge();
  const visible = all
    .filter((item) => isVisibleNode(item, input.tenantId, input.projectId))
    .filter((item) => {
      const pathFilter = normalizePathFilter(input.path);
      return pathFilter ? item.path.includes(pathFilter) : true;
    })
    .sort(visibleComparator);
  return { items: visible };
};

export const getKnowledgeNode = async (
  knowledgeNodeId: string,
  tenantId: string,
  projectId?: string
): Promise<KnowledgeNode | null> => {
  const item = await knowledgeService.getKnowledgeNode(knowledgeNodeId);
  if (!item) return null;
  if (!isVisibleNode(item, tenantId, projectId)) return null;
  return item;
};

const normalizeCreateInput = (
  input: CreateKnowledgeNodeSchema,
  tenantId: string
): CreateKnowledgeNodeInput => {
  if (input.scope === "system") {
    const normalized: CreateKnowledgeNodeInput = {
      scope: "system",
      path: input.path,
      content: input.content
    };
    if (Array.isArray(input.embedding)) {
      normalized.embedding = input.embedding;
    }
    return normalized;
  }
  if (input.scope === "tenant") {
    const normalized: CreateKnowledgeNodeInput = {
      scope: "tenant",
      path: input.path,
      content: input.content,
      tenantId
    };
    if (Array.isArray(input.embedding)) {
      normalized.embedding = input.embedding;
    }
    return normalized;
  }
  const normalized: CreateKnowledgeNodeInput = {
    scope: "project",
    path: input.path,
    content: input.content,
    tenantId
  };
  if (input.projectId) {
    normalized.projectId = input.projectId;
  }
  if (Array.isArray(input.embedding)) {
    normalized.embedding = input.embedding;
  }
  return normalized;
};

export const createKnowledgeNode = async (
  raw: unknown,
  actor: string,
  tenantId: string
): Promise<KnowledgeNode> => {
  const parsed = createKnowledgeNodeSchema.parse(raw);
  const normalized = normalizeCreateInput(parsed, tenantId);
  return knowledgeService.createKnowledgeNode(normalized, actor);
};

export const updateKnowledgeNode = async (
  knowledgeNodeId: string,
  raw: unknown,
  actor: string,
  tenantId: string,
  projectId?: string
): Promise<KnowledgeNode> => {
  const existing = await getKnowledgeNode(knowledgeNodeId, tenantId, projectId);
  if (!existing) {
    throw new Error("Knowledge node not found");
  }
  const parsed = updateKnowledgeNodeSchema.parse(raw) as UpdateKnowledgeNodeSchema;
  const patch: UpdateKnowledgeNodeInput = {};
  if (typeof parsed.path === "string") {
    patch.path = parsed.path;
  }
  if (typeof parsed.content === "string") {
    patch.content = parsed.content;
  }
  if (Array.isArray(parsed.embedding)) {
    patch.embedding = parsed.embedding;
  }
  return knowledgeService.updateKnowledgeNode(knowledgeNodeId, patch, actor);
};

export const deleteKnowledgeNode = async (
  knowledgeNodeId: string,
  tenantId: string,
  projectId?: string
): Promise<void> => {
  const existing = await getKnowledgeNode(knowledgeNodeId, tenantId, projectId);
  if (!existing) {
    throw new Error("Knowledge node not found");
  }
  await knowledgeService.deleteKnowledgeNode(knowledgeNodeId);
};

export const syncKnowledgeFromFilesystem = async (actor = "knowledge_sync"): Promise<{
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
  syncedAt: string;
}> => {
  const result = await knowledgeService.syncFilesystem(actor);
  return {
    ...result,
    syncedAt: nowIso()
  };
};

export const buildKnowledgeContext = async (input: {
  tenantId: string;
  projectId?: string;
  query: string;
  limit?: number;
  threshold?: number;
}) => buildCompactKnowledgeContext(input);

export const buildCompactKnowledgeContext = async (input: {
  tenantId: string;
  projectId?: string;
  query: string;
  limit?: number;
  threshold?: number;
  includeContextNotes?: boolean;
}) => {
  const effectiveConfig = await resolveEffectiveKnowledgeConfig({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {})
  });
  const contextInput: {
    tenantId: string;
    projectId?: string;
    query: string;
    limit?: number;
    threshold?: number;
    contextNotes?: CompactKnowledgeContextNote[];
    includeContextNotes?: boolean;
    contextNotesLimit?: number;
  } = {
    tenantId: input.tenantId,
    query: input.query
  };
  if (input.projectId) {
    contextInput.projectId = input.projectId;
  }
  const resolvedLimit = typeof input.limit === "number" ? input.limit : effectiveConfig.item.maxNodes;
  if (typeof resolvedLimit === "number") {
    contextInput.limit = resolvedLimit;
  }
  const resolvedThreshold =
    typeof input.threshold === "number" ? input.threshold : effectiveConfig.item.relevanceThreshold;
  if (typeof resolvedThreshold === "number") {
    contextInput.threshold = resolvedThreshold;
  }
  const includeContextNotes = input.includeContextNotes ?? true;
  if (includeContextNotes && input.projectId) {
    if (typeof apiStore.listContextNotes === "function") {
      const notes = await apiStore.listContextNotes({
        tenantId: input.tenantId,
        projectId: input.projectId
      });
      if (notes.length > 0) {
        contextInput.contextNotes = notes.map((note) => toCompactKnowledgeContextNote(note));
        contextInput.includeContextNotes = true;
        contextInput.contextNotesLimit = Math.max(1, Math.min(4, effectiveConfig.item.maxNodes));
      }
    }
  }
  const entries = await knowledgeService.buildGenerationKnowledgeContext(contextInput);
  return normalizeCompactContextEntries(entries);
};

export const formatCompactKnowledgeContext = (entries: CompactKnowledgeContextEntry[]): string =>
  knowledgeService.formatCompactContext(entries);

const toCompactKnowledgeContextNote = (note: ContextNote): CompactKnowledgeContextNote => ({
  id: note.id,
  path: note.path,
  title: note.title,
  content: note.content
});
