import { arch, hostname, platform, release } from "node:os";
import { spawn } from "node:child_process";
import {
  isDesktopCliVendor,
  resolveCliLauncher,
  type CliLaunchPlan,
  type CliLauncher
} from "./cli-launchers.js";
import type { AgentRuntimeHost, AgentRuntimeProfile, AgentRuntimeVendor } from "./contracts.js";
import {
  buildWorkerHostMetadata,
  createWorkerApiClient,
  WorkerRegistrationClient,
  type WorkerApiClient,
  type WorkerRegistrationClientOptions,
  type WorkerRegistrationPayload
} from "./registration-client.js";
import { openWebApp } from "./webapp.js";
import type {
  LocalWorkerMode,
  LocalWorkerRunSummary,
  StartLocalWorkerInput
} from "@cp/worker-local";

type StartLocalWorkerFn = (input: StartLocalWorkerInput) => Promise<LocalWorkerRunSummary>;

let cachedStartLocalWorker: StartLocalWorkerFn | null = null;

const loadStartLocalWorker = async (): Promise<StartLocalWorkerFn> => {
  if (cachedStartLocalWorker) return cachedStartLocalWorker;
  try {
    const module = await import("@cp/worker-local");
    cachedStartLocalWorker = module.startLocalWorker;
    return cachedStartLocalWorker;
  } catch {
    const module = await import("../../worker-local/index.js");
    cachedStartLocalWorker = module.startLocalWorker as StartLocalWorkerFn;
    return cachedStartLocalWorker;
  }
};

export interface DesktopHostWorkerConfig {
  name: string;
  host: string;
  mode?: "local" | "remote";
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

export interface DesktopHostOptions {
  apiBaseUrl: string;
  webAppUrl: string;
  worker: DesktopHostWorkerConfig;
  authToken?: string;
  tenantId?: string;
  autoOpenWebApp?: boolean;
  heartbeatIntervalMs?: number;
  opener?: (url: string) => Promise<void>;
  registrationClient?: WorkerRegistrationClient;
  registrationClientOptions?: Omit<WorkerRegistrationClientOptions, "apiBaseUrl" | "authToken" | "tenantId">;
  launcherRegistry?: Partial<Record<AgentRuntimeVendor, CliLauncher>>;
  runtimeHost?: AgentRuntimeHost;
  companion?: Partial<DesktopHostCompanionConfig>;
}

export interface DesktopHostCompanionConfig {
  enabled: boolean;
  mode: LocalWorkerMode;
  intervalMs: number;
  limit: number;
  allowlist: string[];
  requireConfirmation: boolean;
}

export interface DesktopHostStartResult {
  registrationId: string | null;
  openedWebApp: boolean;
}

export class DesktopHost {
  private readonly registrationClient: WorkerRegistrationClient;
  private readonly workerApiClient: WorkerApiClient;
  private readonly opener: (url: string) => Promise<void>;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private companionTimer: ReturnType<typeof setInterval> | undefined;
  private companionCycleRunning = false;
  private companionStopped = false;
  private registrationId: string | null = null;
  private companionConfig: DesktopHostCompanionConfig;

  constructor(private readonly options: DesktopHostOptions) {
    const registrationClientOptions: WorkerRegistrationClientOptions = {
      apiBaseUrl: options.apiBaseUrl,
      ...(options.tenantId ? { tenantId: options.tenantId } : {}),
      ...(options.authToken ? { authToken: options.authToken } : {}),
      ...(options.registrationClientOptions ?? {})
    };
    this.registrationClient = options.registrationClient ?? new WorkerRegistrationClient(registrationClientOptions);
    this.workerApiClient = createWorkerApiClient(registrationClientOptions);
    this.opener = options.opener ?? openWebApp;
    this.companionConfig = {
      enabled: options.companion?.enabled ?? false,
      mode: options.companion?.mode ?? "local",
      intervalMs: Math.max(250, Math.trunc(options.companion?.intervalMs ?? 1500)),
      limit: Math.max(1, Math.min(50, Math.trunc(options.companion?.limit ?? 5))),
      allowlist: [...new Set((options.companion?.allowlist ?? []).map((entry) => entry.trim()).filter(Boolean))],
      requireConfirmation: options.companion?.requireConfirmation ?? true
    };
  }

