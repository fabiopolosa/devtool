import { randomUUID } from "node:crypto";
import type { ContextNote } from "@cp/domain";

const normalizeWhitespace = (value: string): string => value.replace(/\r\n/g, "\n").trim();

const normalizePath = (value: string): string => {
  const compact = value.trim().replace(/\/{2,}/g, "/");
  const prefixed = compact.startsWith("/") ? compact : `/${compact}`;
  const segments = prefixed.split("/");
  const last = segments.pop();
  if (!last) return "/context.md";
  if (/\.[a-z0-9]+$/i.test(last)) return prefixed;
  return [...segments, `${last}.md`].join("/");
};

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 1);

const joinCorpus = (note: ContextNote): string =>
  [
    note.path,
    note.title,
    note.content,
    note.tags.join(" "),
    note.linkRefs.join(" ")
  ]
    .join("\n")
    .toLowerCase();

const scoreNote = (queryTokens: string[], note: ContextNote): number => {
  if (queryTokens.length === 0) return 0;
  const haystack = joinCorpus(note);
  let score = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      score += 1;
    }
  }
  const lexical = score / queryTokens.length;
  const titleBoost = queryTokens.some((token) => note.title.toLowerCase().includes(token)) ? 0.15 : 0;
  const pathBoost = queryTokens.some((token) => note.path.toLowerCase().includes(token)) ? 0.1 : 0;
  return Math.min(1, lexical + titleBoost + pathBoost);
};

export interface ContextNoteStore {
  listContextNotes(filters?: { tenantId?: string; projectId?: string; path?: string }): Promise<ContextNote[]>;
  getContextNoteById(contextNoteId: string): Promise<ContextNote | null>;
  findContextNoteByProjectPath(
    tenantId: string,
    projectId: string,
    notePath: string
  ): Promise<ContextNote | null>;
  createContextNote(note: ContextNote): Promise<ContextNote>;
  updateContextNote(contextNoteId: string, patch: Partial<ContextNote>): Promise<ContextNote>;
  deleteContextNote(contextNoteId: string): Promise<void>;
}

export interface CreateContextNoteInput {
  tenantId: string;
  projectId: string;
  path: string;
  title: string;
  content: string;
  tags?: string[];
  linkRefs?: string[];
  pinned?: boolean;
}

export interface UpdateContextNoteInput {
  path?: string;
  title?: string;
  content?: string;
  tags?: string[];
  linkRefs?: string[];
  pinned?: boolean;
}

export interface SearchContextInput {
  tenantId: string;
  projectId: string;
  query: string;
  limit?: number;
}

export interface SearchContextHit {
  item: ContextNote;
  score: number;
  source: "lexical";
}

export interface ContextListResult {
  items: ContextNote[];
  hits?: SearchContextHit[];
}

export interface ContextServiceOptions {
  store: ContextNoteStore;
  now?: () => Date;
  idGenerator?: () => string;
}

export class ContextService {
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  constructor(private readonly options: ContextServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
  }

