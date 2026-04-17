import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type {
  Skill,
  SkillExecutionConfig,
  SkillSandboxProfile,
  SkillScope,
  SkillSourceType,
  SkillValidationStatus,
  SkillVersionRecord
} from "@cp/domain";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const marketplaceSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default("No description provided."),
  repositoryUrl: z.string().min(1),
  version: z.string().optional().default("0.0.0"),
  categories: z.array(z.string().min(1)).optional().default([]),
  instructions: z.string().optional().default("No instructions provided."),
  scope: z.enum(["system", "tenant", "user"]).optional().default("tenant"),
  sourceType: z.enum(["github", "file", "zip"]).optional().default("github"),
  sourceRef: z.string().min(1).optional()
});

const marketplaceSchema = z.object({
  skills: z.array(marketplaceSkillSchema).default([])
});

const skillExecutionInputSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  const strictValidation = validateStrictJsonValue(value);
  if (!strictValidation.ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: strictValidation.message
    });
    return;
  }
  const size = safeJsonByteLength(value);
  if (size > 64 * 1024) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "input payload exceeds 64KB limit"
    });
  }
});

const skillExecutionResultSchema = z.object({
  success: z.boolean(),
  skillId: z.string().min(1),
  logs: z.array(z.string()),
  output: z.unknown().optional(),
  error: z.string().optional(),
  patch: z.string().optional(),
  exitCode: z.number().int().optional()
});

export interface SkillStore {
  listSkills(): Promise<Skill[]>;
  getSkill(skillId: string): Promise<Skill | null>;
  findSkillByNameAndRepository(name: string, repositoryUrl: string): Promise<Skill | null>;
  saveSkill(skill: Skill): Promise<Skill>;
  deleteSkill?(skillId: string): Promise<void>;
}

export interface MarketplaceAdapter {
  name: string;
  canHandle(source: string): boolean;
  resolveManifestUrl(source: string): string;
}

export interface SkillInstaller {
  install(repositoryUrl: string): Promise<void>;
}

export interface SkillValidationResult {
  status: SkillValidationStatus;
  errors: string[];
  warnings: string[];
  capabilities: string[];
  checkedAt: string;
}

export interface SkillExecutionInput {
  skillId: string;
  tenantId?: string;
  actor?: string;
  command?: string;
  args?: string[];
  input?: Record<string, unknown>;
  confirm?: boolean;
}

export interface SkillExecutionResult {
  success: boolean;
  skillId: string;
  logs: string[];
  output?: unknown;
  error?: string;
  patch?: string;
  exitCode?: number;
}

export interface SkillExecutor {
  execute(input: {
    skill: Skill;
    actor: string;
    command?: string;
    args?: string[];
    input?: Record<string, unknown>;
    confirm?: boolean;
  }): Promise<SkillExecutionResult>;
}

export interface InstallSkillInput {
  name: string;
  repositoryUrl: string;
  tenantId?: string;
  description?: string;
  version?: string;
  categories?: string[];
  instructions?: string;
  scope?: SkillScope;
  sourceType?: SkillSourceType;
  sourceRef?: string;
  sourcePayloadBase64?: string;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
  sandboxProfile?: SkillSandboxProfile;
  executionConfig?: SkillExecutionConfig;
  actor?: string;
  validateOnInstall?: boolean;
}

export interface InstallSkillResult {
  item: Skill;
  installed: boolean;
  validation: SkillValidationResult;
  error?: string;
}

export interface SkillsServiceOptions {
  store: SkillStore;
  installer?: SkillInstaller;
  executor?: SkillExecutor;
  adapters?: MarketplaceAdapter[];
  fetchImpl?: typeof fetch;
  now?: () => Date;
  idGenerator?: () => string;
}

const runtimeFetch: typeof fetch = (...args) => globalThis.fetch(...args);

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

