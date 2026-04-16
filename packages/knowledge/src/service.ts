import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ContextNote, EmbeddingProvider, KnowledgeNode, KnowledgeScope, ProviderRequestContext } from "@cp/domain";

const markdownExtension = /\.md$/i;

const normalizeToPosixPath = (value: string): string => value.split(path.sep).join("/");

const normalizeKnowledgePath = (value: string): string => {
  const normalized = normalizeToPosixPath(value).replace(/\/{2,}/g, "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
};

const safeTrim = (value: string): string => value.replace(/\r\n/g, "\n").trim();

const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 1);

const lexicalScore = (queryTokens: string[], candidate: KnowledgeNode): number => {
  if (queryTokens.length === 0) return 0;
  const haystack = `${candidate.path}\n${candidate.content}`.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      score += 1;
    }
  }
  return score / queryTokens.length;
};

const lexicalTextScore = (queryTokens: string[], haystack: string): number => {
  if (queryTokens.length === 0) return 0;
  const normalizedHaystack = haystack.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (normalizedHaystack.includes(token)) {
      score += 1;
    }
  }
  return score / queryTokens.length;
};

const cosineSimilarity = (left: number[], right: number[]): number => {
  const size = Math.min(left.length, right.length);
  if (size === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < size; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    dot += l * r;
    leftNorm += l * l;
    rightNorm += r * r;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
};

const parseScopeFromPath = (
  normalizedPath: string
): { scope: KnowledgeScope; tenantId?: string; projectId?: string } | null => {
  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  if (segments[0] === "system") {
    return { scope: "system" };
  }
  if (segments[0] === "tenants" && segments[1]) {
    return { scope: "tenant", tenantId: segments[1] };
  }
  if (segments[0] === "projects" && segments[1]) {
    return { scope: "project", projectId: segments[1] };
  }
  return null;
};

const resolveDefaultKnowledgeRoot = (): string => {
  const fromCwd = path.resolve(process.cwd(), "knowledge");
  if (existsSync(fromCwd)) return fromCwd;

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "../../../knowledge"),
    path.resolve(moduleDir, "../../../../knowledge")
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return fromCwd;
};

