export type CompanionLifecycleState = "stopped" | "starting" | "connected" | "blocked" | "error";

export interface CompanionLifecycleStatus {
  state: CompanionLifecycleState;
  updatedAt: string;
  message?: string;
  registrationId?: string | null;
}

export interface DesktopShellConfig {
  apiBaseUrl: string;
  webAppUrl: string;
  tenantId: string;
  authToken: string;
  runnerToken: string;
  autoStartCompanion: boolean;
  companionMode: "local" | "hybrid";
  companionRequireConfirmation: boolean;
  companionIntervalMs: number;
  companionLimit: number;
  companionAllowlist: string;
  heartbeatIntervalMs: number;
}

export const DEFAULT_DESKTOP_SHELL_CONFIG: DesktopShellConfig = {
  apiBaseUrl: "http://localhost:4000",
  webAppUrl: "http://localhost:5173",
  tenantId: "tenant_default",
  authToken: "",
  runnerToken: "",
  autoStartCompanion: false,
  companionMode: "local",
  companionRequireConfirmation: false,
  companionIntervalMs: 1500,
  companionLimit: 5,
  companionAllowlist: "",
  heartbeatIntervalMs: 3000
};

export interface DesktopShellBridge {
  getConfig: () => Promise<DesktopShellConfig>;
  getInstalledCliVendors: () => Promise<string[]>;
  saveConfig: (next: Partial<DesktopShellConfig>) => Promise<DesktopShellConfig>;
  getCompanionStatus: () => Promise<CompanionLifecycleStatus>;
  startCompanion: () => Promise<CompanionLifecycleStatus>;
  stopCompanion: () => Promise<CompanionLifecycleStatus>;
  openExternal: (url: string) => Promise<void>;
  onCompanionStatus: (listener: (status: CompanionLifecycleStatus) => void) => () => void;
}

declare global {
  interface Window {
    desktopShell?: DesktopShellBridge;
  }
}

export {};