const defaultShellAllowlist = ["echo"];
const blockedShellCommands = new Set(["bash", "sh", "zsh", "fish", "cmd", "powershell", "pwsh", "sudo"]);
const blockedProcessSpawnerCommands = new Set([
  "node",
  "deno",
  "bun",
  "python",
  "python3",
  "perl",
  "ruby",
  "npm",
  "pnpm",
  "npx",
  "yarn",
  "make",
  "nohup",
  "env"
]);
const networkAwareCommands = new Set([
  "curl",
  "wget",
  "http",
  "httpie",
  "ping",
  "dig",
  "nslookup",
  "nc",
  "ncat",
  "nmap",
  "ssh",
  "scp",
  "sftp",
  "telnet"
]);
const commandNamePattern = /^[a-zA-Z0-9._-]+$/;
const unsafeArgPattern = /[;&|`]|(\$\(.*\))|(^>|^<)|(^>>)|(\.\.)/;
const absoluteWindowsPathPattern = /^[a-zA-Z]:[\\/]/;
const urlTargetPattern = /^https?:\/\/[^/\s?#]+/i;
const hostTargetPattern = /^([a-z0-9][a-z0-9.-]*[a-z0-9]|localhost)(:\d+)?$/i;
const defaultExecutionTimeoutMs = 45_000;
const minExecutionTimeoutMs = 1_000;
const maxExecutionTimeoutMs = 120_000;

export class DefaultSkillExecutor implements SkillExecutor {
  constructor(private readonly cwd: string = process.cwd()) {}

  async execute(input: {
    skill: Skill;
    actor: string;
    command?: string;
    args?: string[];
    input?: Record<string, unknown>;
    confirm?: boolean;
  }): Promise<SkillExecutionResult> {
    const allowlist = normalizeAllowlist([
      ...defaultShellAllowlist,
      ...(input.skill.executionConfig?.commandAllowlist ?? [])
    ]);
    const command = input.command ?? input.skill.executionConfig?.entryCommand;
    const args = normalizeArgs(input.args ?? input.skill.executionConfig?.entryArgs ?? []);
    const timeoutMs = normalizeExecutionTimeoutMs(input.skill.executionConfig?.timeoutMs);
    const requireConfirmation = input.skill.executionConfig?.requireConfirmation ?? true;
    const sandbox = input.skill.sandboxProfile ?? defaultSandboxProfile(resolveSkillScope(input.skill));
    const runtimeBaseDirectory = resolve(this.cwd, ".devtools", "skill-runtime");
    const runtimeDirectory = resolve(runtimeBaseDirectory, input.skill.id);
    const networkAllowlist = normalizeNetworkAllowlist(sandbox.networkAllowlist ?? []);
    const networkTargets = resolveNetworkTargets(args);

    if (!command) {
      return {
        success: true,
        skillId: input.skill.id,
        logs: [
          `actor=${input.actor}`,
          "mode=declarative",
          "No executable entry command configured; returning skill instructions."
        ],
        output: {
          skill: {
            id: input.skill.id,
            name: input.skill.name,
            version: input.skill.currentVersion ?? input.skill.version
          },
          instructions: input.skill.instructions,
          input: input.input ?? {}
        }
      };
    }

    if (!sandbox.process) {
      return {
        success: false,
        skillId: input.skill.id,
        logs: [`actor=${input.actor}`, "sandbox.process=false"],
        error: `Skill '${input.skill.name}' cannot execute commands because process execution is disabled.`
      };
    }

    if (!commandNamePattern.test(command)) {
      return {
        success: false,
        skillId: input.skill.id,
        logs: [`actor=${input.actor}`, `command=${command}`],
        error: `Command '${command}' has invalid characters.`
      };
    }

    if (blockedShellCommands.has(command.toLowerCase())) {
      return {
        success: false,
        skillId: input.skill.id,
        logs: [`actor=${input.actor}`, `command=${command}`],
        error: `Command '${command}' is blocked for security reasons.`
      };
    }

    if (blockedProcessSpawnerCommands.has(command.toLowerCase())) {
      return {
        success: false,
        skillId: input.skill.id,
        logs: [`actor=${input.actor}`, `command=${command}`],
        error: `Command '${command}' is blocked because spawning arbitrary processes is not allowed.`
      };
    }

    if (!allowlist.includes(command)) {
      return {
        success: false,
        skillId: input.skill.id,
        logs: [`actor=${input.actor}`, `command=${command}`],
        error: `Command '${command}' is not allowed for skill execution.`
      };
    }

    const unsafeArg = args.find(
      (entry) =>
        unsafeArgPattern.test(entry) ||
        entry.startsWith("/") ||
        absoluteWindowsPathPattern.test(entry)
    );
    if (unsafeArg) {
      return {
        success: false,
        skillId: input.skill.id,
        logs: [`actor=${input.actor}`, `command=${command}`],
        error: `Argument '${unsafeArg}' is blocked by sandbox policy.`
      };
    }

    if (!sandbox.network && (networkAwareCommands.has(command.toLowerCase()) || networkTargets.length > 0)) {
      return {
        success: false,
        skillId: input.skill.id,
        logs: [`actor=${input.actor}`, `command=${command}`],
        error: `Network access is disabled for skill '${input.skill.name}'.`
      };
    }

    if (sandbox.network && networkAllowlist.length > 0) {
      if (networkAwareCommands.has(command.toLowerCase()) && networkTargets.length === 0) {
        return {
          success: false,
          skillId: input.skill.id,
          logs: [`actor=${input.actor}`, `command=${command}`],
          error: `Command '${command}' requires an explicit network target to enforce allowlist policy.`
        };
      }
      const disallowedTarget = networkTargets.find(
        (target) => !networkAllowlist.some((pattern) => matchesNetworkAllowlist(target, pattern))
      );
      if (disallowedTarget) {
        return {
          success: false,
          skillId: input.skill.id,
          logs: [`actor=${input.actor}`, `command=${command}`],
          error: `Network target '${disallowedTarget}' is not allowed by sandbox policy.`
        };
      }
    }

    if (requireConfirmation && input.confirm !== true) {
      return {
        success: false,
        skillId: input.skill.id,
        logs: [`actor=${input.actor}`, `command=${command}`],
        error: `Skill '${input.skill.name}' requires confirmation before execution.`
      };
    }

    try {
      await mkdir(runtimeDirectory, { recursive: true });
      const [resolvedRuntimeBaseDirectory, resolvedRuntimeDirectory] = await Promise.all([
        safeRealPath(runtimeBaseDirectory),
        safeRealPath(runtimeDirectory)
      ]);
      if (!isPathWithin(resolvedRuntimeDirectory, resolvedRuntimeBaseDirectory)) {
        return {
          success: false,
          skillId: input.skill.id,
          logs: [`actor=${input.actor}`, `command=${command}`],
          error: "Runtime directory escaped skill sandbox root."
        };
      }
      const runtimeEnv = {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        LANG: process.env.LANG ?? "en_US.UTF-8",
        SKILL_ID: input.skill.id,
        SKILL_SCOPE: resolveSkillScope(input.skill),
        SKILL_SANDBOX_FILESYSTEM: sandbox.filesystem,
        SKILL_SANDBOX_NETWORK: sandbox.network ? "1" : "0",
        SKILL_SANDBOX_NETWORK_ALLOWLIST: networkAllowlist.join(","),
        SKILL_SANDBOX_PROCESS: sandbox.process ? "1" : "0"
      };
      const { stdout, stderr } = await execFileAsync(command, args, {
        cwd: resolvedRuntimeDirectory,
        env: runtimeEnv,
        maxBuffer: 2 * 1024 * 1024,
        timeout: timeoutMs,
        killSignal: "SIGKILL"
      });
      const logs: string[] = [
        `actor=${input.actor}`,
        `command=${command}`,
        `timeoutMs=${timeoutMs}`,
        `sandbox.filesystem=${sandbox.filesystem}`,
        `sandbox.network=${sandbox.network}`,
        `sandbox.process=${sandbox.process}`
      ];
      if (networkAllowlist.length > 0) {
        logs.push(`sandbox.networkAllowlist=${networkAllowlist.join(",")}`);
      }
      if (stderr.trim().length > 0) logs.push(stderr.trim());
      return {
        success: true,
        skillId: input.skill.id,
        logs,
        output: stdout.trim()
      };
    } catch (error) {
      if (isTimeoutError(error)) {
        return {
          success: false,
          skillId: input.skill.id,
          logs: [`actor=${input.actor}`, `command=${command}`, `timeoutMs=${timeoutMs}`],
          error: `Skill '${input.skill.name}' timed out after ${timeoutMs}ms and was force-killed.`
        };
      }
      return {
        success: false,
        skillId: input.skill.id,
        logs: [`actor=${input.actor}`, `command=${command}`],
        error: error instanceof Error ? error.message : "Unknown skill execution failure"
      };
    }
  }
}

export class SkillsService {
  private readonly adapterChain: MarketplaceAdapter[];
  private readonly cache = new Map<string, Skill[]>();
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;
  private readonly executor: SkillExecutor;

  constructor(private readonly options: SkillsServiceOptions) {
    this.adapterChain = options.adapters ?? [new GithubRepositoryMarketplaceAdapter(), new RawUrlMarketplaceAdapter()];
    this.fetchImpl = options.fetchImpl ?? runtimeFetch;
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
    this.executor = options.executor ?? new DefaultSkillExecutor();
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

  async listAll(): Promise<Skill[]> {
    return this.options.store.listSkills();
  }

  async searchSkills(query: string): Promise<Skill[]> {
    const normalizedQuery = query.trim().toLowerCase();
    const persisted = await this.options.store.listSkills();
    const allSkills = uniqueSkills(persisted);

    if (!normalizedQuery) {
      return allSkills;
    }

    return allSkills.filter((skill) => {
      return (
        skill.name.toLowerCase().includes(normalizedQuery) ||
        skill.description.toLowerCase().includes(normalizedQuery) ||
        skill.repositoryUrl.toLowerCase().includes(normalizedQuery) ||
        skill.categories.some((category) => category.toLowerCase().includes(normalizedQuery)) ||
        (skill.capabilities ?? []).some((capability) => capability.toLowerCase().includes(normalizedQuery))
      );
    });
  }

  async getSkill(skillId: string): Promise<Skill | null> {
    return this.options.store.getSkill(skillId);
  }

  async installSkill(input: InstallSkillInput): Promise<InstallSkillResult> {
    const existing = await this.options.store.findSkillByNameAndRepository(input.name, input.repositoryUrl);
    const nowIso = this.now().toISOString();
    const actor = input.actor?.trim() || "skills_service";
    const tenantId = normalizeTenantId(input.tenantId) ?? normalizeTenantId(input.metadata?.tenantId);
    const existingTenantId = existing ? resolveSkillTenantId(existing) : undefined;
    if (tenantId && existingTenantId && existingTenantId !== tenantId) {
      throw new Error(
        `Skill '${input.name}' already exists in tenant '${existingTenantId}' and cannot be reused in tenant '${tenantId}'`
      );
    }
    const scope = input.scope ?? existing?.scope ?? "tenant";
    const sourceType = input.sourceType ?? inferSourceType(input.repositoryUrl);
    const sourceRef = input.sourceRef ?? existing?.sourceRef ?? input.repositoryUrl;
    const version = input.version ?? existing?.currentVersion ?? existing?.version ?? "0.0.0";

    const validation =
      input.validateOnInstall === false
        ? pendingValidation(nowIso, input.capabilities ?? existing?.capabilities ?? [])
        : validateSkillDefinition({
            checkedAt: nowIso,
            name: input.name,
            description: input.description ?? existing?.description ?? "Installed skill",
            instructions: input.instructions ?? existing?.instructions ?? "No instructions provided.",
            sourceType,
            ...(typeof input.sourcePayloadBase64 === "string"
              ? { sourcePayloadBase64: input.sourcePayloadBase64 }
              : {}),
            ...(Array.isArray(input.capabilities) ? { capabilities: input.capabilities } : {}),
            categories: input.categories ?? existing?.categories ?? []
          });

    const base = (existing ?? {
      id: this.idGenerator(),
      name: input.name,
      description: input.description ?? "Installed skill",
      repositoryUrl: input.repositoryUrl,
      version,
      installed: false,
      categories: input.categories ?? [],
      instructions: input.instructions ?? "No instructions provided.",
      createdAt: nowIso,
      createdBy: actor,
      updatedAt: nowIso,
      updatedBy: actor,
      scope,
      sourceType,
      sourceRef,
      capabilities: validation.capabilities,
      validationStatus: validation.status,
      validationErrors: validation.errors,
      validationWarnings: validation.warnings,
      lastValidatedAt: validation.checkedAt,
      sandboxProfile: input.sandboxProfile ?? defaultSandboxProfile(scope),
      executionConfig: input.executionConfig ?? defaultExecutionConfig(),
      currentVersion: version,
      versionHistory: [],
      metadata: {}
    }) as Skill & { tenantId?: string };
    const baseTenantId = existingTenantId ?? tenantId;

    let error: string | undefined;
    let installed = existing?.installed ?? false;
    const shouldInstall = sourceType === "github";

    if (validation.status === "invalid") {
      error = `Skill validation failed: ${validation.errors.join("; ")}`;
      installed = false;
    } else if (shouldInstall) {
      try {
        const installer = this.options.installer ?? new ShellSkillInstaller();
        await installer.install(base.repositoryUrl);
        installed = true;
      } catch (installError) {
        installed = existing?.installed ?? false;
        error = installError instanceof Error ? installError.message : "Unknown install failure";
      }
    } else {
      installed = true;
    }

    const versionHistory = appendVersionHistory(base.versionHistory, {
      version,
      ...(sourceRef ? { sourceRef } : {}),
      installedAt: nowIso,
      installedBy: actor,
      notes: installed ? "installed" : "install_failed"
    });

    const metadata = {
      ...(base.metadata ?? {}),
      ...(input.metadata ?? {}),
      ...(tenantId ? { tenantId } : existingTenantId ? { tenantId: existingTenantId } : {}),
      sourceType,
      scope,
      ...(input.sourcePayloadBase64
        ? {
            sourcePayloadBytes: decodeSourcePayloadBytes(input.sourcePayloadBase64)
          }
        : {})
    };

    const next = {
      ...base,
      ...(baseTenantId ? { tenantId: baseTenantId } : {}),
      name: input.name,
      repositoryUrl: input.repositoryUrl,
      description: input.description ?? base.description,
      version,
      categories: input.categories ?? base.categories,
      instructions: input.instructions ?? base.instructions,
      installed,
      updatedAt: nowIso,
      updatedBy: actor,
      scope,
      sourceType,
      sourceRef,
      capabilities: validation.capabilities,
      validationStatus: validation.status,
      validationErrors: validation.errors,
      validationWarnings: validation.warnings,
      lastValidatedAt: validation.checkedAt,
      sandboxProfile: input.sandboxProfile ?? base.sandboxProfile ?? defaultSandboxProfile(scope),
      executionConfig: input.executionConfig ?? base.executionConfig ?? defaultExecutionConfig(),
      currentVersion: version,
      versionHistory,
      metadata
    } as Skill & { tenantId?: string };

    const saved = await this.options.store.saveSkill(next);
    return {
      item: saved,
      installed: saved.installed,
      validation,
      ...(error ? { error } : {})
    };
  }

  async validateSkill(skillId: string, actor = "skills_service"): Promise<{ item: Skill; validation: SkillValidationResult }> {
    const existing = await this.options.store.getSkill(skillId);
    if (!existing) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    const checkedAt = this.now().toISOString();
    const validation = validateSkillDefinition({
      checkedAt,
      name: existing.name,
      description: existing.description,
      instructions: existing.instructions,
      sourceType: existing.sourceType ?? inferSourceType(existing.repositoryUrl),
      ...(Array.isArray(existing.capabilities) ? { capabilities: existing.capabilities } : {}),
      categories: existing.categories
    });

    const saved = await this.options.store.saveSkill({
      ...existing,
      capabilities: validation.capabilities,
      validationStatus: validation.status,
      validationErrors: validation.errors,
      validationWarnings: validation.warnings,
      lastValidatedAt: validation.checkedAt,
      updatedAt: checkedAt,
      updatedBy: actor
    });

    return { item: saved, validation };
  }

  async updateSkillVersion(input: {
    skillId: string;
    version: string;
    sourceRef?: string;
    actor?: string;
    notes?: string;
  }): Promise<Skill> {
    const existing = await this.options.store.getSkill(input.skillId);
    if (!existing) {
      throw new Error(`Skill not found: ${input.skillId}`);
    }

    const nowIso = this.now().toISOString();
    const actor = input.actor?.trim() || "skills_service";
    const history = appendVersionHistory(existing.versionHistory, {
      version: input.version,
      ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
      installedAt: nowIso,
      installedBy: actor,
      ...(input.notes ? { notes: input.notes } : { notes: "updated" })
    });

    return this.options.store.saveSkill({
      ...existing,
      version: input.version,
      currentVersion: input.version,
      ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
      versionHistory: history,
      updatedAt: nowIso,
      updatedBy: actor
    });
  }

  async rollbackSkillVersion(input: {
    skillId: string;
    version?: string;
    actor?: string;
    notes?: string;
  }): Promise<Skill> {
    const existing = await this.options.store.getSkill(input.skillId);
    if (!existing) {
      throw new Error(`Skill not found: ${input.skillId}`);
    }

    const history = [...(existing.versionHistory ?? [])];
    if (history.length === 0) {
      throw new Error(`Skill ${existing.id} has no version history`);
    }

    const target = input.version
      ? history.find((entry) => entry.version === input.version)
      : findPreviousVersion(history, existing.currentVersion ?? existing.version);

    if (!target) {
      throw new Error(`No rollback target found for skill ${existing.id}`);
    }

    const nowIso = this.now().toISOString();
    const actor = input.actor?.trim() || "skills_service";

    const nextHistory = appendVersionHistory(history, {
      version: target.version,
      ...(target.sourceRef ? { sourceRef: target.sourceRef } : {}),
      installedAt: nowIso,
      installedBy: actor,
      ...(input.notes ? { notes: input.notes } : { notes: "rollback" })
    });

    return this.options.store.saveSkill({
      ...existing,
      version: target.version,
      currentVersion: target.version,
      ...(target.sourceRef ? { sourceRef: target.sourceRef } : {}),
      versionHistory: nextHistory,
      updatedAt: nowIso,
      updatedBy: actor
    });
  }

  async listVersionHistory(skillId: string): Promise<SkillVersionRecord[]> {
    const existing = await this.options.store.getSkill(skillId);
    if (!existing) {
      throw new Error(`Skill not found: ${skillId}`);
    }
    return [...(existing.versionHistory ?? [])].sort((left, right) =>
      right.installedAt.localeCompare(left.installedAt)
    );
  }

  async setSkillEnabled(input: {
    skillId: string;
    enabled: boolean;
    actor?: string;
    notes?: string;
  }): Promise<Skill> {
    const existing = await this.options.store.getSkill(input.skillId);
    if (!existing) {
      throw new Error(`Skill not found: ${input.skillId}`);
    }

    const nowIso = this.now().toISOString();
    const actor = input.actor?.trim() || "skills_service";
    const currentVersion = existing.currentVersion ?? existing.version;
    const versionHistory = appendVersionHistory(existing.versionHistory, {
      version: currentVersion,
      ...(existing.sourceRef ? { sourceRef: existing.sourceRef } : {}),
      installedAt: nowIso,
      installedBy: actor,
      ...(input.notes
        ? { notes: input.notes }
        : { notes: input.enabled ? "enabled" : "disabled" })
    });

    const metadata = {
      ...(existing.metadata ?? {}),
      lifecycle: {
        at: nowIso,
        actor,
        action: input.enabled ? "enable" : "disable"
      }
    };

    return this.options.store.saveSkill({
      ...existing,
      installed: input.enabled,
      updatedAt: nowIso,
      updatedBy: actor,
      versionHistory,
      metadata
    });
  }

  async uninstallSkill(input: {
    skillId: string;
    actor?: string;
    hardDelete?: boolean;
    notes?: string;
  }): Promise<void | Skill> {
    const existing = await this.options.store.getSkill(input.skillId);
    if (!existing) {
      throw new Error(`Skill not found: ${input.skillId}`);
    }

    if (input.hardDelete === true && this.options.store.deleteSkill) {
      await this.options.store.deleteSkill(input.skillId);
      return;
    }

    return this.setSkillEnabled({
      skillId: input.skillId,
      enabled: false,
      ...(input.actor ? { actor: input.actor } : {}),
      notes: input.notes ?? "uninstalled"
    });
  }

  canActorAccessSkill(skill: Skill, actor: string, tenantId?: string): boolean {
    return canActorAccessSkillScope(skill, actor, tenantId);
  }

  assertActorCanAccessSkill(skill: Skill, actor: string, tenantId?: string): void {
    if (this.canActorAccessSkill(skill, actor, tenantId)) return;
    throw new Error(
      `Actor '${actor}' cannot access ${resolveSkillScope(skill)} scoped skill '${skill.name}'.`
    );
  }

  async executeSkill(input: SkillExecutionInput): Promise<SkillExecutionResult> {
    const skill = await this.options.store.getSkill(input.skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${input.skillId}`);
    }
    const actor = input.actor?.trim() || "skills_service";
    this.assertActorCanAccessSkill(skill, actor, input.tenantId);

    if (!skill.installed) {
      throw new Error(`Skill '${skill.name}' is not installed`);
    }

    if (skill.validationStatus === "invalid") {
      throw new Error(
        `Skill '${skill.name}' is invalid: ${(skill.validationErrors ?? []).join("; ") || "unknown error"}`
      );
    }

    const parsedInput = skillExecutionInputSchema.safeParse(input.input ?? {});
    if (!parsedInput.success) {
      throw new Error(parsedInput.error.issues.map((issue) => issue.message).join("; "));
    }

    const executionResult = await this.executor.execute({
      skill,
      actor,
      ...(typeof input.command === "string" ? { command: input.command } : {}),
      ...(Array.isArray(input.args) ? { args: input.args } : {}),
      ...(input.input ? { input: parsedInput.data } : {}),
      ...(typeof input.confirm === "boolean" ? { confirm: input.confirm } : {})
    });
    const normalizedExecutionResult = normalizeSkillExecutionResult(executionResult, skill.id);

    const nowIso = this.now().toISOString();
    const metadata = {
      ...(skill.metadata ?? {}),
      ...(resolveSkillTenantId(skill) ? { tenantId: resolveSkillTenantId(skill) } : {}),
      lastExecution: {
        at: nowIso,
        actor,
        success: normalizedExecutionResult.success,
        contractVersion: "skill-exec.v1",
        ...(normalizedExecutionResult.error ? { error: normalizedExecutionResult.error } : {})
      }
    };

    await this.options.store.saveSkill({
      ...skill,
      updatedAt: nowIso,
      updatedBy: actor,
      metadata
    });

    return normalizedExecutionResult;
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
    const scope = item.scope;
    const sourceType = item.sourceType;
    const sourceRef = item.sourceRef ?? item.repositoryUrl;

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
          updatedBy: "skills_service",
          scope,
          sourceType,
          sourceRef,
          currentVersion: item.version,
          metadata: {
            ...(existing.metadata ?? {}),
            marketplace: true
          }
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
          updatedBy: "skills_service",
          scope,
          sourceType,
          sourceRef,
          capabilities: detectCapabilities(item.name, item.description, item.instructions, item.categories),
          validationStatus: "pending",
          validationErrors: [],
          validationWarnings: [],
          sandboxProfile: defaultSandboxProfile(scope),
          executionConfig: defaultExecutionConfig(),
          currentVersion: item.version,
          versionHistory: [],
          metadata: {
            marketplace: true
          }
        };

    return this.options.store.saveSkill(next);
  }
}

