import { spawn } from "node:child_process";

export interface OpenWebAppCommand {
  command: string;
  args: string[];
}

export const buildOpenWebAppCommand = (url: string, platform: NodeJS.Platform = process.platform): OpenWebAppCommand => {
  if (platform === "darwin") {
    return { command: "open", args: [url] };
  }
  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", url] };
  }
  return { command: "xdg-open", args: [url] };
};

export const openWebApp = async (url: string, platform: NodeJS.Platform = process.platform): Promise<void> => {
  const { command, args } = buildOpenWebAppCommand(url, platform);
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
};
