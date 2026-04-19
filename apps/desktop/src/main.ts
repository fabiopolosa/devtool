import { app, BrowserWindow, ipcMain, shell, type WebContents } from "electron";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import {
  DesktopConfigStore,
  type DesktopCompanionConfig
} from "./config-store.js";
import { CompanionManager, getCompanionStartBlocker } from "./companion-manager.js";
import {
  DEFAULT_DESKTOP_SHELL_CONFIG,
  type CompanionLifecycleStatus,
  type DesktopShellConfig
} from "./types.js";

let mainWindow: BrowserWindow | null = null;
let configStore: DesktopConfigStore | null = null;
let companionConfig: DesktopCompanionConfig | null = null;
let shellConfig: DesktopShellConfig = { ...DEFAULT_DESKTOP_SHELL_CONFIG };
const companionManager = new CompanionManager();
const isSmokeMode = process.env.CP_DESKTOP_SMOKE === "1";
let installedCliVendors: string[] = [];

const configFilePath = (): string => path.join(app.getPath("userData"), "desktop-shell-config.json");

const parseAllowlist = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const desktopCliCommandMap = [
  { vendor: "openai_codex", command: "codex" },
  { vendor: "claude_code", command: "claude" },
  { vendor: "gemini_cli", command: "gemini" }
] as const;

const detectInstalledCliVendors = (): string[] =>
  desktopCliCommandMap
    .filter(({ command }) => {
      const result = spawnSync("which", [command], {
        stdio: "ignore"
      });
      return result.status === 0;
    })
    .map(({ vendor }) => vendor);

const toShellConfig = (config: DesktopCompanionConfig): DesktopShellConfig => ({
  apiBaseUrl: config.apiBaseUrl,
  webAppUrl: config.webAppUrl,
  tenantId: config.tenantId,
  authToken: config.authToken,
  runnerToken: config.runnerToken,
  autoStartCompanion: config.autoStartCompanion,
  companionMode: config.companionMode,
  companionRequireConfirmation: config.companionRequireConfirmation,
  companionIntervalMs: config.companionIntervalMs,
  companionLimit: config.companionLimit,
  companionAllowlist: config.companionAllowlist.join(","),
  heartbeatIntervalMs: config.heartbeatIntervalMs
});

const toCompanionPatch = (input: Partial<DesktopShellConfig>): Partial<DesktopCompanionConfig> => {
  const patch: Partial<DesktopCompanionConfig> = {};
  if (typeof input.apiBaseUrl === "string") patch.apiBaseUrl = input.apiBaseUrl.trim();
  if (typeof input.webAppUrl === "string") patch.webAppUrl = input.webAppUrl.trim();
  if (typeof input.tenantId === "string") patch.tenantId = input.tenantId.trim();
  if (typeof input.authToken === "string") patch.authToken = input.authToken.trim();
  if (typeof input.runnerToken === "string") patch.runnerToken = input.runnerToken.trim();
  if (typeof input.autoStartCompanion === "boolean") patch.autoStartCompanion = input.autoStartCompanion;
  if (input.companionMode === "local" || input.companionMode === "hybrid") patch.companionMode = input.companionMode;
  if (typeof input.companionRequireConfirmation === "boolean") {
    patch.companionRequireConfirmation = input.companionRequireConfirmation;
  }
  if (typeof input.companionIntervalMs === "number" && Number.isFinite(input.companionIntervalMs)) {
    patch.companionIntervalMs = Math.trunc(input.companionIntervalMs);
  }
  if (typeof input.companionLimit === "number" && Number.isFinite(input.companionLimit)) {
    patch.companionLimit = Math.trunc(input.companionLimit);
  }
  if (typeof input.heartbeatIntervalMs === "number" && Number.isFinite(input.heartbeatIntervalMs)) {
    patch.heartbeatIntervalMs = Math.trunc(input.heartbeatIntervalMs);
  }
  if (typeof input.companionAllowlist === "string") {
    patch.companionAllowlist = parseAllowlist(input.companionAllowlist);
  }
  return patch;
};

const toShellStatus = (status: ReturnType<CompanionManager["getStatus"]>): CompanionLifecycleStatus => ({
  state: status.state,
  updatedAt: status.updatedAt,
  ...(status.message ? { message: status.message } : {}),
  ...(status.registrationId !== undefined ? { registrationId: status.registrationId } : {})
});

const publishCompanionStatus = (status: CompanionLifecycleStatus): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("desktop-shell:companion-status", status);
    }
  }
};