const normalizeArgs = (value: string[]): string[] =>
  value
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const normalizeAllowlist = (value: string[]): string[] =>
  [...new Set(value.map((entry) => entry.trim()).filter((entry) => entry.length > 0))];

const inferSourceType = (repositoryUrl: string): SkillSourceType => {
  const normalized = repositoryUrl.trim().toLowerCase();
  if (normalized.startsWith("upload://zip/")) return "zip";
  if (normalized.startsWith("upload://file/")) return "file";
  if (normalized.includes("github.com")) return "github";
  return "github";
};

export const resolveSkillScope = (skill: Skill): SkillScope => {
  if (skill.scope === "system" || skill.scope === "tenant" || skill.scope === "user") {
    return skill.scope;
  }
  const taggedScope = skill.categories.find((category) => category.startsWith("scope:"));
  if (taggedScope === "scope:system") return "system";
  if (taggedScope === "scope:user") return "user";
  if (taggedScope === "scope:tenant") return "tenant";
  if (skill.createdBy === "system" || skill.createdBy === "skills_service") return "system";
  if (skill.createdBy.startsWith("user:")) return "user";
  return "tenant";
};

export const resolveSkillTenantId = (skill: Skill): string | undefined => {
  const typedSkill = skill as Skill & { tenantId?: unknown };
  const directTenantId = normalizeTenantId(typedSkill.tenantId);
  if (directTenantId) return directTenantId;

  const metadataTenantId = typedSkill.metadata && typeof typedSkill.metadata === "object"
    ? normalizeTenantId((typedSkill.metadata as Record<string, unknown>).tenantId)
    : undefined;
  return metadataTenantId;
};

