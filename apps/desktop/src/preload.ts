const { contextBridge, ipcRenderer } = require("electron") as {
  contextBridge: {
    exposeInMainWorld: (key: string, api: Record<string, unknown>) => void;
  };
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    on: (channel: string, listener: (_event: unknown, payload: unknown) => void) => void;
    removeListener: (channel: string, listener: (_event: unknown, payload: unknown) => void) => void;
  };
};

contextBridge.exposeInMainWorld("desktopShell", {
  getConfig: () => ipcRenderer.invoke("desktop-shell:get-config"),
  getInstalledCliVendors: () => ipcRenderer.invoke("desktop-shell:get-installed-cli-vendors"),
  saveConfig: (next: Record<string, unknown>) =>
    ipcRenderer.invoke("desktop-shell:set-config", next),
  getCompanionStatus: () => ipcRenderer.invoke("desktop-shell:get-companion-status"),
  startCompanion: () => ipcRenderer.invoke("desktop-shell:start-companion"),
  stopCompanion: () => ipcRenderer.invoke("desktop-shell:stop-companion"),
  openExternal: (url: string) => ipcRenderer.invoke("desktop-shell:open-external", url),
  onCompanionStatus: (listener: (status: unknown) => void) => {
    const wrapped = (_event: unknown, payload: unknown): void => {
      listener(payload);
    };
    ipcRenderer.on("desktop-shell:companion-status", wrapped);
    return (): void => {
      ipcRenderer.removeListener("desktop-shell:companion-status", wrapped);
    };
  }
});
