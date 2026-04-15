import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Subprompt, SubpromptCategory } from "@cp/domain";

export interface SubpromptsServiceOptions {
  subpromptsDir: string;
  now?: () => Date;
}

export interface ComposeSubpromptsInput {
  selectedIds: string[];
  includeDisabled?: boolean;
  additionalInstructions?: string[];
}

export interface ComposeSubpromptsResult {
  selectedSubprompts: Subprompt[];
  composedPrompt: string;
}

const supportedExtensions = new Set([".json", ".yaml", ".yml"]);
const categories = new Set<SubpromptCategory>([
  "stack",
  "architecture",
  "agents",
  "skills",
  "conventions",
  "planning",
  "other"
]);

const toCategory = (value: unknown, sourcePath: string): SubpromptCategory => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid subprompt document (category required): ${sourcePath}`);
  }
  const normalized = value.trim() as SubpromptCategory;
  if (!categories.has(normalized)) {
    throw new Error(`Invalid subprompt category "${value}" in ${sourcePath}`);
  }
  return normalized;
};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

const parseSubprompt = (raw: unknown, sourcePath: string): Subprompt => {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid subprompt payload: ${sourcePath}`);
  }

  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "string" || obj.id.trim().length === 0) {
    throw new Error(`Invalid subprompt document (id required): ${sourcePath}`);
  }
  if (typeof obj.title !== "string" || obj.title.trim().length === 0) {
    throw new Error(`Invalid subprompt document (title required): ${sourcePath}`);
  }
  if (typeof obj.prompt !== "string" || obj.prompt.trim().length === 0) {
    throw new Error(`Invalid subprompt document (prompt required): ${sourcePath}`);
  }

  const id = obj.id.trim();

  return {
    id,
    title: obj.title.trim(),
    category: toCategory(obj.category, sourcePath),
    summary:
      typeof obj.summary === "string" && obj.summary.trim().length > 0
        ? obj.summary.trim()
        : obj.title.trim(),
    prompt: obj.prompt.trim(),
    tags: toStringArray(obj.tags),
    sourcePath,
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : true
  };
};

export class SubpromptsService {
  constructor(private readonly options: SubpromptsServiceOptions) {
    void options.now;
  }

  async list(filters?: {
    category?: SubpromptCategory;
    enabled?: boolean;
    tag?: string;
  }): Promise<Subprompt[]> {
    const all = await this.readFromFilesystem();
    const normalizedTag = filters?.tag?.trim().toLowerCase();
    return all.filter((item) => {
      if (filters?.category && item.category !== filters.category) return false;
      if (filters?.enabled !== undefined && item.enabled !== filters.enabled) return false;
      if (normalizedTag && !item.tags.some((tag) => tag.toLowerCase() === normalizedTag)) return false;
      return true;
    });
  }

  async get(id: string): Promise<Subprompt | null> {
    const all = await this.readFromFilesystem();
    return all.find((item) => item.id === id) ?? null;
  }

  async compose(input: ComposeSubpromptsInput): Promise<ComposeSubpromptsResult> {
    const all = await this.readFromFilesystem();
    const filtered = input.includeDisabled ? all : all.filter((item) => item.enabled);
    const selected =
      input.selectedIds.length > 0
        ? filtered.filter((item) => input.selectedIds.includes(item.id))
        : filtered;

    const composedPrompt = [
      "Subprompt composition:",
      ...selected.map((item) => `- [${item.category}] ${item.title}: ${item.prompt}`),
      ...(input.additionalInstructions ?? []).map((instruction) => `- [extra] ${instruction}`)
    ].join("\n");

    return {
      selectedSubprompts: selected,
      composedPrompt
    };
  }

  private async readFromFilesystem(): Promise<Subprompt[]> {
    const dirEntries = await readdir(this.options.subpromptsDir, { withFileTypes: true });
    const files = dirEntries
      .filter((entry) => entry.isFile())
      .filter((entry) => supportedExtensions.has(path.extname(entry.name).toLowerCase()))
      .sort((left, right) => left.name.localeCompare(right.name));

    const items: Subprompt[] = [];
    const seenIds = new Set<string>();
    for (const entry of files) {
      const fullPath = path.resolve(this.options.subpromptsDir, entry.name);
      try {
        const rawText = await readFile(fullPath, "utf8");
        const extension = path.extname(entry.name).toLowerCase();
        const payload = extension === ".json" ? JSON.parse(rawText) : parseYaml(rawText);
        const parsed = parseSubprompt(payload, fullPath);
        if (seenIds.has(parsed.id)) {
          throw new Error(`Duplicate subprompt id "${parsed.id}" in ${fullPath}`);
        }
        seenIds.add(parsed.id);
        items.push(parsed);
      } catch (error) {
        if (process.env.NODE_ENV === "production") {
          const reason = error instanceof Error ? error.message : "unknown error";
          console.warn(`[subprompts] Skipping invalid file ${fullPath}: ${reason}`);
          continue;
        }
        throw error;
      }
    }
    return items;
  }
}