const normalizeActorIdentity = (value: string): string => value.trim().replace(/^user:/, "");

const canActorAccessSkillScope = (skill: Skill, actor: string, tenantId?: string): boolean => {
  const skillTenantId = resolveSkillTenantId(skill);
  if (tenantId) {
    if (!skillTenantId || skillTenantId !== tenantId) {
      return false;
    }
  }

  const scope = resolveSkillScope(skill);
  if (scope === "system" || scope === "tenant") {
    return true;
  }
  const actorIdentity = normalizeActorIdentity(actor);
  const createdByIdentity = normalizeActorIdentity(skill.createdBy);
  if (actorIdentity.length === 0 || createdByIdentity.length === 0) {
    return false;
  }
  return actorIdentity === createdByIdentity;
};

const normalizeTenantId = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const defaultSandboxProfile = (scope: SkillScope): SkillSandboxProfile => {
  if (scope === "system") {
    return {
      filesystem: "workspace_only",
      network: true,
      networkAllowlist: [],
      process: true
    };
  }
  if (scope === "tenant") {
    return {
      filesystem: "workspace_only",
      network: false,
      networkAllowlist: [],
      process: true
    };
  }
  return {
    filesystem: "read_only",
    network: false,
    networkAllowlist: [],
    process: false
  };
};

