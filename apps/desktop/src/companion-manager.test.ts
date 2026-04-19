import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCompanionHostOptions,
  CompanionManager,
  getCompanionStartBlocker,
  type DesktopHostLike
} from "./companion-manager.js";
import { defaultDesktopCompanionConfig } from "./config-store.js";

const makeConfig = () => defaultDesktopCompanionConfig();

test("buildCompanionHostOptions maps config into desktop-host options", () => {
  const config = {
    ...makeConfig(),
    apiBaseUrl: "http://api.local",
    webAppUrl: "http://web.local",
    tenantId: "tenant_001",
    authToken: "token_001",
    companionMode: "hybrid" as const,
    companionAllowlist: ["pnpm", "node"],
    companionRequireConfirmation: true
  };

  const options = buildCompanionHostOptions(config);
  assert.equal(options.apiBaseUrl, "http://api.local");
  assert.equal(options.webAppUrl, "http://web.local");
  assert.equal(options.tenantId, "tenant_001");
  assert.equal(options.authToken, "token_001");
  assert.equal(options.companion.mode, "hybrid");
  assert.deepEqual(options.companion.allowlist, ["pnpm", "node"]);
  assert.equal(options.companion.requireConfirmation, true);
  assert.equal(options.autoOpenWebApp, false);
  assert.equal(options.worker.mode, "local");
});

test("CompanionManager transitions to connected after start and stopped after stop", async () => {
  const events: string[] = [];

  const host: DesktopHostLike = {
    start: async () => ({ registrationId: "reg_001", openedWebApp: false }),
    stop: async () => undefined
  };

  const manager = new CompanionManager({
    hostFactory: async () => host
  });

  manager.onStatus((status) => {
    events.push(status.state);
  });

  const started = await manager.start({
    ...makeConfig(),
    authToken: "auth_token"
  });
  assert.equal(started.state, "connected");
  assert.equal(started.registrationId, "reg_001");

  const stopped = await manager.stop();
  assert.equal(stopped.state, "stopped");
  assert.equal(stopped.registrationId, null);

  assert.deepEqual(events.slice(0, 3), ["starting", "connected", "stopped"]);
});

test("CompanionManager reports error when host start fails", async () => {
  const manager = new CompanionManager({
    hostFactory: async () => ({
      start: async () => {
        throw new Error("cannot_connect");
      },
      stop: async () => undefined
    })
  });

  await assert.rejects(async () => {
    await manager.start({
      ...makeConfig(),
      authToken: "auth_token"
    });
  }, /cannot_connect/);

  const status = manager.getStatus();
  assert.equal(status.state, "error");
  assert.equal(status.message, "cannot_connect");
});

test("getCompanionStartBlocker requires auth or runner token", () => {
  assert.match(
    getCompanionStartBlocker(makeConfig()) ?? "",
    /Sign in first/i
  );
  assert.equal(
    getCompanionStartBlocker({
      ...makeConfig(),
      authToken: "auth_token"
    }),
    null
  );
  assert.equal(
    getCompanionStartBlocker({
      ...makeConfig(),
      runnerToken: "runner_token"
    }),
    null
  );
});

test("CompanionManager blocks start before host creation when credentials are missing", async () => {
  let createdHosts = 0;
  const manager = new CompanionManager({
    hostFactory: async () => {
      createdHosts += 1;
      return {
        start: async () => ({ registrationId: "reg_001", openedWebApp: false }),
        stop: async () => undefined
      };
    }
  });

  const status = await manager.start(makeConfig());
  assert.equal(status.state, "blocked");
  assert.match(status.message ?? "", /Sign in first/i);
  assert.equal(createdHosts, 0);
});

test("CompanionManager rewrites canRunAgent permission JSON into a friendly message", async () => {
  const manager = new CompanionManager({
    hostFactory: async () => ({
      start: async () => {
        throw new Error(
          JSON.stringify({
            error: "forbidden",
            message: "Missing required tenant permission: canRunAgent"
          })
        );
      },
      stop: async () => undefined
    })
  });

  await assert.rejects(async () => {
    await manager.start({
      ...makeConfig(),
      authToken: "auth_token"
    });
  });

  const status = manager.getStatus();
  assert.equal(status.state, "error");
  assert.match(status.message ?? "", /valid runner token/i);
});
