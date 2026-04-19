type CompanionLifecycleState = "stopped" | "starting" | "connected" | "blocked" | "error";
type GuideAction = "start" | "settings" | "dismiss" | "disabled";

interface CompanionLifecycleStatus {
  state: CompanionLifecycleState;
  updatedAt: string;
  message?: string;
  registrationId?: string | null;
}

interface DesktopShellConfig {
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

interface DesktopShellBridge {
  getConfig: () => Promise<DesktopShellConfig>;
  getInstalledCliVendors: () => Promise<string[]>;
  saveConfig: (next: Partial<DesktopShellConfig>) => Promise<DesktopShellConfig>;
  getCompanionStatus: () => Promise<CompanionLifecycleStatus>;
  startCompanion: () => Promise<CompanionLifecycleStatus>;
  stopCompanion: () => Promise<CompanionLifecycleStatus>;
  openExternal: (url: string) => Promise<void>;
  onCompanionStatus: (listener: (status: CompanionLifecycleStatus) => void) => () => void;
}

type WebviewLike = HTMLElement & {
  src: string;
  reload?: () => void;
  addEventListener: (event: string, listener: EventListenerOrEventListenerObject) => void;
};

const defaultConfig: DesktopShellConfig = {
  apiBaseUrl: "http://localhost:4000",
  webAppUrl: "http://localhost:5173",
  tenantId: "tenant_default",
  authToken: "",
  runnerToken: "",
  autoStartCompanion: false,
  companionMode: "local",
  companionIntervalMs: 1500,
  companionLimit: 5,
  heartbeatIntervalMs: 3000,
  companionAllowlist: "echo,pnpm,npm,node,yarn,vitest",
  companionRequireConfirmation: false
};

const fallbackStatus = (): CompanionLifecycleStatus => ({
  state: "stopped",
  message: "Companion idle",
  updatedAt: new Date().toISOString()
});

const sanitizeUrl = (value: string, fallback: string): string => {
  const candidate = value.trim();
  if (!candidate) return fallback;
  try {
    const parsed = new URL(candidate);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
};

const bridge: DesktopShellBridge | undefined = window.desktopShell;
const shellRoot = document.getElementById("shell-root") as HTMLElement;
const companionStatusBadge = document.getElementById("companion-status") as HTMLElement;
const statusHeadline = document.getElementById("status-headline") as HTMLElement;
const apiUrlBadge = document.getElementById("api-url-badge") as HTMLElement;
const webUrlBadge = document.getElementById("web-url-badge") as HTMLElement;
const webview = document.getElementById("devtools-webview") as WebviewLike;
const bridgeWarning = document.getElementById("bridge-warning") as HTMLElement;
const companionMessageBanner = document.getElementById("companion-message-banner") as HTMLElement;
const desktopGuide = document.getElementById("desktop-guide") as HTMLElement;
const guideKicker = document.getElementById("guide-kicker") as HTMLElement;
const guideTitle = document.getElementById("guide-title") as HTMLElement;
const guideCopy = document.getElementById("guide-copy") as HTMLElement;
const guideSteps = document.getElementById("guide-steps") as HTMLOListElement;
const guidePrimaryActionButton = document.getElementById("guide-primary-action") as HTMLButtonElement;
const guideSecondaryActionButton = document.getElementById("guide-secondary-action") as HTMLButtonElement;

const settingsForm = document.getElementById("settings-form") as HTMLFormElement;
const apiBaseUrlInput = document.getElementById("api-base-url") as HTMLInputElement;
const webAppUrlInput = document.getElementById("web-app-url") as HTMLInputElement;
const tenantIdInput = document.getElementById("tenant-id") as HTMLInputElement;
const authTokenInput = document.getElementById("auth-token") as HTMLInputElement;
const runnerTokenInput = document.getElementById("runner-token") as HTMLInputElement;
const autoStartCompanionInput = document.getElementById("autostart-companion") as HTMLInputElement;
const companionModeInput = document.getElementById("companion-mode") as HTMLSelectElement;
const companionAllowlistInput = document.getElementById("companion-allowlist") as HTMLInputElement;
const companionConfirmationInput = document.getElementById("companion-confirmation") as HTMLInputElement;

const startCompanionButton = document.getElementById("start-companion") as HTMLButtonElement;
const stopCompanionButton = document.getElementById("stop-companion") as HTMLButtonElement;
const openProjectsButton = document.getElementById("open-projects") as HTMLButtonElement;
const reloadWebviewButton = document.getElementById("reload-webview") as HTMLButtonElement;
const openExternalWebButton = document.getElementById("open-external-web") as HTMLButtonElement;
const toggleChromeButton = document.getElementById("toggle-chrome") as HTMLButtonElement;
const restoreChromeButton = document.getElementById("restore-chrome") as HTMLButtonElement;
const toggleSettingsButton = document.getElementById("toggle-settings") as HTMLButtonElement;

let currentConfig: DesktopShellConfig = { ...defaultConfig };
let currentStatus: CompanionLifecycleStatus = fallbackStatus();
let chromeCollapsed = false;
let guideDismissed = false;
let installedCliVendors: string[] = [];
let guidePrimaryAction: GuideAction = "start";
let guideSecondaryAction: GuideAction = "dismiss";

const chromeStateStorageKey = "devtools.desktop.chromeCollapsed";
const guideDismissedStorageKey = "devtools.desktop.guideDismissed";

const statusClassMap: Record<CompanionLifecycleState, string> = {
  stopped: "status-stopped",
  starting: "status-starting",
  connected: "status-connected",
  blocked: "status-error",
  error: "status-error"
};

const readChromeCollapsedPreference = (): boolean => {
  try {
    return window.localStorage.getItem(chromeStateStorageKey) === "1";
  } catch {
    return false;
  }
};

const readGuideDismissedPreference = (): boolean => {
  try {
    return window.localStorage.getItem(guideDismissedStorageKey) === "1";
  } catch {
    return false;
  }
};

const writeChromeCollapsedPreference = (value: boolean): void => {
  try {
    window.localStorage.setItem(chromeStateStorageKey, value ? "1" : "0");
  } catch {
    // Ignore storage failures in shell fallback environments.
  }
};

const writeGuideDismissedPreference = (value: boolean): void => {
  try {
    window.localStorage.setItem(guideDismissedStorageKey, value ? "1" : "0");
  } catch {
    // Ignore storage failures in shell fallback environments.
  }
};

const setGuideDismissed = (value: boolean): void => {
  guideDismissed = value;
  writeGuideDismissedPreference(value);
};

const applyChromeState = (collapsed: boolean): void => {
  chromeCollapsed = collapsed;
  shellRoot.classList.toggle("chrome-collapsed", collapsed);
  restoreChromeButton.hidden = !collapsed;
  toggleChromeButton.textContent = collapsed ? "Show chrome" : "Focus mode";
};

const setGuideSteps = (steps: string[]): void => {
  guideSteps.innerHTML = "";
  for (const step of steps) {
    const item = document.createElement("li");
    item.textContent = step;
    guideSteps.appendChild(item);
  }
};

const setMessageBanner = (message?: string): void => {
  if (!message) {
    companionMessageBanner.hidden = true;
    companionMessageBanner.textContent = "";
    return;
  }
  companionMessageBanner.hidden = false;
  companionMessageBanner.textContent = message;
};

const applyGuideVisibility = (): void => {
  const overlayVisible = currentStatus.state !== "connected" && !guideDismissed;
  desktopGuide.classList.toggle("is-hidden", !overlayVisible);
  webview.classList.toggle("is-covered", overlayVisible);
};

const setGuideState = (status: CompanionLifecycleStatus): void => {
  guidePrimaryActionButton.disabled = false;
  guideSecondaryActionButton.disabled = false;
  guideSecondaryActionButton.hidden = false;

  if (status.state === "connected") {
    statusHeadline.textContent = "Machine connected. Open a project and continue building in Devtools.";
    setGuideDismissed(false);
    setMessageBanner(status.message);
    applyGuideVisibility();
    return;
  }

  if (status.state === "blocked") {
    statusHeadline.textContent = "Add access before connecting this machine.";
    guideKicker.textContent = "Access required";
    guideTitle.textContent = "Sign in before connecting the companion";
    guideCopy.textContent =
      "The local bridge needs either your auth token or a runner token before this machine can register.";
    setGuideSteps([
      "Open Desktop Settings.",
      "Paste an auth token after sign-in, or add a runner token.",
      "Connect this machine once access is configured."
    ]);
    guidePrimaryAction = "settings";
    guidePrimaryActionButton.textContent = "Open settings";
    guideSecondaryAction = "dismiss";
    guideSecondaryActionButton.textContent = "Hide guide";
    setMessageBanner(status.message);
    shellRoot.classList.add("settings-open");
    toggleSettingsButton.textContent = "Close settings";
    applyGuideVisibility();
    return;
  }

  if (status.state === "starting") {
    statusHeadline.textContent = "Connecting this machine now.";
    guideKicker.textContent = "Connecting machine";
    guideTitle.textContent = "Bringing this machine online";
    guideCopy.textContent =
      "Devtools is preparing the local companion so you can attach folders and run project commands from here.";
    setGuideSteps([
      "Keep the app open for a moment.",
      "Wait for companion registration.",
      "Open your project once status is connected."
    ]);
    guidePrimaryAction = "disabled";
    guidePrimaryActionButton.textContent = "Starting...";
    guidePrimaryActionButton.disabled = true;
    guideSecondaryAction = "dismiss";
    guideSecondaryActionButton.textContent = "Hide guide";
    setMessageBanner(status.message);
    applyGuideVisibility();
    return;
  }

  if (status.state === "error") {
    statusHeadline.textContent = "Companion connection needs attention.";
    guideKicker.textContent = "Retry setup";
    guideTitle.textContent = "Check settings and try again";
    guideCopy.textContent =
      "Most startup issues come from API URL, runner token, or local permissions for the companion.";
    setGuideSteps([
      "Review API URL and credentials in Desktop Settings.",
      "Retry the companion once the route looks correct.",
      "Use the browser button if you need to sign in again."
    ]);
    guidePrimaryAction = "settings";
    guidePrimaryActionButton.textContent = "Open settings";
    guideSecondaryAction = "dismiss";
    guideSecondaryActionButton.textContent = "Hide guide";
    setMessageBanner(status.message);
    applyGuideVisibility();
    return;
  }

  statusHeadline.textContent = "Connect this machine, open your project, then continue in Devtools.";
  guideKicker.textContent = "Desktop setup";
  guideTitle.textContent = "Connect this machine";
  guideCopy.textContent =
    "Start the companion to attach local folders, run project commands, and open previews through Devtools.";
  setGuideSteps([
    "Review Desktop Settings only if you need different API/Web URLs.",
    "Connect this machine.",
    "Open your project in the embedded Devtools UI."
  ]);
  guidePrimaryAction = "start";
  guidePrimaryActionButton.textContent = "Connect machine";
  guideSecondaryAction = "dismiss";
  guideSecondaryActionButton.textContent = "Hide guide";
  setMessageBanner(status.message);
  applyGuideVisibility();
};

const setFormFromConfig = (config: DesktopShellConfig): void => {
  apiBaseUrlInput.value = config.apiBaseUrl;
  webAppUrlInput.value = config.webAppUrl;
  tenantIdInput.value = config.tenantId;
  authTokenInput.value = config.authToken;
  runnerTokenInput.value = config.runnerToken;
  autoStartCompanionInput.checked = config.autoStartCompanion;
  companionModeInput.value = config.companionMode;
  companionAllowlistInput.value = config.companionAllowlist;
  companionConfirmationInput.checked = config.companionRequireConfirmation;
};

const collectConfigFromForm = (): DesktopShellConfig => ({
  apiBaseUrl: sanitizeUrl(apiBaseUrlInput.value, defaultConfig.apiBaseUrl),
  webAppUrl: sanitizeUrl(webAppUrlInput.value, defaultConfig.webAppUrl),
  tenantId: tenantIdInput.value.trim(),
  authToken: authTokenInput.value.trim(),
  runnerToken: runnerTokenInput.value.trim(),
  autoStartCompanion: autoStartCompanionInput.checked,
  companionMode: companionModeInput.value === "hybrid" ? "hybrid" : "local",
  companionIntervalMs: currentConfig.companionIntervalMs,
  companionLimit: currentConfig.companionLimit,
  heartbeatIntervalMs: currentConfig.heartbeatIntervalMs,
  companionAllowlist: companionAllowlistInput.value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(","),
  companionRequireConfirmation: companionConfirmationInput.checked
});

const buildEmbeddedWebAppUrl = (url: string): string => {
  const target = new URL(url);
  target.searchParams.set("desktopShell", "1");
  if (installedCliVendors.length > 0) {
    target.searchParams.set("availableCli", installedCliVendors.join(","));
  } else {
    target.searchParams.delete("availableCli");
  }
  return target.toString();
};

const applyWebviewUrl = (url: string): void => {
  const embeddedUrl = buildEmbeddedWebAppUrl(url);
  if (webview.src === embeddedUrl) return;
  webview.setAttribute("src", embeddedUrl);
  webview.src = embeddedUrl;
};

const openProjectListInWebview = (): void => {
  try {
    const target = new URL(currentConfig.webAppUrl);
    target.pathname = "/projects";
    target.search = "";
    applyWebviewUrl(target.toString());
  } catch {
    applyWebviewUrl(currentConfig.webAppUrl);
  }
};

const setStatus = (status: CompanionLifecycleStatus): void => {
  currentStatus = status;
  companionStatusBadge.textContent = status.state;
  companionStatusBadge.classList.remove(...Object.values(statusClassMap));
  companionStatusBadge.classList.add(statusClassMap[status.state]);

  startCompanionButton.disabled = status.state === "starting" || status.state === "connected";
  stopCompanionButton.disabled =
    status.state === "starting" || status.state === "stopped" || status.state === "blocked";
  const startLabel = status.state === "blocked" ? "Open settings" : "Connect machine";
  startCompanionButton.textContent = startLabel;

  setGuideState(status);
};

const setConfig = (config: DesktopShellConfig): void => {
  currentConfig = {
    ...defaultConfig,
    ...config,
    apiBaseUrl: sanitizeUrl(config.apiBaseUrl, defaultConfig.apiBaseUrl),
    webAppUrl: sanitizeUrl(config.webAppUrl, defaultConfig.webAppUrl)
  };

  apiUrlBadge.textContent = currentConfig.apiBaseUrl;
  webUrlBadge.textContent = currentConfig.webAppUrl;
  setFormFromConfig(currentConfig);
  applyWebviewUrl(currentConfig.webAppUrl);
};

const loadFromBridge = async (): Promise<void> => {
  if (!bridge) {
    bridgeWarning.hidden = false;
    setConfig(defaultConfig);
    setStatus({
      state: "error",
      message: "Desktop bridge unavailable",
      updatedAt: new Date().toISOString()
    });
    startCompanionButton.disabled = true;
    stopCompanionButton.disabled = true;
    return;
  }

  bridgeWarning.hidden = true;
  const [config, status, nextInstalledCliVendors] = await Promise.all([
    bridge.getConfig(),
    bridge.getCompanionStatus(),
    bridge.getInstalledCliVendors()
  ]);
  installedCliVendors = nextInstalledCliVendors;
  setConfig(config);
  setStatus(status);
};

const openSettings = (): void => {
  shellRoot.classList.add("settings-open");
  toggleSettingsButton.textContent = "Close settings";
  authTokenInput.focus();
};

const runGuideAction = async (action: GuideAction): Promise<void> => {
  if (action === "settings") {
    openSettings();
    return;
  }
  if (action === "start") {
    startCompanionButton.click();
    return;
  }
  if (action === "dismiss") {
    setGuideDismissed(true);
    applyGuideVisibility();
  }
};

const bindEvents = (): void => {
  toggleSettingsButton.addEventListener("click", () => {
    shellRoot.classList.toggle("settings-open");
    toggleSettingsButton.textContent = shellRoot.classList.contains("settings-open") ? "Close settings" : "Settings";
  });

  toggleChromeButton.addEventListener("click", () => {
    const next = !chromeCollapsed;
    applyChromeState(next);
    writeChromeCollapsedPreference(next);
  });

  restoreChromeButton.addEventListener("click", () => {
    applyChromeState(false);
    writeChromeCollapsedPreference(false);
  });

  guidePrimaryActionButton.addEventListener("click", async () => {
    await runGuideAction(guidePrimaryAction);
  });

  guideSecondaryActionButton.addEventListener("click", async () => {
    await runGuideAction(guideSecondaryAction);
  });

  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = collectConfigFromForm();
    if (!bridge) {
      setConfig(payload);
      return;
    }
    const saved = await bridge.saveConfig(payload);
    setConfig(saved);
    setGuideDismissed(false);
    setStatus(currentStatus);
  });