const defaultExecutionConfig = (): SkillExecutionConfig => ({
  commandAllowlist: [],
  requireConfirmation: true,
  timeoutMs: defaultExecutionTimeoutMs,
  entryArgs: []
});

const appendVersionHistory = (
  history: SkillVersionRecord[] | undefined,
  entry: SkillVersionRecord
): SkillVersionRecord[] => [...(history ?? []), entry].slice(-100);

const normalizeExecutionTimeoutMs = (value: number | undefined): number => {
  if (!Number.isFinite(value)) return defaultExecutionTimeoutMs;
  return Math.max(
    minExecutionTimeoutMs,
    Math.min(maxExecutionTimeoutMs, Math.trunc(value ?? defaultExecutionTimeoutMs))
  );
};

const normalizeNetworkAllowlist = (value: string[]): string[] =>
  [
    ...new Set(
      value
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0)
    )
  ];

const safeRealPath = async (targetPath: string): Promise<string> => {
  try {
    return await realpath(targetPath);
  } catch {
    return resolve(targetPath);
  }
};

const normalizePathForComparison = (targetPath: string): string => {
  const resolved = resolve(targetPath);
  return resolved.endsWith("/") ? resolved : `${resolved}/`;
};

const isPathWithin = (targetPath: string, basePath: string): boolean => {
  const normalizedBase = normalizePathForComparison(basePath);
  const normalizedTarget = normalizePathForComparison(targetPath);
  return normalizedTarget === normalizedBase || normalizedTarget.startsWith(normalizedBase);
};

