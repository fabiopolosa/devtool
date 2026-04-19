import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type CompanionMode = "local" | "hybrid";

export interface DesktopCompanionConfig {
  apiBaseUrl: string;
  webAppUrl: string;
  authToken: string;
  runnerToken: string;
  tenantId: string;
  autoStartCompanion: boolean;
  companionMode: CompanionMode;
  companionIntervalMs: number;
  companionLimit: number;
  companionAllowlist: string[];
  companionRequireConfirmation: boolean;
  heartbeatIntervalMs: number;
}

export interface DesktopConfigStoreOptions {
  filePath: string;
  readFileFn?: typeof readFile;
  writeFileFn?: typeof writeFile;
  mkdirFn?: typeof mkdir;
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value.trim() : undefined;

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const asNumber = (value: unknown, fallback: number, input: { min?: number; max?: number } = {}): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const min = input.min ?? Number.NEGATIVE_INFINITY;
  const max = input.max ?? Number.POSITIVE_INFINITY;
  return Math.min(max, Math.max(min, Math.trunc(value)));
};

const normalizeAllowlist = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0))];
};

export const defaultDesktopCompanionConfig = (): DesktopCompanionConfig => ({
  apiBaseUrl: "http://localhost:4000",
  webAppUrl: "http://localhost:5173",
  authToken: "",
  runnerToken: "",
  tenantId: "",
  autoStartCompanion: false,
  companionMode: "local",
  companionIntervalMs: 1500,
  companionLimit: 5,
  companionAllowlist: [],
  companionRequireConfirmation: false,
  heartbeatIntervalMs: 5000
});

export const normalizeDesktopCompanionConfig = (
  value: Partial<DesktopCompanionConfig> | Record<string, unknown> | undefined,
  seed: DesktopCompanionConfig = defaultDesktopCompanionConfig()
): DesktopCompanionConfig => {
  const modeRaw = value && "companionMode" in value ? value.companionMode : undefined;
  const mode = modeRaw === "hybrid" ? "hybrid" : seed.companionMode;

  return {
    apiBaseUrl: asString(value?.apiBaseUrl) || seed.apiBaseUrl,
    webAppUrl: asString(value?.webAppUrl) || seed.webAppUrl,
    authToken: asString(value?.authToken) ?? seed.authToken,
    runnerToken: asString(value?.runnerToken) ?? seed.runnerToken,
    tenantId: asString(value?.tenantId) ?? seed.tenantId,
    autoStartCompanion: asBoolean(value?.autoStartCompanion, seed.autoStartCompanion),
    companionMode: mode,
    companionIntervalMs: asNumber(value?.companionIntervalMs, seed.companionIntervalMs, { min: 250, max: 60_000 }),
    companionLimit: asNumber(value?.companionLimit, seed.companionLimit, { min: 1, max: 50 }),
    companionAllowlist: value?.companionAllowlist === undefined ? seed.companionAllowlist : normalizeAllowlist(value?.companionAllowlist),
    companionRequireConfirmation: asBoolean(
      value?.companionRequireConfirmation,
      seed.companionRequireConfirmation
    ),
    heartbeatIntervalMs: asNumber(value?.heartbeatIntervalMs, seed.heartbeatIntervalMs, {
      min: 0,
      max: 300_000
    })
  };
};

export class DesktopConfigStore {
  private readonly readFileFn: typeof readFile;
  private readonly writeFileFn: typeof writeFile;
  private readonly mkdirFn: typeof mkdir;
  private cache: DesktopCompanionConfig | undefined;

  constructor(private readonly options: DesktopConfigStoreOptions) {
    this.readFileFn = options.readFileFn ?? readFile;
    this.writeFileFn = options.writeFileFn ?? writeFile;
    this.mkdirFn = options.mkdirFn ?? mkdir;
  }

  getCached(): DesktopCompanionConfig {
    if (!this.cache) {
      this.cache = defaultDesktopCompanionConfig();
    }
    return this.cache;
  }

  async load(): Promise<DesktopCompanionConfig> {
    try {
      const raw = await this.readFileFn(this.options.filePath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const normalized = normalizeDesktopCompanionConfig(parsed);
      this.cache = normalized;
      return normalized;
    } catch {
      const fallback = defaultDesktopCompanionConfig();
      this.cache = fallback;
      return fallback;
    }
  }

  async save(next: Partial<DesktopCompanionConfig>): Promise<DesktopCompanionConfig> {
    const current = this.cache ?? (await this.load());
    const merged = normalizeDesktopCompanionConfig(next, current);

    await this.mkdirFn(path.dirname(this.options.filePath), { recursive: true });
    await this.writeFileFn(this.options.filePath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

    this.cache = merged;
    return merged;
  }
}
