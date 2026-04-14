import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type { Skill } from "@cp/domain";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const marketplaceSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default("No description provided."),
  repositoryUrl: z.string().min(1),
  version: z.string().optional().default("0.0.0"),
  categories: z.array(z.string().min(1)).optional().default([]),
  instructions: z.string().optional().default("No instructions provided.")
});

const marketplaceSchema = z.object({
  skills: z.array(marketplaceSkillSchema).default([])
});

export interface SkillStore {
  listSkills(): Promise<Skill[]>;
  findSkillByNameAndRepository(name: string, repositoryUrl: string): Promise<Skill | null>;
  saveSkill(skill: Skill): Promise<Skill>;
}

export interface MarketplaceAdapter {
  name: string;
  canHandle(source: string): boolean;
  resolveManifestUrl(source: string): string;
}

export interface SkillInstaller {
  install(repositoryUrl: string): Promise<void>;
}

export interface InstallSkillInput {
  name: string;
  repositoryUrl: string;
  description?: string;
  version?: string;
  categories?: string[];
  instructions?: string;
}

export interface InstallSkillResult {
  item: Skill;
  installed: boolean;
  error?: string;
}

export interface SkillsServiceOptions {
  store: SkillStore;
  installer?: SkillInstaller;
  adapters?: MarketplaceAdapter[];
  fetchImpl?: typeof fetch;
  now?: () => Date;
  idGenerator?: () => string;
}

export class RawUrlMarketplaceAdapter implements MarketplaceAdapter {
  name = "raw-url";

  canHandle(source: string): boolean {
    return /^https?:\/\//i.test(source.trim());
  }

  resolveManifestUrl(source: string): string {
    const normalized = source.trim();
    if (normalized.endsWith(".json")) {
      return normalized;
    }
    return normalized.endsWith("/") ? `${normalized}marketplace.json` : `${normalized}/marketplace.json`;
  }
}

export class GithubRepositoryMarketplaceAdapter implements MarketplaceAdapter {
  name = "github-repository";

  canHandle(source: string): boolean {
    const normalized = source.trim();
    return /^https?:\/\/(www\.)?github\.com\//i.test(normalized) && !normalized.endsWith(".json");
  }

  resolveManifestUrl(source: string): string {
    const url = new URL(source.trim());
    const [owner, repoRaw] = url.pathname.split("/").filter(Boolean);
    if (!owner || !repoRaw) {
      throw new Error(`Invalid GitHub repository URL: ${source}`);
    }
    const repo = repoRaw.replace(/\.git$/i, "");
    return `https://raw.githubusercontent.com/${owner}/${repo}/main/marketplace.json`;
  }
}

export class ShellSkillInstaller implements SkillInstaller {
  constructor(private readonly cwd: string = process.cwd()) {}

  async install(repositoryUrl: string): Promise<void> {
    await execFileAsync("npx", ["-y", "skills", "add", repositoryUrl], {
      cwd: this.cwd
    });
  }
}

export class SkillsService {
  private readonly adapterChain: MarketplaceAdapter[];
  private readonly cache = new Map<string, Skill[]>();
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  constructor(private readonly options: SkillsServiceOptions) {
    this.adapterChain = options.adapters ?? [new GithubRepositoryMarketplaceAdapter(), new RawUrlMarketplaceAdapter()];
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
  }

  async fetchMarketplace(repoUrl: string): Promise<Skill[]> {
    const adapter = this.resolveAdapter(repoUrl);
    const manifestUrl = adapter.resolveManifestUrl(repoUrl);
    const response = await this.fetchImpl(manifestUrl);
    if (!response.ok) {
      throw new Error(`Marketplace fetch failed (${response.status}) from ${manifestUrl}`);
    }

    const payload = marketplaceSchema.parse(await response.json());
    const upserted: Skill[] = [];
    for (const item of payload.skills) {
      upserted.push(await this.upsertMarketplaceSkill(item));
    }

    this.cache.set(manifestUrl, upserted);
    return upserted;
  }