const normalizeNetworkTarget = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (urlTargetPattern.test(trimmed)) {
    try {
      return new URL(trimmed).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
  const hostCandidate = trimmed.replace(/^\[|\]$/g, "");
  if (hostTargetPattern.test(hostCandidate)) {
    return hostCandidate.split(":")[0]?.toLowerCase() ?? null;
  }
  return null;
};

const resolveNetworkTargets = (args: string[]): string[] =>
  [
    ...new Set(
      args
        .map((entry) => normalizeNetworkTarget(entry))
        .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    )
  ];

const matchesNetworkAllowlist = (target: string, pattern: string): boolean => {
  const normalizedTarget = target.trim().toLowerCase();
  const normalizedPattern = pattern.trim().toLowerCase();
  if (!normalizedTarget || !normalizedPattern) return false;
  if (normalizedPattern.startsWith("*.")) {
    const suffix = normalizedPattern.slice(2);
    return (
      normalizedTarget === suffix ||
      normalizedTarget.endsWith(`.${suffix}`)
    );
  }
  return normalizedTarget === normalizedPattern;
};

const isTimeoutError = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const error = value as { code?: string; killed?: boolean; signal?: string };
  return error.code === "ETIMEDOUT" || (error.killed === true && error.signal === "SIGKILL");
};

