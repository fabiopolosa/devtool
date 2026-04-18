import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWorkerHeartbeatPayload,
  buildWorkerRegistrationPayload
} from "./registration-client.js";

test("registration payload includes desktop host metadata and normalized defaults", () => {
  const payload = buildWorkerRegistrationPayload(
    {
      name: "desktop-host-alpha",
      host: "andromeda-mac",
      capabilities: ["local_worker", "desktop_host"],
      metadata: { channel: "dev" }
    },
    { platform: "darwin", release: "24.0.0" }
  );

  assert.deepEqual(payload, {
    name: "desktop-host-alpha",
    host: "andromeda-mac",
    mode: "local",
    capabilities: ["local_worker", "desktop_host"],
    metadata: {
      executionType: "desktop_host",
      platform: "darwin",
      release: "24.0.0",
      channel: "dev"
    }
  });
});

test("heartbeat payload keeps explicit status and metadata", () => {
  const payload = buildWorkerHeartbeatPayload(
    {
      machineId: "machine-1",
      status: "maintenance",
      capabilities: ["desktop_host"],
      metadata: { revision: "abc123" }
    },
    { platform: "linux" }
  );

  assert.deepEqual(payload, {
    status: "maintenance",
    capabilities: ["desktop_host"],
    metadata: {
      executionType: "desktop_host",
      platform: "linux",
      revision: "abc123"
    }
  });
});
