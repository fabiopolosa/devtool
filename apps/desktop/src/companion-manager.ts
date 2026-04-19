import { EventEmitter } from "node:events";
import { hostname } from "node:os";
import type { CompanionMode, DesktopCompanionConfig } from "./config-store.js";

export type CompanionLifecycleState = "stopped" | "starting" | "connected" | "blocked" | "error";

export interface CompanionStatus {
  state: CompanionLifecycleState;
  updatedAt: string;
  message?: string;
  registrationId?: string | null;
}

export interface DesktopHostLike {
  start(): Promise<{ registrationId: string | null; openedWebApp: boolean }>;
  stop(): Promise<void>;
}

export interface CompanionManagerEvents {
  status: (status: CompanionStatus) => void;
}

export interface CompanionHostOptions {
  apiBaseUrl: string;
  webAppUrl: string;
  authToken?: string;
  runnerToken?: string;
  tenantId?: string;
  heartbeatIntervalMs?: number;
  companion: {
    enabled: true;
    mode: CompanionMode;
    intervalMs: number;
    limit: number;
    allowlist: string[];
    requireConfirmation: boolean;
  };
  worker: {
    name: string;
    host: string;
    mode: "local";
    capabilities: string[];
    metadata: Record<string, unknown>;
  };
  autoOpenWebApp: false;
}

export type CompanionHostFactory = (config: DesktopCompanionConfig) => Promise<DesktopHostLike>;

const statusNow = (): string => new Date().toISOString();

export const getCompanionStartBlocker = (config: DesktopCompanionConfig): string | null => {
  if (config.runnerToken.trim().length > 0) return null;
  if (config.authToken.trim().length > 0) return null;
  return "Sign in first, or add a runner token in Desktop Settings before starting the companion.";
};

const toErrorMessage = (error: unknown): string => {
  const rawMessage = error instanceof Error && error.message.trim().length > 0 ? error.message.trim() : "";
  if (!rawMessage) return "Unknown companion error";
  try {
    const parsed = JSON.parse(rawMessage) as { error?: string; message?: string };
    if (parsed.error === "forbidden" && parsed.message?.includes("canRunAgent")) {
      return "Sign in first, or add a valid runner token in Desktop Settings before starting the companion.";
    }
    if (typeof parsed.message === "string" && parsed.message.trim().length > 0) {
      return parsed.message.trim();
    }
  } catch {
    // Non-JSON error; fall back to string heuristics below.
  }
  if (rawMessage.includes("canRunAgent")) {
    return "Sign in first, or add a valid runner token in Desktop Settings before starting the companion.";
  }
  return rawMessage;
};

export const buildCompanionHostOptions = (config: DesktopCompanionConfig): CompanionHostOptions => {
  const host = hostname();
  return {
    apiBaseUrl: config.apiBaseUrl,
    webAppUrl: config.webAppUrl,
    ...(config.authToken ? { authToken: config.authToken } : {}),
    ...(config.runnerToken ? { runnerToken: config.runnerToken } : {}),
    ...(config.tenantId ? { tenantId: config.tenantId } : {}),
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    autoOpenWebApp: false,
    companion: {
      enabled: true,
      mode: config.companionMode,
      intervalMs: config.companionIntervalMs,
      limit: config.companionLimit,
      allowlist: [...config.companionAllowlist],
      requireConfirmation: config.companionRequireConfirmation
    },
    worker: {
      name: `desktop-shell-${host}`,
      host,
      mode: "local",
      capabilities: ["desktop_host", "local_worker"],
      metadata: {
        source: "desktop_shell",
        shell: "electron"
      }
    }
  };
};

const dynamicImportModule = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<{
  createDesktopHost: (options: CompanionHostOptions) => DesktopHostLike;
}>;

export const createDefaultCompanionHostFactory = (): CompanionHostFactory =>
  async (config: DesktopCompanionConfig): Promise<DesktopHostLike> => {
    const module = await dynamicImportModule("@cp/desktop-host");
    return module.createDesktopHost(buildCompanionHostOptions(config));
  };

export class CompanionManager {
  private readonly events = new EventEmitter();
  private readonly hostFactory: CompanionHostFactory;
  private host: DesktopHostLike | undefined;
  private status: CompanionStatus = {
    state: "stopped",
    updatedAt: statusNow()
  };

  constructor(input: { hostFactory?: CompanionHostFactory } = {}) {
    this.hostFactory = input.hostFactory ?? createDefaultCompanionHostFactory();
  }

  getStatus(): CompanionStatus {
    return { ...this.status };
  }

  onStatus(listener: (status: CompanionStatus) => void): () => void {
    this.events.on("status", listener);
    return () => this.events.off("status", listener);
  }

  async start(config: DesktopCompanionConfig): Promise<CompanionStatus> {
    if (this.status.state === "starting") return this.getStatus();
    if (this.status.state === "connected") return this.getStatus();
    const blocker = getCompanionStartBlocker(config);
    if (blocker) {
      this.setStatus({
        state: "blocked",
        message: blocker,
        registrationId: null
      });
      return this.getStatus();
    }

    this.setStatus({
      state: "starting",
      message: "Starting companion..."
    });

    try {
      const host = await this.hostFactory(config);
      const result = await host.start();
      this.host = host;
      this.setStatus({
        state: "connected",
        message: "Companion connected",
        registrationId: result.registrationId
      });
      return this.getStatus();
    } catch (error) {
      this.host = undefined;
      this.setStatus({
        state: "error",
        message: toErrorMessage(error)
      });
      throw error;
    }
  }

  async stop(): Promise<CompanionStatus> {
    const activeHost = this.host;
    this.host = undefined;

    if (!activeHost) {
      this.setStatus({
        state: "stopped",
        message: "Companion stopped",
        registrationId: null
      });
      return this.getStatus();
    }

    try {
      await activeHost.stop();
      this.setStatus({
        state: "stopped",
        message: "Companion stopped",
        registrationId: null
      });
      return this.getStatus();
    } catch (error) {
      this.setStatus({
        state: "error",
        message: toErrorMessage(error)
      });
      throw error;
    }
  }

  async restart(config: DesktopCompanionConfig): Promise<CompanionStatus> {
    await this.stop();
    return this.start(config);
  }

  syncReadiness(config: DesktopCompanionConfig): CompanionStatus {
    if (this.status.state === "connected" || this.status.state === "starting") {
      return this.getStatus();
    }
    const blocker = getCompanionStartBlocker(config);
    this.setStatus({
      state: blocker ? "blocked" : "stopped",
      message: blocker ?? "Companion idle",
      registrationId: null
    });
    return this.getStatus();
  }

  private setStatus(next: Omit<CompanionStatus, "updatedAt">): void {
    this.status = {
      ...next,
      updatedAt: statusNow()
    };
    this.events.emit("status", this.getStatus());
  }
}