const validateStrictJsonValue = (
  value: unknown,
  pathPrefix = "$",
  seen = new WeakSet<object>()
): { ok: true } | { ok: false; message: string } => {
  if (value === null) return { ok: true };
  const valueType = typeof value;
  if (valueType === "string" || valueType === "boolean") return { ok: true };
  if (valueType === "number") {
    return Number.isFinite(value)
      ? { ok: true }
      : { ok: false, message: `${pathPrefix} contains non-finite number` };
  }
  if (valueType === "bigint" || valueType === "symbol" || valueType === "function" || valueType === "undefined") {
    return { ok: false, message: `${pathPrefix} contains unsupported value type: ${valueType}` };
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return { ok: false, message: `${pathPrefix} contains circular references` };
    }
    seen.add(value);
    for (let index = 0; index < value.length; index += 1) {
      const current = value[index];
      const validation = validateStrictJsonValue(current, `${pathPrefix}[${index}]`, seen);
      if (!validation.ok) return validation;
    }
    seen.delete(value);
    return { ok: true };
  }
  if (valueType === "object") {
    const objectValue = value as Record<string, unknown>;
    if (seen.has(objectValue)) {
      return { ok: false, message: `${pathPrefix} contains circular references` };
    }
    seen.add(objectValue);
    const prototype = Object.getPrototypeOf(objectValue);
    if (prototype !== Object.prototype && prototype !== null) {
      return { ok: false, message: `${pathPrefix} must be a plain object` };
    }
    for (const [key, current] of Object.entries(objectValue)) {
      if (typeof current === "undefined") {
        return { ok: false, message: `${pathPrefix}.${key} contains undefined value` };
      }
      const validation = validateStrictJsonValue(current, `${pathPrefix}.${key}`, seen);
      if (!validation.ok) return validation;
    }
    seen.delete(objectValue);
    return { ok: true };
  }
  return { ok: false, message: `${pathPrefix} contains unsupported value` };
};