  async start(): Promise<DesktopHostStartResult> {
    const openedWebApp = this.options.autoOpenWebApp !== false;
    if (openedWebApp) {
      await this.opener(this.options.webAppUrl);
    }

    const registration = await this.registerWorker();
    this.registrationId = registration.id;

    if (typeof this.options.heartbeatIntervalMs === "number" && this.options.heartbeatIntervalMs > 0) {
      this.startHeartbeatLoop(this.options.heartbeatIntervalMs);
    }
    if (this.companionConfig.enabled) {
      this.startCompanionLoop();
    }

    return {
      registrationId: this.registrationId,
      openedWebApp
    };
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.companionTimer) {
      clearInterval(this.companionTimer);
      this.companionTimer = undefined;
    }
    this.companionStopped = true;
  }

  async registerWorker(): Promise<{ id: string | null; payload: WorkerRegistrationPayload }> {
    return this.registrationClient.registerWorker(
      this.options.worker,
      buildWorkerHostMetadata({
        platform: platform(),
        arch: arch(),
        release: release(),
        nodeVersion: process.version,
        ...(this.options.runtimeHost ? { runtimeHost: this.options.runtimeHost } : {})
      })
    );
  }

  async heartbeat(): Promise<void> {
    if (!this.registrationId) {
      throw new Error("Desktop host worker has not been registered yet");
    }
    await this.registrationClient.heartbeatWorker(
      this.registrationId,
      {
        machineId: this.registrationId,
        ...(this.options.worker.capabilities ? { capabilities: this.options.worker.capabilities } : {}),
        ...(this.options.worker.metadata ? { metadata: this.options.worker.metadata } : {})
      },
      buildWorkerHostMetadata({
        platform: platform(),
        arch: arch(),
        release: release(),
        nodeVersion: process.version,
        ...(this.options.runtimeHost ? { runtimeHost: this.options.runtimeHost } : {})
      })
    );
  }

  buildCliLaunchPlan(profile: AgentRuntimeProfile, args: string[] = []): CliLaunchPlan {
    const launcher = this.resolveLauncher(profile.vendor);
    return launcher.buildLaunchPlan({
      profile,
      args
    });
  }

  private startHeartbeatLoop(intervalMs: number): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeat().catch((error) => {
        console.warn("[desktop-host] heartbeat failed", error);
      });
    }, intervalMs);
  }

  private startCompanionLoop(): void {
    if (this.companionTimer) {
      clearInterval(this.companionTimer);
    }
    this.companionStopped = false;
    void this.runCompanionCycle();
    this.companionTimer = setInterval(() => {
      void this.runCompanionCycle();
    }, this.companionConfig.intervalMs);
  }

  private async runCompanionCycle(): Promise<void> {
    if (this.companionStopped || this.companionCycleRunning || !this.registrationId) {
      return;
    }
    this.companionCycleRunning = true;
    try {
      const startLocalWorker = await loadStartLocalWorker();
      const workerInput: StartLocalWorkerInput = {
        client: this.workerApiClient,
        deps: this.createLocalWorkerDeps(),
        mode: this.companionConfig.mode,
        once: true,
        limit: this.companionConfig.limit,
        machineName: `${this.options.worker.name}-companion`,
        machineHost: this.options.worker.host,
        allowlist: this.companionConfig.allowlist,
        requireConfirmation: this.companionConfig.requireConfirmation
      };
      if (this.options.worker.capabilities && this.options.worker.capabilities.length > 0) {
        workerInput.explicitCapabilities = [...this.options.worker.capabilities];
      }
      const summary = await startLocalWorker(workerInput);
      this.logCompanionSummary(summary);
    } catch (error) {
      console.warn("[desktop-host] companion cycle failed", error);
    } finally {
      this.companionCycleRunning = false;
    }
  }

  private createLocalWorkerDeps(): StartLocalWorkerInput["deps"] {
    return {
      runCommandFn: (
        command: string,
        args: string[],
        options?: { cwd?: string; allowNonZeroExit?: boolean }
      ) =>
        new Promise((resolve, reject) => {
          const child = spawn(command, args, {
            cwd: options?.cwd,
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"]
          });
          let stdout = "";
          let stderr = "";

          child.stdout?.on("data", (chunk) => {
            stdout += chunk.toString();
          });
          child.stderr?.on("data", (chunk) => {
            stderr += chunk.toString();
          });
          child.once("error", reject);
          child.once("close", (code) => {
            const exitCode = code ?? 0;
            if (exitCode !== 0 && !options?.allowNonZeroExit) {
              reject(new Error(stderr.trim() || `Command failed with exit code ${exitCode}`));
              return;
            }
            resolve({ exitCode, stdout, stderr });
          });
        }),
      sleepFn: async (ms: number) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
      },
      out: (line: string) => console.log(`[desktop-host][companion] ${line}`),
      err: (line: string) => console.warn(`[desktop-host][companion] ${line}`),
      confirmExecution: async (command: string) => {
        if (!this.companionConfig.requireConfirmation) return true;
        const answer = await this.promptConfirmation(command);
        return answer;
      }
    };
  }

  private async promptConfirmation(command: string): Promise<boolean> {
    const readline = await import("node:readline/promises");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    try {
      const answer = await rl.question(`Confirm local companion execution: ${command} [y/N] `);
      const normalized = answer.trim().toLowerCase();
      return normalized === "y" || normalized === "yes";
    } finally {
      rl.close();
    }
  }

  private logCompanionSummary(summary: LocalWorkerRunSummary): void {
    console.log(
      `[desktop-host] companion cycle machine=${summary.machineId} mode=${summary.mode} processed=${summary.processed} failures=${summary.failures}`
    );
  }

  private resolveLauncher(vendor: AgentRuntimeVendor): CliLauncher {
    const launcher = this.options.launcherRegistry?.[vendor];
    if (launcher) {
      return launcher;
    }
    if (isDesktopCliVendor(vendor)) {
      return resolveCliLauncher(vendor);
    }
    throw new Error(`No desktop CLI launcher available for vendor ${vendor}`);
  }
}

