import { arch, hostname, platform, release } from "node:os";
import {
  isDesktopCliVendor,
  resolveCliLauncher,
  type CliLaunchPlan,
  type CliLauncher
} from "./cli-launchers.js";
import type { AgentRuntimeHost, AgentRuntimeProfile, AgentRuntimeVendor } from "./contracts.js";
import {
  buildWorkerHostMetadata,
  WorkerRegistrationClient,
  type WorkerRegistrationClientOptions,
  type WorkerRegistrationPayload
} from "./registration-client.js";
import { openWebApp } from "./webapp.js";

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
}

export interface DesktopHostStartResult {
  registrationId: string | null;
  openedWebApp: boolean;
}

export class DesktopHost {
  private readonly registrationClient: WorkerRegistrationClient;
  private readonly opener: (url: string) => Promise<void>;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private registrationId: string | null = null;

  constructor(private readonly options: DesktopHostOptions) {
    const registrationClientOptions: WorkerRegistrationClientOptions = {
      apiBaseUrl: options.apiBaseUrl,
      ...(options.tenantId ? { tenantId: options.tenantId } : {}),
      ...(options.authToken ? { authToken: options.authToken } : {}),
      ...(options.registrationClientOptions ?? {})
    };
    this.registrationClient = options.registrationClient ?? new WorkerRegistrationClient(registrationClientOptions);
    this.opener = options.opener ?? openWebApp;
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
    autoOpenWebApp: process.env.DESKTOP_HOST_OPEN_WEBAPP !== "0"
  });