const firstHeadingFromMarkdown = (content: string): string | undefined => {
  const lines = content.split("\n");
  const heading = lines.find((line) => line.trim().startsWith("# "));
  if (!heading) return undefined;
  return heading.replace(/^#\s+/, "").trim();
};

const inferTitleFromPath = (nodePath: string): string =>
  nodePath
    .split("/")
    .filter(Boolean)
    .pop()
    ?.replace(markdownExtension, "")
    .replace(/[-_]+/g, " ")
    .trim() ?? "knowledge-node";

export interface KnowledgeNodeStore {
  listKnowledgeNodes(filters?: {
    tenantId?: string;
    projectId?: string;
    scope?: KnowledgeScope;
    path?: string;
  }): Promise<KnowledgeNode[]>;
  getKnowledgeNodeById(knowledgeNodeId: string): Promise<KnowledgeNode | null>;
  findKnowledgeNodeByScopePath(scope: KnowledgeScope, nodePath: string): Promise<KnowledgeNode | null>;
  createKnowledgeNode(node: KnowledgeNode): Promise<KnowledgeNode>;
  updateKnowledgeNode(knowledgeNodeId: string, patch: Partial<KnowledgeNode>): Promise<KnowledgeNode>;
  deleteKnowledgeNode(knowledgeNodeId: string): Promise<void>;
}

export interface KnowledgeSemanticStore {
  searchKnowledge(input: {
    tenantId: string;
    projectId?: string;
    queryEmbedding: number[];
    limit: number;
    threshold: number;
  }): Promise<{ available: boolean; hits: SearchKnowledgeResult[] }>;
  upsertKnowledgeEmbedding?(nodeId: string, embedding: number[]): Promise<boolean>;
}

export interface SearchKnowledgeInput {
  tenantId: string;
  projectId?: string;
  query: string;
  limit?: number;
  threshold?: number;
}

export interface SearchKnowledgeResult {
  item: KnowledgeNode;
  score: number;
  source: "semantic" | "lexical";
}

export type CompactKnowledgeContextNote = Pick<ContextNote, "id" | "path" | "title" | "content"> & {
  score?: number;
};

export interface CompactKnowledgeContextEntry {
  path: string;
  title: string;
  scope: KnowledgeScope | "context-notes";
  excerpt: string;
  score: number;
  sourceType: "knowledge-node" | "context-note";
  noteId?: string;
}

export interface KnowledgeRetrievalPolicy {
  limit: number;
  threshold: number;
  includeContextNotes: boolean;
  contextNotesLimit: number;
}

export interface CreateKnowledgeNodeInput {
  tenantId?: string;
  projectId?: string;
  scope: KnowledgeScope;
  path: string;
  content: string;
  embedding?: number[];
}

export interface UpdateKnowledgeNodeInput {
  path?: string;
  content?: string;
  embedding?: number[];
}

export interface FilesystemKnowledgeNodeDraft {
  scope: KnowledgeScope;
  path: string;
  content: string;
  tenantId?: string;
  projectId?: string;
}

export interface KnowledgeSyncResult {
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
}

export interface KnowledgeServiceOptions {
  store: KnowledgeNodeStore;
  embeddingProvider?: EmbeddingProvider;
  semanticStore?: KnowledgeSemanticStore;
  knowledgeRootDir?: string;
  now?: () => Date;
  idGenerator?: () => string;
}

export class KnowledgeService {
  private readonly now: () => Date;
  private readonly idGenerator: () => string;
  private readonly knowledgeRootDir: string;

  constructor(private readonly options: KnowledgeServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
    this.knowledgeRootDir = options.knowledgeRootDir ?? resolveDefaultKnowledgeRoot();
  }

  async listKnowledge(filters?: {
    tenantId?: string;
    projectId?: string;
    scope?: KnowledgeScope;
    path?: string;
  }): Promise<KnowledgeNode[]> {
    const rows = await this.options.store.listKnowledgeNodes(filters);
    return rows.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getKnowledgeNode(nodeId: string): Promise<KnowledgeNode | null> {
    return this.options.store.getKnowledgeNodeById(nodeId);
  }

  async createKnowledgeNode(input: CreateKnowledgeNodeInput, actor: string): Promise<KnowledgeNode> {
    this.assertScopeIntegrity(input.scope, input.tenantId, input.projectId);
    const nowIso = this.now().toISOString();
    const nodePath = normalizeKnowledgePath(input.path.trim());
    const existing = await this.options.store.findKnowledgeNodeByScopePath(input.scope, nodePath);
    if (existing) {
      throw new Error(`Knowledge node already exists for scope/path: ${input.scope}:${nodePath}`);
    }

    const node: KnowledgeNode = {
      id: this.idGenerator(),
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      scope: input.scope,
      path: nodePath,
      content: safeTrim(input.content),
      ...(Array.isArray(input.embedding) ? { embedding: input.embedding } : {}),
      createdAt: nowIso,
      createdBy: actor,
      updatedAt: nowIso,
      updatedBy: actor
    };
    const created = await this.options.store.createKnowledgeNode(node);
    if (Array.isArray(created.embedding) && created.embedding.length > 0) {
      await this.syncSemanticEmbedding(created.id, created.embedding);
      return created;
    }

    const ensured = await this.ensureEmbedding(created, input.projectId);
    if (ensured.length === 0) {
      return created;
    }

    const refreshed = await this.options.store.getKnowledgeNodeById(created.id);
    return refreshed ?? created;
  }

  async updateKnowledgeNode(
    nodeId: string,
    patch: UpdateKnowledgeNodeInput,
    actor: string
  ): Promise<KnowledgeNode> {
    const existing = await this.options.store.getKnowledgeNodeById(nodeId);
    if (!existing) {
      throw new Error(`Knowledge node not found: ${nodeId}`);
    }

    const nextPath = patch.path ? normalizeKnowledgePath(patch.path.trim()) : existing.path;
    if (nextPath !== existing.path) {
      const collision = await this.options.store.findKnowledgeNodeByScopePath(existing.scope, nextPath);
      if (collision && collision.id !== existing.id) {
        throw new Error(`Knowledge node already exists for scope/path: ${existing.scope}:${nextPath}`);
      }
    }

    const updated = await this.options.store.updateKnowledgeNode(nodeId, {
      ...(patch.path ? { path: nextPath } : {}),
      ...(typeof patch.content === "string" ? { content: safeTrim(patch.content) } : {}),
      ...(patch.embedding ? { embedding: patch.embedding } : {}),
      updatedAt: this.now().toISOString(),
      updatedBy: actor
    });
    if (Array.isArray(updated.embedding) && updated.embedding.length > 0) {
      await this.syncSemanticEmbedding(updated.id, updated.embedding);
      return updated;
    }

    const ensured = await this.ensureEmbedding(updated, existing.projectId);
    if (ensured.length === 0) {
      return updated;
    }

    const refreshed = await this.options.store.getKnowledgeNodeById(updated.id);
    return refreshed ?? updated;
  }

  async deleteKnowledgeNode(nodeId: string): Promise<void> {
    await this.options.store.deleteKnowledgeNode(nodeId);
  }

  async syncFilesystem(actor = "knowledge_sync"): Promise<KnowledgeSyncResult> {
    const drafts = await this.readFilesystemDrafts();
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const draft of drafts) {
      const existing = await this.options.store.findKnowledgeNodeByScopePath(draft.scope, draft.path);
      if (!existing) {
        await this.createKnowledgeNode(
          {
            scope: draft.scope,
            path: draft.path,
            content: draft.content,
            ...(draft.tenantId ? { tenantId: draft.tenantId } : {}),
            ...(draft.projectId ? { projectId: draft.projectId } : {})
          },
          actor
        );
        created += 1;
        continue;
      }

      if (safeTrim(existing.content) === safeTrim(draft.content)) {
        skipped += 1;
        continue;
      }

      await this.updateKnowledgeNode(
        existing.id,
        {
          content: safeTrim(draft.content)
        },
        actor
      );
      updated += 1;
    }

    return {
      scanned: drafts.length,
      created,
      updated,
      skipped
    };
  }

  async searchKnowledge(input: SearchKnowledgeInput): Promise<SearchKnowledgeResult[]> {
    const limit = Math.max(1, input.limit ?? 8);
    const threshold = typeof input.threshold === "number" ? Math.min(Math.max(input.threshold, 0), 1) : 0;
    const query = input.query.trim();
    const queryTokens = tokenize(query);
    const nodes = await this.candidatesForTenantProject(input.tenantId, input.projectId);
    if (nodes.length === 0) return [];

    const lexicalSorted = [...nodes]
      .map((item) => ({ item, lexical: lexicalScore(queryTokens, item) }))
      .sort((left, right) => right.lexical - left.lexical || right.item.updatedAt.localeCompare(left.item.updatedAt));

    if (!this.options.embeddingProvider || query.length === 0) {
      return lexicalSorted
        .slice(0, limit)
        .map(({ item, lexical }) => ({ item, score: lexical, source: "lexical" as const }))
        .filter((entry) => entry.score >= threshold);
    }

    let queryVector: number[];
    try {
      queryVector = await this.embedSingleText(query, {
        projectId: input.projectId ?? "global_knowledge",
        role: "planner"
      });
    } catch {
      return lexicalSorted
        .slice(0, limit)
        .map(({ item, lexical }) => ({ item, score: lexical, source: "lexical" as const }));
    }

    if (this.options.semanticStore) {
      const semantic = await this.options.semanticStore.searchKnowledge({
        tenantId: input.tenantId,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        queryEmbedding: queryVector,
        limit,
        threshold
      });
      if (semantic.available) {
        return semantic.hits.slice(0, limit);
      }
    }

    const shortlist = lexicalSorted.slice(0, Math.max(limit * 2, 12));
    const scored: SearchKnowledgeResult[] = [];
    for (const row of shortlist) {
      const item = row.item;
      const embedding = await this.ensureEmbedding(item, input.projectId);
      const semantic = embedding.length > 0 ? cosineSimilarity(queryVector, embedding) : 0;
      const score = semantic * 0.78 + row.lexical * 0.22;
      scored.push({
        item,
        score,
        source: "semantic"
      });
    }

    return scored
      .sort((left, right) => right.score - left.score || right.item.updatedAt.localeCompare(left.item.updatedAt))
      .filter((entry) => entry.score >= threshold)
      .slice(0, limit);
  }

  async buildGenerationKnowledgeContext(input: {
    tenantId: string;
    projectId?: string;
    query: string;
    limit?: number;
    threshold?: number;
    contextNotes?: CompactKnowledgeContextNote[];
    contextNotesLimit?: number;
    includeContextNotes?: boolean;
  }): Promise<CompactKnowledgeContextEntry[]> {
    const policyInput: {
      limit?: number;
      threshold?: number;
      contextNotesLimit?: number;
      includeContextNotes?: boolean;
    } = {};
    if (typeof input.limit === "number") {
      policyInput.limit = input.limit;
    }
    if (typeof input.threshold === "number") {
      policyInput.threshold = input.threshold;
    }
    if (typeof input.contextNotesLimit === "number") {
      policyInput.contextNotesLimit = input.contextNotesLimit;
    }
    if (typeof input.includeContextNotes === "boolean") {
      policyInput.includeContextNotes = input.includeContextNotes;
    }
    const policy = this.resolveRetrievalPolicy(policyInput);
    const results = await this.searchKnowledge({
      tenantId: input.tenantId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      query: input.query,
      limit: policy.limit,
      threshold: policy.threshold
    });

    const knowledgeEntries: CompactKnowledgeContextEntry[] = results.map((entry) => ({
      path: entry.item.path,
      title: firstHeadingFromMarkdown(entry.item.content) ?? inferTitleFromPath(entry.item.path),
      scope: entry.item.scope,
      excerpt: safeTrim(entry.item.content).slice(0, 420),
      score: Number(entry.score.toFixed(4)),
      sourceType: "knowledge-node"
    }));

    if (!policy.includeContextNotes || !input.contextNotes || input.contextNotes.length === 0) {
      return knowledgeEntries.slice(0, policy.limit);
    }

    const queryTokens = tokenize(input.query);
    const rankedNoteEntries = input.contextNotes
      .map((note) => {
        const excerpt = safeTrim(note.content).slice(0, 420);
        const score = note.score ?? lexicalTextScore(queryTokens, `${note.path}\n${note.title}\n${note.content}`);
        return {
          noteId: note.id,
          path: note.path,
          title: note.title,
          scope: "context-notes" as const,
          excerpt,
          score: Number(Math.max(0, Math.min(1, score)).toFixed(4)),
          sourceType: "context-note" as const
        };
      });

    const noteEntries = rankedNoteEntries
      .filter((entry) => entry.score >= policy.threshold)
      .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
      .slice(0, policy.contextNotesLimit);
    const fallbackNotes =
      noteEntries.length > 0 || policy.contextNotesLimit === 0
        ? noteEntries
        : rankedNoteEntries
            .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
            .slice(0, policy.contextNotesLimit);

    const combined = [...knowledgeEntries, ...fallbackNotes]
      .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
      .slice(0, policy.limit);

    if (fallbackNotes.length === 0) {
      return combined;
    }
    if (combined.some((entry) => entry.sourceType === "context-note")) {
      return combined;
    }

    const fallback = fallbackNotes[0];
    if (!fallback) return combined;
    if (combined.length === 0) {
      return [fallback].slice(0, policy.limit);
    }

    return [...combined.slice(0, Math.max(0, policy.limit - 1)), fallback].sort(
      (left, right) => right.score - left.score || left.path.localeCompare(right.path)
    );
  }

  resolveRetrievalPolicy(input: {
    limit?: number;
    threshold?: number;
    includeContextNotes?: boolean;
    contextNotesLimit?: number;
  }): KnowledgeRetrievalPolicy {
    const limit = Math.max(1, input.limit ?? 8);
    const threshold = typeof input.threshold === "number" ? Math.min(Math.max(input.threshold, 0), 1) : 0;
    const includeContextNotes = input.includeContextNotes ?? true;
    const contextNotesLimit = Math.max(0, Math.min(input.contextNotesLimit ?? Math.min(limit, 4), limit));
    return {
      limit,
      threshold,
      includeContextNotes,
      contextNotesLimit
    };
  }

  formatCompactContext(entries: CompactKnowledgeContextEntry[]): string {
    if (entries.length === 0) return "No relevant knowledge retrieved.";
    return entries
      .map((entry) => `[${entry.scope}] ${entry.title}: ${truncate(safeTrim(entry.excerpt), 180)}`)
      .join("\n");
  }

  private async candidatesForTenantProject(tenantId: string, projectId?: string): Promise<KnowledgeNode[]> {
    const all = await this.options.store.listKnowledgeNodes();
    return all.filter((item) => {
      if (item.scope === "system") return true;
      if (item.scope === "tenant") return item.tenantId === tenantId;
      if (item.scope === "project") {
        if (!projectId) return false;
        return item.projectId === projectId;
      }
      return false;
    });
  }

  private async ensureEmbedding(item: KnowledgeNode, projectId?: string): Promise<number[]> {
    if (Array.isArray(item.embedding) && item.embedding.length > 0) {
      return item.embedding;
    }
    if (!this.options.embeddingProvider) return [];
    try {
      const vector = await this.embedSingleText(item.content.slice(0, 6_000), {
        projectId: projectId ?? item.projectId ?? "global_knowledge",
        role: "planner"
      });
      await this.options.store.updateKnowledgeNode(item.id, {
        embedding: vector,
        updatedAt: this.now().toISOString(),
        updatedBy: "knowledge_embedding"
      });
      await this.syncSemanticEmbedding(item.id, vector);
      return vector;
    } catch {
      return [];
    }
  }

  private async syncSemanticEmbedding(nodeId: string, embedding: number[]): Promise<void> {
    if (!this.options.semanticStore?.upsertKnowledgeEmbedding) return;
    try {
      await this.options.semanticStore.upsertKnowledgeEmbedding(nodeId, embedding);
    } catch {
      // Semantic index write failures should not block knowledge node writes.
    }
  }

  private async embedSingleText(text: string, context: ProviderRequestContext): Promise<number[]> {
    if (!this.options.embeddingProvider) return [];
    const response = await this.options.embeddingProvider.embed({ texts: [text] }, context);
    return response.vectors[0] ?? [];
  }

  private assertScopeIntegrity(scope: KnowledgeScope, tenantId?: string, projectId?: string): void {
    if (scope === "system" && (tenantId || projectId)) {
      throw new Error("System knowledge cannot include tenantId or projectId");
    }
    if (scope === "tenant" && !tenantId) {
      throw new Error("Tenant knowledge requires tenantId");
    }
    if (scope === "tenant" && projectId) {
      throw new Error("Tenant knowledge cannot include projectId");
    }
    if (scope === "project" && !projectId) {
      throw new Error("Project knowledge requires projectId");
    }
  }

  private async readFilesystemDrafts(): Promise<FilesystemKnowledgeNodeDraft[]> {
    if (!existsSync(this.knowledgeRootDir)) {
      return [];
    }
    const files = await this.listMarkdownFiles(this.knowledgeRootDir);
    const drafts: FilesystemKnowledgeNodeDraft[] = [];
    for (const fullPath of files) {
      const relative = normalizeToPosixPath(path.relative(this.knowledgeRootDir, fullPath));
      const scopedPath = normalizeKnowledgePath(relative);
      const parsedScope = parseScopeFromPath(scopedPath);
      if (!parsedScope) continue;
      const content = safeTrim(await readFile(fullPath, "utf8"));
      if (content.length === 0) continue;
      drafts.push({
        scope: parsedScope.scope,
        path: scopedPath,
        content,
        ...(parsedScope.tenantId ? { tenantId: parsedScope.tenantId } : {}),
        ...(parsedScope.projectId ? { projectId: parsedScope.projectId } : {})
      });
    }
    return drafts;
  }

  private async listMarkdownFiles(rootDir: string): Promise<string[]> {
    const output: string[] = [];
    const walk = async (currentDir: string): Promise<void> => {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.resolve(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
          continue;
        }
        if (entry.isFile() && markdownExtension.test(entry.name)) {
          output.push(fullPath);
        }
      }
    };
    await walk(rootDir);
    return output;
  }
}
