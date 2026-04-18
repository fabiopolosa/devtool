import path from "node:path";
import { fileURLToPath } from "node:url";

export * from "./cli-launchers.js";
export * from "./desktop-host.js";
export * from "./registration-client.js";
export * from "./webapp.js";

const isDirectExecution = (): boolean => {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === path.resolve(entry);
};

const waitForShutdownSignal = async (): Promise<void> =>
  new Promise((resolve) => {
    const resolveOnce = (): void => resolve();
    process.once("SIGINT", resolveOnce);
    process.once("SIGTERM", resolveOnce);
  });

const main = async (): Promise<void> => {
  const { createDesktopHostFromEnv } = await import("./desktop-host.js");
  const host = createDesktopHostFromEnv();
  const result = await host.start();
  console.log(`[desktop-host] registered worker ${result.registrationId ?? "unavailable"}`);
  console.log(`[desktop-host] opened web app: ${result.openedWebApp ? "yes" : "no"}`);
  await waitForShutdownSignal();
  await host.stop();
};

if (isDirectExecution()) {
  void main().catch((error) => {
    console.error("[desktop-host] failed to start", error);
    process.exitCode = 1;
  });
}
