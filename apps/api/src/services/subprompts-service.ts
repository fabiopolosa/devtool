import type { Subprompt } from "@cp/domain";
import {
  composeSubpromptsFromCatalog,
  getSubpromptFromCatalog,
  listSubpromptsFromCatalog
} from "@cp/prompt-builder";
import { apiStore } from "./api-store.js";

export async function syncSubpromptsCatalog(): Promise<Subprompt[]> {
  const filesystemItems = await listSubpromptsFromCatalog();
  const persisted = await apiStore.listSubprompts();
  const byId = new Map(persisted.map((item) => [item.id, item] as const));

  const synced: Subprompt[] = [];
  for (const item of filesystemItems) {
    const existing = byId.get(item.id);
    if (!existing) {
      synced.push(await apiStore.createSubprompt(item));
      continue;
    }
    synced.push(
      await apiStore.updateSubprompt(existing.id, {
        title: item.title,
        category: item.category,
        summary: item.summary,
        prompt: item.prompt,
        tags: item.tags,
        sourcePath: item.sourcePath,
        enabled: item.enabled
      })
    );
  }

  return synced;
}

export async function listSubprompts(filters?: {
  category?: Subprompt["category"];
  enabled?: boolean;
  tag?: string;
  refresh?: boolean;
}): Promise<Subprompt[]> {
  if (filters?.refresh) {
    await syncSubpromptsCatalog();
  }
  const items = await apiStore.listSubprompts({
    ...(filters?.category ? { category: filters.category } : {}),
    ...(filters?.enabled !== undefined ? { enabled: filters.enabled } : {})
  });
  const normalizedTag = filters?.tag?.trim().toLowerCase();
  if (!normalizedTag) return items;
  return items.filter((item) => item.tags.some((tag) => tag.toLowerCase() === normalizedTag));
}

export async function getSubprompt(subpromptId: string): Promise<Subprompt | null> {
  const existing = await apiStore.getSubprompt(subpromptId);
  if (existing) return existing;
  const fromCatalog = await getSubpromptFromCatalog(subpromptId);
  if (!fromCatalog) return null;
  await syncSubpromptsCatalog();
  return apiStore.getSubprompt(subpromptId);
}

export async function composeSubprompts(input: {
  selectedIds: string[];
  includeDisabled?: boolean;
  additionalInstructions?: string[];
}): Promise<{ selectedSubprompts: Subprompt[]; composedPrompt: string }> {
  return composeSubpromptsFromCatalog(input);
}
