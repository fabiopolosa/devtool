import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkerApiClient,
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

test("worker api client posts JSON to execution endpoints", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const client = createWorkerApiClient({
    apiBaseUrl: "http://localhost:4000",
    fetchFn: async (input, init) => {
      calls.push({
        url: String(input),
        body: String(init?.body ?? "")
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  const response = await client.post<{ ok: boolean }>("/execution/workers/register", {
    name: "desktop-host"
  });

  assert.deepEqual(response, { ok: true });
  assert.equal(calls[0]?.url, "http://localhost:4000/execution/workers/register");
  assert.equal(calls[0]?.body, JSON.stringify({ name: "desktop-host" }));
});
