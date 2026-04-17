#!/usr/bin/env node

import { existsSync, rmSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const webRoot = path.join(repoRoot, "apps", "web");

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

const readArgValue = (flag, fallback) => {
  const flagIndex = args.findIndex((item) => item === flag);
  if (flagIndex === -1) return fallback;
  const value = args[flagIndex + 1];
  return value && !value.startsWith("-") ? value : fallback;
};

const port = readArgValue("--port", "5173");
const cacheDir = path.join(webRoot, "node_modules", ".vite");

const listeners = spawnSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
  encoding: "utf8"
});

const activePids = listeners.stdout
  .split(/\s+/)
  .map((entry) => entry.trim())
  .filter(Boolean);

if (activePids.length > 0) {
  console.error(`[dev:web] port ${port} is already in use by PID(s): ${activePids.join(", ")}`);
  console.error("[dev:web] stop the existing frontend server before starting a new one.");
  process.exit(1);
}

if (existsSync(cacheDir)) {
  rmSync(cacheDir, { recursive: true, force: true });
}
console.log(`[dev:web] cleared vite cache at ${cacheDir}`);
console.log(`[dev:web] starting frontend from ${webRoot}`);

const child = spawn("pnpm", ["vite", ...args], {
  cwd: webRoot,
  stdio: "inherit",
  shell: process.platform === "win32"
});

child.on("exit", (code, signal) => {
  if (typeof code === "number") {
    process.exit(code);
  }
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(1);
});