  startCompanionButton.addEventListener("click", async () => {
    if (!bridge) return;
    if (currentStatus.state === "blocked") {
      openSettings();
      return;
    }
    const status = await bridge.startCompanion();
    setGuideDismissed(false);
    setStatus(status);
  });

  stopCompanionButton.addEventListener("click", async () => {
    if (!bridge) return;
    const status = await bridge.stopCompanion();
    setGuideDismissed(false);
    setStatus(status);
  });

  reloadWebviewButton.addEventListener("click", () => {
    if (typeof webview.reload === "function") {
      webview.reload();
      return;
    }
    applyWebviewUrl(currentConfig.webAppUrl);
  });

  openExternalWebButton.addEventListener("click", async () => {
    if (!bridge) return;
    await bridge.openExternal(currentConfig.webAppUrl);
  });

  openProjectsButton.addEventListener("click", () => {
    setGuideDismissed(false);
    openProjectListInWebview();
  });

  if (bridge) {
    bridge.onCompanionStatus((status) => {
      setGuideDismissed(false);
      setStatus(status);
    });
  }

  webview.addEventListener("did-fail-load", () => {
    setMessageBanner("Web app load failed. Check Web URL in settings.");
  });
};

const main = async (): Promise<void> => {
  applyChromeState(readChromeCollapsedPreference());
  guideDismissed = readGuideDismissedPreference();
  bindEvents();
  await loadFromBridge();
};

void main();
