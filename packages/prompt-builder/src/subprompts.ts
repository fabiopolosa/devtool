import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Subprompt } from "@cp/domain";
import { SubpromptsService } from "@cp/subprompts";

export interface SubpromptCatalogOptions {
  subpromptsDir?: string;
}

const resolveDefaultSubpromptsDir = (): string => {
  const fallback = path.resolve(process.cwd(), "configs/subprompts");
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    fallback,
    path.resolve(process.cwd(), "../../configs/subprompts"),
    path.resolve(moduleDir, "../../../configs/subprompts"),
    path.resolve(moduleDir, "../../../../configs/subprompts")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return fallback;
};

const createCatalog = (options?: SubpromptCatalogOptions): SubpromptsService =>
  new SubpromptsService({
    subpromptsDir: options?.subpromptsDir?.trim() || resolveDefaultSubpromptsDir()
  });

export const listSubpromptsFromCatalog = async (
  filters?: { category?: Subprompt["category"]; enabled?: boolean; tag?: string },
  options?: SubpromptCatalogOptions
): Promise<Subprompt[]> => createCatalog(options).list(filters);

export const getSubpromptFromCatalog = async (
  id: string,
  options?: SubpromptCatalogOptions
): Promise<Subprompt | null> => createCatalog(options).get(id);

export const composeSubpromptsFromCatalog = async (
  input: {
    selectedIds: string[];
    includeDisabled?: boolean;
    additionalInstructions?: string[];
  },
  options?: SubpromptCatalogOptions
): Promise<{ selectedSubprompts: Subprompt[]; composedPrompt: string }> =>
  createCatalog(options).compose(input);
