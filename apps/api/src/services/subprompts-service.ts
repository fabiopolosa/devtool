import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Subprompt } from "@cp/domain";
import { SubpromptsService, type SubpromptStore } from "@cp/subprompts";
import { apiStore } from "./api-store.js";

class ApiSubpromptStoreAdapter implements SubpromptStore {
  async listSubprompts(filters?: { category?: Subprompt["category"]; enabled?: boolean }): Promise<Subprompt[]> {
    return apiStore.listSubprompts(filters);
  }

  async getSubprompt(id: string): Promise<Subprompt | null> {
    return apiStore.getSubprompt(id);
  }

  async createSubprompt(item: Subprompt): Promise<Subprompt> {
    return apiStore.createSubprompt(item);
  }

  async updateSubprompt(id: string, patch: Partial<Subprompt>): Promise<Subprompt> {
    return apiStore.updateSubprompt(id, patch);
  }
}

const resolveDefaultSubpromptsDir = (): string => {
  const fromCwd = path.resolve(process.cwd(), "configs/subprompts");
  if (existsSync(fromCwd)) {
    return fromCwd;
  }
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, "../../../../configs/subprompts");
};

const subpromptsDir = process.env.SUBPROMPTS_DIR?.trim() || resolveDefaultSubpromptsDir();

export const subpromptsService = new SubpromptsService({
  subpromptsDir
});

const storeAdapter = new ApiSubpromptStoreAdapter();

export async function syncSubpromptsCatalog(): Promise<Subprompt[]> {
  return subpromptsService.syncToStore(storeAdapter);
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
  await syncSubpromptsCatalog();
  return apiStore.getSubprompt(subpromptId);
}

export async function composeSubprompts(input: {
  selectedIds: string[];
  includeDisabled?: boolean;
  additionalInstructions?: string[];
}): Promise<{ selectedSubprompts: Subprompt[]; composedPrompt: string }> {
  return subpromptsService.compose(input);
}
