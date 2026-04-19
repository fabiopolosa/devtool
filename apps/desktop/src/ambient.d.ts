import type { DesktopShellBridge } from "./types";

declare global {
  interface Window {
    desktopShell?: DesktopShellBridge;
  }
}

export {};
