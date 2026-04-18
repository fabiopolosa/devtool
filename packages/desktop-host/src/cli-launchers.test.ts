import assert from "node:assert/strict";
import test from "node:test";
import type { AgentRuntimeProfile } from "./contracts.js";
import { buildCliLaunchPlan, resolveCliLauncher } from "./cli-launchers.js";

const makeProfile = (overrides: Partial<AgentRuntimeProfile> = {}): AgentRuntimeProfile => ({
  runtimeKind: "desktop_cli",
  vendor: "openai_codex",
  host: "desktop_app",
  launchMode: "interactive",
  args: ["--profile", "default"],
  metadata: {},
  ...overrides
});

test("codex launcher assembles the default executable and preserves args", () => {
  const plan = buildCliLaunchPlan({
    profile: makeProfile(),
    args: ["--task", "bootstrap"],
    cwd: "/workspace"
  });

  assert.equal(plan.command, "codex");
  assert.deepEqual(plan.args, ["--profile", "default", "--task", "bootstrap"]);
  assert.equal(plan.cwd, "/workspace");
});

test("generic launcher keeps explicit command overrides", () => {
  const plan = resolveCliLauncher("generic_cli").buildLaunchPlan({
    profile: makeProfile({
      vendor: "generic_cli",
      command: "agent-runner",
      args: ["--workspace", "proj"]
    }),
    args: ["--dry-run"]
  });

  assert.equal(plan.command, "agent-runner");
  assert.deepEqual(plan.args, ["--workspace", "proj", "--dry-run"]);
});
