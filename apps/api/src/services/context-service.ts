import {
  createContextNoteSchema,
  type CreateContextNoteSchema,
  type ContextNote,
  type UpdateContextNoteSchema,
  updateContextNoteSchema
} from "@cp/domain";
import { ContextService, type ContextNoteStore } from "@cp/context";
import { apiStore } from "./api-store.js";

const contextService = new ContextService({
  store: {
    listContextNotes: async (filters) => apiStore.listContextNotes(filters),
    getContextNoteById: async (contextNoteId) => apiStore.getContextNote(contextNoteId),
    findContextNoteByProjectPath: async (tenantId, projectId, notePath) =>
      apiStore.findContextNoteByProjectPath(tenantId, projectId, notePath),
    createContextNote: async (note) => apiStore.createContextNote(note),
    updateContextNote: async (contextNoteId, patch) =>
      apiStore.updateContextNote(contextNoteId, patch),
    deleteContextNote: async (contextNoteId) => apiStore.deleteContextNote(contextNoteId)
  } satisfies ContextNoteStore
});

export interface ListContextInput {
  tenantId: string;
  projectId: string;
  query?: string;
  path?: string;
  limit?: number;
}

export interface CreateContextInput extends CreateContextNoteSchema {
  tenantId: string;
  projectId: string;
}

export interface UpdateContextInput extends UpdateContextNoteSchema {}

export const listContextNotes = async (input: ListContextInput): Promise<{
  items: ContextNote[];
  hits?: Array<{ item: ContextNote; score: number; source: "lexical" }>;
}> => {
  const result = await contextService.listOrSearch({
    tenantId: input.tenantId,
    projectId: input.projectId,
    ...(input.path ? { path: input.path } : {}),
    ...(input.query ? { query: input.query } : {}),
    ...(typeof input.limit === "number" ? { limit: input.limit } : {})
  });
  return result;
};

export const getContextNote = async (
  contextNoteId: string,
  tenantId: string,
  projectId: string
): Promise<ContextNote | null> => contextService.getContextNote(contextNoteId, tenantId, projectId);

export const createContextNote = async (raw: unknown, actor: string, tenantId: string): Promise<ContextNote> => {
  const parsed = createContextNoteSchema.parse(raw) as CreateContextInput;
  return contextService.createContextNote(
    {
      tenantId,
      projectId: parsed.projectId,
      path: parsed.path,
      title: parsed.title,
      content: parsed.content,
      ...(Array.isArray(parsed.tags) ? { tags: parsed.tags } : {}),
      ...(Array.isArray(parsed.linkRefs) ? { linkRefs: parsed.linkRefs } : {}),
      ...(typeof parsed.pinned === "boolean" ? { pinned: parsed.pinned } : {})
    },
    actor
  );
};

export const updateContextNote = async (
  contextNoteId: string,
  raw: unknown,
  actor: string,
  tenantId: string,
  projectId: string
): Promise<ContextNote> => {
  const parsed = updateContextNoteSchema.parse(raw) as UpdateContextInput;
  return contextService.updateContextNote(
    contextNoteId,
    {
      ...(parsed.path ? { path: parsed.path } : {}),
      ...(parsed.title ? { title: parsed.title } : {}),
      ...(parsed.content ? { content: parsed.content } : {}),
      ...(Array.isArray(parsed.tags) ? { tags: parsed.tags } : {}),
      ...(Array.isArray(parsed.linkRefs) ? { linkRefs: parsed.linkRefs } : {}),
      ...(typeof parsed.pinned === "boolean" ? { pinned: parsed.pinned } : {})
    },
    actor,
    tenantId,
    projectId
  );
};

export const deleteContextNote = async (
  contextNoteId: string,
  tenantId: string,
  projectId: string
): Promise<void> => {
  await contextService.deleteContextNote(contextNoteId, tenantId, projectId);
};