  async listContextNotes(filters: { tenantId: string; projectId: string; path?: string }): Promise<ContextNote[]> {
    const rows = await this.options.store.listContextNotes(filters);
    return rows.sort((left, right) => {
      if (left.pinned !== right.pinned) {
        return Number(right.pinned) - Number(left.pinned);
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    });
  }

  async getContextNote(contextNoteId: string, tenantId: string, projectId: string): Promise<ContextNote | null> {
    const item = await this.options.store.getContextNoteById(contextNoteId);
    if (!item) return null;
    if (item.tenantId !== tenantId) return null;
    if (item.projectId !== projectId) return null;
    return item;
  }

  async createContextNote(input: CreateContextNoteInput, actor: string): Promise<ContextNote> {
    const path = normalizePath(input.path);
    const existing = await this.options.store.findContextNoteByProjectPath(
      input.tenantId,
      input.projectId,
      path
    );
    if (existing) {
      throw new Error(`Context note already exists for path: ${path}`);
    }

    const nowIso = this.now().toISOString();
    const note: ContextNote = {
      id: this.idGenerator(),
      tenantId: input.tenantId,
      projectId: input.projectId,
      path,
      title: input.title.trim(),
      content: normalizeWhitespace(input.content),
      tags: [...(input.tags ?? [])].map((item) => item.trim()).filter(Boolean),
      linkRefs: [...(input.linkRefs ?? [])].map((item) => item.trim()).filter(Boolean),
      pinned: input.pinned ?? false,
      createdAt: nowIso,
      createdBy: actor,
      updatedAt: nowIso,
      updatedBy: actor
    };
    return this.options.store.createContextNote(note);
  }

  async updateContextNote(
    contextNoteId: string,
    input: UpdateContextNoteInput,
    actor: string,
    tenantId: string,
    projectId: string
  ): Promise<ContextNote> {
    const existing = await this.getContextNote(contextNoteId, tenantId, projectId);
    if (!existing) {
      throw new Error(`Context note not found: ${contextNoteId}`);
    }

    const nextPath = input.path ? normalizePath(input.path) : existing.path;
    if (nextPath !== existing.path) {
      const collision = await this.options.store.findContextNoteByProjectPath(tenantId, projectId, nextPath);
      if (collision && collision.id !== existing.id) {
        throw new Error(`Context note already exists for path: ${nextPath}`);
      }
    }

    return this.options.store.updateContextNote(contextNoteId, {
      ...(input.path ? { path: nextPath } : {}),
      ...(input.title ? { title: input.title.trim() } : {}),
      ...(input.content ? { content: normalizeWhitespace(input.content) } : {}),
      ...(input.tags ? { tags: input.tags.map((item) => item.trim()).filter(Boolean) } : {}),
      ...(input.linkRefs ? { linkRefs: input.linkRefs.map((item) => item.trim()).filter(Boolean) } : {}),
      ...(typeof input.pinned === "boolean" ? { pinned: input.pinned } : {}),
      updatedAt: this.now().toISOString(),
      updatedBy: actor
    });
  }

  async deleteContextNote(contextNoteId: string, tenantId: string, projectId: string): Promise<void> {
    const existing = await this.getContextNote(contextNoteId, tenantId, projectId);
    if (!existing) {
      throw new Error(`Context note not found: ${contextNoteId}`);
    }
    await this.options.store.deleteContextNote(contextNoteId);
  }

  async searchContextNotes(input: SearchContextInput): Promise<SearchContextHit[]> {
    const query = input.query.trim();
    if (!query) return [];
    const limit = Math.max(1, input.limit ?? 8);
    const queryTokens = tokenize(query);
    const rows = await this.options.store.listContextNotes({
      tenantId: input.tenantId,
      projectId: input.projectId
    });
    return rows
      .map((item) => ({ item, score: scoreNote(queryTokens, item), source: "lexical" as const }))
      .filter((hit) => hit.score > 0)
      .sort((left, right) => right.score - left.score || Number(right.item.pinned) - Number(left.item.pinned) || right.item.updatedAt.localeCompare(left.item.updatedAt))
      .slice(0, limit);
  }

  async listOrSearch(input: {
    tenantId: string;
    projectId: string;
    path?: string;
    query?: string;
    limit?: number;
  }): Promise<ContextListResult> {
    if (input.query && input.query.trim()) {
      const hits = await this.searchContextNotes({
        tenantId: input.tenantId,
        projectId: input.projectId,
        query: input.query,
        ...(input.limit ? { limit: input.limit } : {})
      });
      return { items: hits.map((hit) => hit.item), hits };
    }

    const items = await this.listContextNotes({
      tenantId: input.tenantId,
      projectId: input.projectId,
      ...(input.path ? { path: normalizePath(input.path) } : {})
    });
    return { items };
  }
}

export const normalizeContextNotePath = normalizePath;