const safeJsonByteLength = (value: unknown): number => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("value is not JSON-serializable");
  }
  return Buffer.byteLength(serialized, "utf8");
};

const toStructuredOutput = (value: unknown): Record<string, unknown> => {
  if (value === null) {
    return {
      kind: "null",
      data: null
    };
  }
  if (Array.isArray(value)) {
    return {
      kind: "array",
      data: value
    };
  }
  if (typeof value === "object") {
    return {
      kind: "object",
      data: value as Record<string, unknown>
    };
  }
  return {
    kind: "primitive",
    data: { value }
  };
};

const normalizeSkillExecutionResult = (
  value: SkillExecutionResult,
  expectedSkillId: string
): SkillExecutionResult => {
  const parsed = skillExecutionResultSchema.parse(value);
  if (parsed.output !== undefined) {
    const strictValidation = validateStrictJsonValue(parsed.output);
    if (!strictValidation.ok) {
      throw new Error(`Skill output is not JSON-serializable: ${strictValidation.message}`);
    }
    safeJsonByteLength(parsed.output);
  }
  const logs = parsed.logs
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 200);
  return {
    success: parsed.success,
    skillId: expectedSkillId,
    logs,
    ...(parsed.output !== undefined ? { output: toStructuredOutput(parsed.output) } : {}),
    ...(typeof parsed.error === "string" ? { error: parsed.error } : {}),
    ...(typeof parsed.patch === "string" ? { patch: parsed.patch } : {}),
    ...(typeof parsed.exitCode === "number" ? { exitCode: parsed.exitCode } : {})
  };
};

const findPreviousVersion = (
  history: SkillVersionRecord[],
  currentVersion: string
): SkillVersionRecord | undefined => {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const candidate = history[index];
    if (candidate && candidate.version !== currentVersion) {
      return candidate;
    }
  }
  return undefined;
};

const decodeSourcePayloadBytes = (sourcePayloadBase64: string): number => {
  try {
    return Buffer.from(sourcePayloadBase64, "base64").byteLength;
  } catch {
    return 0;
  }
};

const pendingValidation = (checkedAt: string, capabilities: string[]): SkillValidationResult => ({
  status: "pending",
  errors: [],
  warnings: [],
  capabilities,
  checkedAt
});

const validateSkillDefinition = (input: {
  checkedAt: string;
  name: string;
  description: string;
  instructions: string;
  sourceType: SkillSourceType;
  sourcePayloadBase64?: string;
  capabilities?: string[];
  categories: string[];
}): SkillValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (input.name.trim().length < 2) {
    errors.push("name must contain at least 2 characters");
  }

  if (input.instructions.trim().length < 16) {
    warnings.push("instructions are very short");
  }

  if ((input.sourceType === "file" || input.sourceType === "zip") && !input.sourcePayloadBase64) {
    errors.push(`source payload is required for ${input.sourceType} source type`);
  }

  if (input.sourcePayloadBase64) {
    let decoded: Buffer;
    try {
      decoded = Buffer.from(input.sourcePayloadBase64, "base64");
    } catch {
      errors.push("source payload is not valid base64");
      decoded = Buffer.alloc(0);
    }

    if (decoded.byteLength === 0) {
      errors.push("source payload is empty");
    }

    if (input.sourceType === "zip") {
      const signature = decoded.subarray(0, 2).toString("utf8");
      if (signature !== "PK") {
        errors.push("zip payload is invalid (missing PK signature)");
      }
    }

    if (decoded.byteLength > 1024 * 1024) {
      warnings.push("source payload is larger than 1MB");
    }
  }

  const capabilities =
    input.capabilities && input.capabilities.length > 0
      ? normalizeAllowlist(input.capabilities)
      : detectCapabilities(input.name, input.description, input.instructions, input.categories);

  return {
    status: errors.length > 0 ? "invalid" : "valid",
    errors,
    warnings,
    capabilities,
    checkedAt: input.checkedAt
  };
};

const detectCapabilities = (
  name: string,
  description: string,
  instructions: string,
  categories: string[]
): string[] => {
  const text = `${name} ${description} ${instructions} ${categories.join(" ")}`.toLowerCase();
  const capabilities: string[] = [];

  const register = (capability: string, hints: string[]): void => {
    if (hints.some((hint) => text.includes(hint))) {
      capabilities.push(capability);
    }
  };

  register("coding", ["code", "typescript", "javascript", "refactor", "bug", "build", "lint", "test"]);
  register("review", ["review", "quality", "verification", "audit"]);
  register("research", ["research", "source", "evidence", "analysis"]);
  register("shell", ["shell", "terminal", "command", "bash", "sh"]);
  register("docker", ["docker", "container", "compose"]);
  register("git", ["git", "commit", "branch", "pull request"]);

  if (capabilities.length === 0) {
    capabilities.push("general");
  }

  return [...new Set(capabilities)];
};

const uniqueSkills = (skills: Skill[]): Skill[] => {
  const map = new Map<string, Skill>();
  for (const skill of skills) {
    map.set(`${skill.name.trim().toLowerCase()}::${skill.repositoryUrl.trim()}`, skill);
  }
  return [...map.values()];
};