export const createDesktopHost = (options: DesktopHostOptions): DesktopHost => new DesktopHost(options);

export const createDesktopHostFromEnv = (): DesktopHost =>
  new DesktopHost({
    apiBaseUrl: process.env.DESKTOP_HOST_API_BASE_URL?.trim() || "http://localhost:4000",
    webAppUrl: process.env.DESKTOP_HOST_WEBAPP_URL?.trim() || "http://localhost:5173",
    ...(process.env.DESKTOP_HOST_TENANT_ID?.trim()
      ? { tenantId: process.env.DESKTOP_HOST_TENANT_ID.trim() }
      : {}),
    ...(process.env.DESKTOP_HOST_AUTH_TOKEN?.trim()
      ? { authToken: process.env.DESKTOP_HOST_AUTH_TOKEN.trim() }
      : {}),
    worker: {
      name: process.env.DESKTOP_HOST_WORKER_NAME?.trim() || `desktop-host-${hostname()}`,
      host: process.env.DESKTOP_HOST_WORKER_HOST?.trim() || hostname(),
      mode:
        process.env.DESKTOP_HOST_WORKER_MODE?.trim() === "remote"
          ? "remote"
          : "local",
      capabilities: (() => {
        const raw = process.env.DESKTOP_HOST_WORKER_CAPABILITIES?.split(",")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0);
        return raw && raw.length > 0 ? raw : ["desktop_host", "local_worker"];
      })(),
      metadata: {
        source: "desktop_host",
        ...(process.env.DESKTOP_HOST_WORKER_METADATA
          ? { sourceHint: process.env.DESKTOP_HOST_WORKER_METADATA.trim() }
          : {})
      }
    },
    heartbeatIntervalMs: Number.parseInt(process.env.DESKTOP_HOST_HEARTBEAT_INTERVAL_MS ?? "", 10) || 0,
    autoOpenWebApp: process.env.DESKTOP_HOST_OPEN_WEBAPP !== "0",
    companion: {
      enabled: process.env.DESKTOP_HOST_COMPANION_ENABLED === "1",
      mode: process.env.DESKTOP_HOST_COMPANION_MODE?.trim() === "hybrid" ? "hybrid" : "local",
      intervalMs: Math.max(
        250,
        Number.parseInt(process.env.DESKTOP_HOST_COMPANION_INTERVAL_MS ?? "", 10) || 1500
      ),
      limit: Math.max(1, Math.min(50, Number.parseInt(process.env.DESKTOP_HOST_COMPANION_LIMIT ?? "", 10) || 5)),
      allowlist: (() => {
        const raw = process.env.DESKTOP_HOST_COMPANION_ALLOWLIST?.split(",")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0);
        return raw && raw.length > 0 ? raw : [];
      })(),
      requireConfirmation: process.env.DESKTOP_HOST_COMPANION_REQUIRE_CONFIRMATION !== "0"
    }
  });
