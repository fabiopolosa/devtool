import assert from "node:assert/strict";
import test from "node:test";
import {
  DesktopConfigStore,
  defaultDesktopCompanionConfig,
  normalizeDesktopCompanionConfig
} from "./config-store.js";

test("normalizeDesktopCompanionConfig preserves seeded mode and allowlist for partial input", () => {
  const seed = {
    ...defaultDesktopCompanionConfig(),
    companionMode: "hybrid" as const,
    companionAllowlist: ["pnpm", "node"],
    runnerToken: "runner_token_seeded"
  };

  const normalized = normalizeDesktopCompanionConfig({ apiBaseUrl: "http://api.local" }, seed);

  assert.equal(normalized.apiBaseUrl, "http://api.local");
  assert.equal(normalized.companionMode, "hybrid");
  assert.deepEqual(normalized.companionAllowlist, ["pnpm", "node"]);
  assert.equal(normalized.runnerToken, "runner_token_seeded");
});

test("DesktopConfigStore.save preserves existing local config when patching one field", async () => {
  const writes: Array<{ path: string; content: string; encoding: string }> = [];
  const readFileFn = (async () =>
    JSON.stringify({
      ...defaultDesktopCompanionConfig(),
      companionMode: "hybrid",
      companionAllowlist: ["pnpm", "node"],
      runnerToken: "runner_token_seeded"
    })) as any;
  const writeFileFn = (async (filePath: any, content: any, encoding: any) => {
    writes.push({
      path: String(filePath),
      content: typeof content === "string" ? content : Buffer.from(content).toString("utf8"),
      encoding: String(encoding ?? "utf8")
    });
  }) as any;
  const mkdirFn = (async () => undefined) as any;

  const store = new DesktopConfigStore({
    filePath: "/tmp/desktop-shell-config.json",
    readFileFn,
    writeFileFn,
    mkdirFn
  });

  await store.load();
  const saved = await store.save({ apiBaseUrl: "http://api.local" });

  assert.equal(saved.apiBaseUrl, "http://api.local");
  assert.equal(saved.companionMode, "hybrid");
  assert.deepEqual(saved.companionAllowlist, ["pnpm", "node"]);
  assert.equal(saved.runnerToken, "runner_token_seeded");
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.path, "/tmp/desktop-shell-config.json");
});