const safeStartCompanion = async (): Promise<CompanionLifecycleStatus> => {
  if (!companionConfig) {
    throw new Error("Desktop shell config is not ready");
  }
  try {
    const status = await companionManager.start(companionConfig);
    return toShellStatus(status);
  } catch {
    return toShellStatus(companionManager.getStatus());
  }
};

const safeStopCompanion = async (): Promise<CompanionLifecycleStatus> => {
  try {
    await companionManager.stop();
    if (companionConfig) {
      return toShellStatus(companionManager.syncReadiness(companionConfig));
    }
    return toShellStatus(companionManager.getStatus());
  } catch {
    return toShellStatus(companionManager.getStatus());
  }
};

const isSameOrigin = (target: string, reference: string): boolean => {
  try {
    return new URL(target).origin === new URL(reference).origin;
  } catch {
    return false;
  }
};

const wireWebContentsExternalNavigation = (contents: WebContents): void => {
  contents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, targetUrl) => {
    if (isSameOrigin(targetUrl, shellConfig.webAppUrl)) return;
    event.preventDefault();
    void shell.openExternal(targetUrl);
  });
};

const createWindow = async (): Promise<void> => {
  const preloadPath = path.join(__dirname, "preload.js");
  const rendererPath = path.join(__dirname, "renderer.html");

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1200,
    minHeight: 760,
    title: "Devtools Desktop",
    show: !isSmokeMode,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  });

  wireWebContentsExternalNavigation(mainWindow.webContents);
  mainWindow.webContents.on("did-attach-webview", (_event, guest) => {
    wireWebContentsExternalNavigation(guest);
  });

  if (existsSync(rendererPath)) {
    await mainWindow.loadFile(rendererPath);
  } else {
    await mainWindow.loadURL(shellConfig.webAppUrl);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

const applyConfigUpdate = async (input: Partial<DesktopShellConfig>): Promise<DesktopShellConfig> => {
  if (!configStore) throw new Error("Config store is not initialized");

  const previous = companionConfig;
  const patch = toCompanionPatch(input);
  companionConfig = await configStore.save(patch);
  shellConfig = toShellConfig(companionConfig);

  if (previous && companionManager.getStatus().state === "connected") {
    await companionManager.restart(companionConfig);
  } else if (shellConfig.autoStartCompanion && companionManager.getStatus().state === "stopped") {
    await safeStartCompanion();
  } else {
    companionManager.syncReadiness(companionConfig);
  }

  return shellConfig;
};

const registerIpc = (): void => {
  ipcMain.handle("desktop-shell:get-config", async () => shellConfig);
  ipcMain.handle("desktop-shell:get-installed-cli-vendors", async () => [...installedCliVendors]);
  ipcMain.handle("desktop-shell:set-config", async (_event, next: unknown) => {
    const patch = next && typeof next === "object" ? (next as Partial<DesktopShellConfig>) : {};
    return applyConfigUpdate(patch);
  });
  ipcMain.handle("desktop-shell:get-companion-status", async () =>
    toShellStatus(companionManager.getStatus())
  );
  ipcMain.handle("desktop-shell:start-companion", async () => safeStartCompanion());
  ipcMain.handle("desktop-shell:stop-companion", async () => safeStopCompanion());
  ipcMain.handle("desktop-shell:open-external", async (_event, value: unknown) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error("URL is required");
    }
    const target = value.trim();
    const parsed = new URL(target);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Only http/https URLs are supported");
    }
    await shell.openExternal(parsed.toString());
  });
};

const bootstrap = async (): Promise<void> => {
  await app.whenReady();

  configStore = new DesktopConfigStore({
    filePath: configFilePath()
  });
  installedCliVendors = detectInstalledCliVendors();
  companionConfig = await configStore.load();
  shellConfig = toShellConfig(companionConfig);
  companionManager.syncReadiness(companionConfig);

  companionManager.onStatus((status) => {
    publishCompanionStatus(toShellStatus(status));
  });

  registerIpc();
  await createWindow();

  if (isSmokeMode) {
    console.log("[desktop] smoke launch completed");
    app.exit(0);
    return;
  }

  if (shellConfig.autoStartCompanion) {
    if (getCompanionStartBlocker(companionConfig)) {
      companionManager.syncReadiness(companionConfig);
    } else {
      await safeStartCompanion();
    }
  }

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });

  app.on("before-quit", () => {
    void safeStopCompanion();
  });
};

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

void bootstrap().catch((error) => {
  console.error("[desktop] failed to start", error);
  process.exitCode = 1;
});