  async listInstalled(): Promise<Skill[]> {
    const skills = await this.options.store.listSkills();
    return skills.filter((skill) => skill.installed);
  }

  async searchSkills(query: string): Promise<Skill[]> {
    const normalizedQuery = query.trim().toLowerCase();
    const cached = [...this.cache.values()].flat();
    const persisted = await this.options.store.listSkills();
    const allSkills = uniqueSkills([...persisted, ...cached]);

    if (!normalizedQuery) {
      return allSkills;
    }

    return allSkills.filter((skill) => {
      return (
        skill.name.toLowerCase().includes(normalizedQuery) ||
        skill.description.toLowerCase().includes(normalizedQuery) ||
        skill.repositoryUrl.toLowerCase().includes(normalizedQuery) ||
        skill.categories.some((category) => category.toLowerCase().includes(normalizedQuery))
      );
    });
  }

  async installSkill(input: InstallSkillInput): Promise<InstallSkillResult> {
    const existing = await this.options.store.findSkillByNameAndRepository(input.name, input.repositoryUrl);
    const nowIso = this.now().toISOString();
    const base: Skill = existing ?? {
      id: this.idGenerator(),
      name: input.name,
      description: input.description ?? "Installed skill",
      repositoryUrl: input.repositoryUrl,
      version: input.version ?? "0.0.0",
      installed: false,
      categories: input.categories ?? [],
      instructions: input.instructions ?? "No instructions provided.",
      createdAt: nowIso,
      createdBy: "skills_service",
      updatedAt: nowIso,
      updatedBy: "skills_service"
    };

    let error: string | undefined;
    let installed = existing?.installed ?? false;
    try {
      const installer = this.options.installer ?? new ShellSkillInstaller();
      await installer.install(base.repositoryUrl);
      installed = true;
    } catch (installError) {
      installed = existing?.installed ?? false;
      error = installError instanceof Error ? installError.message : "Unknown install failure";
    }

    const next: Skill = {
      ...base,
      name: input.name,
      repositoryUrl: input.repositoryUrl,
      description: input.description ?? base.description,
      version: input.version ?? base.version,
      categories: input.categories ?? base.categories,
      instructions: input.instructions ?? base.instructions,
      installed,
      updatedAt: nowIso,
      updatedBy: "skills_service"
    };

    const saved = await this.options.store.saveSkill(next);
    return {
      item: saved,
      installed: saved.installed,
      ...(error ? { error } : {})
    };
  }

  private resolveAdapter(source: string): MarketplaceAdapter {
    const adapter = this.adapterChain.find((candidate) => candidate.canHandle(source));
    if (!adapter) {
      throw new Error(`No marketplace adapter available for ${source}`);
    }
    return adapter;
  }

  private async upsertMarketplaceSkill(item: z.infer<typeof marketplaceSkillSchema>): Promise<Skill> {
    const existing = await this.options.store.findSkillByNameAndRepository(item.name, item.repositoryUrl);
    const nowIso = this.now().toISOString();
    const next: Skill = existing
      ? {
          ...existing,
          name: item.name,
          description: item.description,
          repositoryUrl: item.repositoryUrl,
          version: item.version,
          categories: item.categories,
          instructions: item.instructions,
          updatedAt: nowIso,
          updatedBy: "skills_service"
        }
      : {
          id: this.idGenerator(),
          name: item.name,
          description: item.description,
          repositoryUrl: item.repositoryUrl,
          version: item.version,
          installed: false,
          categories: item.categories,
          instructions: item.instructions,
          createdAt: nowIso,
          createdBy: "skills_service",
          updatedAt: nowIso,
          updatedBy: "skills_service"
        };

    return this.options.store.saveSkill(next);
  }
}

const uniqueSkills = (skills: Skill[]): Skill[] => {
  const map = new Map<string, Skill>();
  for (const skill of skills) {
    map.set(`${skill.name.trim().toLowerCase()}::${skill.repositoryUrl.trim()}`, skill);
  }
  return [...map.values()];
};
