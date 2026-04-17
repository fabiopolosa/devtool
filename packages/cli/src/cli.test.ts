import { describe, expect, it, vi } from "vitest";
import { _internal, runCli } from "./cli.js";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

const createDeps = (overrides: {
  fetchFn: typeof fetch;
  env?: NodeJS.ProcessEnv;
  tokenFile?: string;
  executionConfigFile?: string;
  runCommandFn?: (
    command: string,
    args: string[],
    options?: { cwd?: string; allowNonZeroExit?: boolean }
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
}) => {
  const out: string[] = [];
  const err: string[] = [];
  const files = new Map<string, string>();

  if (overrides.tokenFile !== undefined) {
    files.set("/tmp/.devtools/token", overrides.tokenFile);
  }
  if (overrides.executionConfigFile !== undefined) {
    files.set("/tmp/.devtools/config", overrides.executionConfigFile);
  }

  const deps = {
    fetchFn: overrides.fetchFn,
    env: overrides.env ?? {},
    homeDirFn: () => "/tmp",
    readFileFn: vi.fn(async (path: string) => {
      const value = files.get(path);
      if (value === undefined) throw new Error("missing");
      return value;
    }),
    writeFileFn: vi.fn(async (path: string, data: string) => {
      files.set(path, data);
    }),
    mkdirFn: vi.fn(async () => {}),
    runCommandFn:
      overrides.runCommandFn ??
      (vi.fn(async () => ({
        exitCode: 0,
        stdout: "",
        stderr: ""
      })) as unknown as (
        command: string,
        args: string[],
        options?: { cwd?: string; allowNonZeroExit?: boolean }
      ) => Promise<{ exitCode: number; stdout: string; stderr: string }>),
    sleepFn: vi.fn(async () => {}),
    openExternalFn: vi.fn(async () => {}),
    out: (line: string) => out.push(line),
    err: (line: string) => err.push(line)
  };

  return { deps, out, err, files };
};

describe("cli args", () => {
  it("parses long flags and no-flags", () => {
    const parsed = _internal.parseArgs([
      "coding",
      "run",
      "--request",
      "add tests",
      "--no-auto-approve",
      "--json"
    ]);

    expect(parsed.positional).toEqual(["coding", "run"]);
    expect(parsed.flags.request).toBe("add tests");
    expect(parsed.flags["auto-approve"]).toBe(false);
    expect(parsed.flags.json).toBe(true);
  });
});

describe("runCli", () => {
  it("lists projects with readable table output", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        items: [
          { id: "p1", key: "alpha", name: "Alpha", status: "active" },
          { id: "p2", key: "beta", name: "Beta", status: "paused" }
        ]
      })
    );

    const { deps, out, err } = createDeps({ fetchFn });
    const code = await runCli(["project", "list"], deps);

    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out.join("\n")).toContain("ID");
    expect(out.join("\n")).toContain("alpha");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("tests provider connection using api key auth and prints rate limits", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = new URL(raw);
      const path = `${url.pathname}${url.search}`;
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-key")).toBe("api-key-123");

      if (path === "/providers/config") {
        return jsonResponse({
          items: [
            {
              id: "cfg_openai",
              provider: "openai",
              providerId: "openai",
              enabled: true,
              validationStatus: "valid"
            }
          ]
        });
      }

      if (path === "/providers/config/cfg_openai/test") {
        return jsonResponse({
          status: "ok",
          latencyMs: 120,
          models: ["gpt-5.1", "gpt-5.1-mini"],
          rateLimit: {
            rpm: { used: 42, limit: 60 },
            tpm: { used: 12000, limit: 100000 }
          },
          item: {
            id: "cfg_openai",
            provider: "openai",
            providerId: "openai",
            enabled: true,
            validationStatus: "valid"
          }
        });
      }

      return jsonResponse({ message: "not_found" }, 404);
    });

    const { deps, out, err } = createDeps({
      fetchFn,
      env: { DEVTOOLS_API_KEY: "api-key-123" }
    });

    const code = await runCli(["providers", "test", "openai", "--base-url", "http://localhost:4000"], deps);

    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out.join("\n")).toContain("OK Provider test passed");
    expect(out.join("\n")).toContain("Rate limit: 42/60 rpm, 12000/100000 tpm");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("sets current project with project use", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = new URL(raw);
      if (url.pathname === "/projects") {
        return jsonResponse({
          items: [
            { id: "prj_001", key: "alpha", name: "Alpha", status: "active" }
          ]
        });
      }
      return jsonResponse({ message: "not_found" }, 404);
    });

    const { deps, out, err, files } = createDeps({ fetchFn });
    const code = await runCli(["project", "use", "alpha"], deps);

    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out.join("\n")).toContain("OK Current project selected");
    const configRaw = files.get("/tmp/.devtools/cli.json");
    expect(configRaw).toBeDefined();
    expect(configRaw).toContain("prj_001");
  });

  it("lists running jobs filtered by status", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = new URL(raw);
      const path = `${url.pathname}${url.search}`;
      if (path === "/jobs?status=running") {
        return jsonResponse({
          items: [
            {
              id: "job_001",
              type: "generation",
              title: "Generate patch",
              status: "running",
              priority: 10,
              actionRequired: false,
              updatedAt: "2026-04-16T10:00:00.000Z"
            }
          ]
        });
      }
      return jsonResponse({ items: [] });
    });

    const { deps, out, err } = createDeps({ fetchFn });
    const code = await runCli(["jobs", "list", "--status", "running", "--all"], deps);

    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out.join("\n")).toContain("job_001");
    expect(out.join("\n")).toContain("running");
  });

  it("runs init flow and creates project/provider template with json output", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = new URL(raw);
      const path = `${url.pathname}${url.search}`;
      const method = (init?.method ?? "GET").toUpperCase();

      if (method === "POST" && path === "/projects") {
        return jsonResponse({ item: { id: "prj_boot", key: "bootstrap", name: "Bootstrap", status: "active" } });
      }
      if (method === "GET" && path === "/providers/config") {
        return jsonResponse({ items: [] });
      }
      if (method === "POST" && path === "/providers/config") {
        return jsonResponse({
          item: {
            id: "cfg_openai",
            provider: "openai",
            providerId: "openai",
            enabled: false,
            validationStatus: "invalid"
          }
        });
      }

      return jsonResponse({ message: "not_found" }, 404);
    });

    const { deps, out, err, files } = createDeps({ fetchFn });
    const code = await runCli(["init", "Bootstrap", "--json"], deps);

    expect(code).toBe(0);
    expect(err).toEqual([]);
    const payload = JSON.parse(out.join("\n")) as { status: string; action: string; project: { id: string } };
    expect(payload.status).toBe("ok");
    expect(payload.action).toBe("init");
    expect(payload.project.id).toBe("prj_boot");
    const configRaw = files.get("/tmp/.devtools/cli.json");
    expect(configRaw).toContain("prj_boot");
  });

  it("tails logs once in json mode", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = new URL(raw);
      const path = `${url.pathname}${url.search}`;

      if (path === "/jobs?status=running") {
        return jsonResponse({
          items: [
            {
              id: "job_live",
              type: "generation",
              title: "Live job",
              status: "running",
              priority: 1,
              actionRequired: false,
              updatedAt: "2026-04-16T10:00:00.000Z"
            }
          ]
        });
      }

      if (path === "/jobs/job_live/runtime") {
        return jsonResponse({
          item: {
            logs: [
              {
                timestamp: "2026-04-16T10:00:00.000Z",
                event: "start",
                message: "start type=generation"
              }
            ]
          }
        });
      }

      return jsonResponse({ items: [] });
    });

    const { deps, out, err } = createDeps({ fetchFn });
    const code = await runCli(["logs", "tail", "--once", "--json"], deps);

    expect(code).toBe(0);
    expect(err).toEqual([]);
    const payload = JSON.parse(out.join("\n")) as { status: string; lines: Array<{ jobId: string }> };
    expect(payload.status).toBe("ok");
    expect(payload.lines[0]?.jobId).toBe("job_live");
  });

  it("propagates execution mode to coding workflow create and approvals", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = new URL(raw);
      const method = (init?.method ?? "GET").toUpperCase();
      const path = `${url.pathname}${url.search}`;
      const payload = init?.body ? JSON.parse(init.body.toString()) as Record<string, unknown> : {};

      if (method === "POST" && path === "/projects/prj_001/coding-workflows") {
        expect(payload.mode).toBe("local");
        return jsonResponse({
          jobId: "job_create_001",
          status: "pending"
        });
      }
      if (method === "GET" && path === "/jobs/job_create_001") {
        return jsonResponse({
          item: { id: "job_create_001", status: "done" }
        });
      }
      if (method === "GET" && path === "/projects/prj_001/coding-workflows") {
        return jsonResponse({
          items: [{ id: "wf_001", state: "awaiting_plan_approval", title: "Flow", updatedAt: "2026-04-16T10:00:00.000Z" }]
        });
      }
      if (method === "POST" && path === "/projects/prj_001/coding-workflows/wf_001/plan/approve") {
        expect(payload.mode).toBe("local");
        return jsonResponse({
          jobId: "job_plan_001",
          status: "pending"
        });
      }
      if (method === "GET" && path === "/jobs/job_plan_001") {
        return jsonResponse({
          item: { id: "job_plan_001", status: "done" }
        });
      }
      if (method === "POST" && path === "/projects/prj_001/coding-workflows/wf_001/patch/approve") {
        expect(payload.mode).toBe("local");
        return jsonResponse({
          jobId: "job_patch_001",
          status: "pending"
        });
      }
      if (method === "GET" && path === "/jobs/job_patch_001") {
        return jsonResponse({
          item: { id: "job_patch_001", status: "done" }
        });
      }
      if (method === "GET" && path === "/projects/prj_001/coding-workflows/wf_001") {
        return jsonResponse({
          item: { id: "wf_001", state: "done", title: "Flow", generatedTaskIds: ["t1"] }
        });
      }

      return jsonResponse({ message: "not_found" }, 404);
    });

    const { deps, out, err } = createDeps({ fetchFn });
    const code = await runCli(
      ["coding", "run", "--project", "prj_001", "--request", "Implement route", "--mode", "local"],
      deps
    );

    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out.join("\n")).toContain("final: done");
  });

  it("auto-selects local mode for coding run when an active local worker is available", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = new URL(raw);
      const method = (init?.method ?? "GET").toUpperCase();
      const path = `${url.pathname}${url.search}`;
      const payload = init?.body ? (JSON.parse(init.body.toString()) as Record<string, unknown>) : {};

      if (method === "GET" && path === "/machines") {
        return jsonResponse({
          items: [
            {
              id: "machine_local_1",
              status: "online",
              agents: ["local-worker"],
              services: ["shell", "internal_runner"],
              lastHeartbeatAt: new Date().toISOString(),
              metadata: { execution: { mode: "local" } }
            }
          ]
        });
      }

      if (method === "POST" && path === "/projects/prj_001/coding-workflows") {
        expect(payload.mode).toBe("local");
        return jsonResponse({
          jobId: "job_create_local",
          status: "pending"
        });
      }
      if (method === "GET" && path === "/jobs/job_create_local") {
        return jsonResponse({
          item: { id: "job_create_local", status: "done" }
        });
      }
      if (method === "GET" && path === "/projects/prj_001/coding-workflows") {
        return jsonResponse({
          items: [{ id: "wf_auto_local", state: "awaiting_plan_approval", title: "Flow", updatedAt: "2026-04-16T10:00:00.000Z" }]
        });
      }
      if (method === "POST" && path === "/projects/prj_001/coding-workflows/wf_auto_local/plan/approve") {
        expect(payload.mode).toBe("local");
        return jsonResponse({
          jobId: "job_plan_local",
          status: "pending"
        });
      }
      if (method === "GET" && path === "/jobs/job_plan_local") {
        return jsonResponse({
          item: { id: "job_plan_local", status: "done" }
        });
      }
      if (method === "POST" && path === "/projects/prj_001/coding-workflows/wf_auto_local/patch/approve") {
        expect(payload.mode).toBe("local");
        return jsonResponse({
          jobId: "job_patch_local",
          status: "pending"
        });
      }
      if (method === "GET" && path === "/jobs/job_patch_local") {
        return jsonResponse({
          item: { id: "job_patch_local", status: "done" }
        });
      }
      if (method === "GET" && path === "/projects/prj_001/coding-workflows/wf_auto_local") {
        return jsonResponse({
          item: { id: "wf_auto_local", state: "completed", title: "Flow", generatedTaskIds: [] }
        });
      }

      return jsonResponse({ message: "not_found" }, 404);
    });

    const { deps, out, err } = createDeps({ fetchFn });
    const code = await runCli(
      ["coding", "run", "--project", "prj_001", "--request", "Build backend"],
      deps
    );

    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out.join("\n")).toContain("mode: local (active local worker");
    expect(out.join("\n")).toContain("final: completed");
  });

  it("starts local worker, claims one job, and completes it", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = new URL(raw);
      const method = (init?.method ?? "GET").toUpperCase();
      const path = `${url.pathname}${url.search}`;

      if (method === "POST" && path === "/execution/workers/register") {
        return jsonResponse({
          item: { id: "mach_local", name: "test-worker", host: "localhost", services: ["shell"] }
        });
      }
      if (method === "POST" && path === "/execution/workers/mach_local/heartbeat") {
        return jsonResponse({
          item: { id: "mach_local", name: "test-worker", host: "localhost", services: ["shell"] }
        });
      }
      if (method === "POST" && path === "/execution/jobs/claim") {
        return jsonResponse({
          items: [
            {
              id: "job_local_001",
              type: "system",
              title: "Run local command",
              status: "running",
              priority: 1,
              actionRequired: false,
              updatedAt: "2026-04-16T10:00:00.000Z",
              payload: {
                execution: { adapter: "shell" },
                localExecution: { command: "echo hi" }
              }
            }
          ]
        });
      }
      if (method === "POST" && path === "/execution/jobs/job_local_001/complete") {
        return jsonResponse({
          item: { id: "job_local_001", status: "done" }
        });
      }
      return jsonResponse({ message: "not_found" }, 404);
    });

    const runCommandFn = vi.fn(async () => ({
      exitCode: 0,
      stdout: "hi\n",
      stderr: ""
    }));
    const { deps, out, err } = createDeps({ fetchFn, runCommandFn });
    const code = await runCli(["worker", "start", "--once", "--yes", "--json"], deps);

    expect(code).toBe(0);
    expect(err).toEqual([]);
    const payload = JSON.parse(out.join("\n")) as { action: string; processed: number; machineId: string };
    expect(payload.action).toBe("worker.start");
    expect(payload.processed).toBe(1);
    expect(payload.machineId).toBe("mach_local");
  });

  it("starts worker in local mode when profile default is remote", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = new URL(raw);
      const method = (init?.method ?? "GET").toUpperCase();
      const path = `${url.pathname}${url.search}`;

      if (method === "POST" && path === "/execution/workers/register") {
        const body = init?.body ? (JSON.parse(init.body.toString()) as Record<string, unknown>) : {};
        expect(body.mode).toBe("local");
        return jsonResponse({
          item: { id: "mach_default_local", name: "test-worker", host: "localhost", services: ["shell"] }
        });
      }
      if (method === "POST" && path === "/execution/workers/mach_default_local/heartbeat") {
        return jsonResponse({
          item: { id: "mach_default_local", name: "test-worker", host: "localhost", services: ["shell"] }
        });
      }
      if (method === "POST" && path === "/execution/jobs/claim") {
        return jsonResponse({ items: [] });
      }
      return jsonResponse({ message: "not_found" }, 404);
    });

    const { deps, out, err } = createDeps({
      fetchFn,
      executionConfigFile: JSON.stringify({ defaultMode: "remote" })
    });
    const code = await runCli(["worker", "start", "--once", "--yes", "--json"], deps);

    expect(code).toBe(0);
    expect(err).toEqual([]);
    const payload = JSON.parse(out.join("\n")) as { mode: string };
    expect(payload.mode).toBe("local");
  });

  it("shows worker status with capabilities and heartbeat", async () => {
    const now = new Date().toISOString();
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = new URL(raw);
      if (url.pathname === "/machines") {
        return jsonResponse({
          items: [
            {
              id: "machine_local_1",
              status: "online",
              services: ["shell", "internal_runner"],
              lastHeartbeatAt: now,
              metadata: { execution: { mode: "local" } }
            }
          ]
        });
      }
      return jsonResponse({ message: "not_found" }, 404);
    });

    const { deps, out, err } = createDeps({ fetchFn });
    const code = await runCli(["worker", "status"], deps);

    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out.join("\n")).toContain("machine_local_1");
    expect(out.join("\n")).toContain("running");
    expect(out.join("\n")).toContain("shell");
  });

  it("marks worker offline with worker stop", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = new URL(raw);
      const method = (init?.method ?? "GET").toUpperCase();
      const path = `${url.pathname}${url.search}`;
      if (method === "GET" && path === "/machines") {
        return jsonResponse({
          items: [
            {
              id: "machine_local_1",
              status: "online",
              services: ["shell", "internal_runner"],
              lastHeartbeatAt: new Date().toISOString(),
              metadata: { execution: { mode: "local" } }
            }
          ]
        });
      }
      if (method === "POST" && path === "/execution/workers/machine_local_1/heartbeat") {
        const payload = init?.body ? (JSON.parse(init.body.toString()) as Record<string, unknown>) : {};
        expect(payload.status).toBe("offline");
        return jsonResponse({ item: { id: "machine_local_1" } });
      }
      return jsonResponse({ message: "not_found" }, 404);
    });

    const { deps, out, err } = createDeps({ fetchFn });
    const code = await runCli(["worker", "stop"], deps);

    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out.join("\n")).toContain("OK Worker marked offline");
    expect(out.join("\n")).toContain("machine_local_1");
  });

  it("attaches a project workspace path", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = new URL(raw);
      const method = (init?.method ?? "GET").toUpperCase();
      const path = `${url.pathname}${url.search}`;

      if (method === "GET" && path === "/projects") {
        return jsonResponse({
          items: [{ id: "prj_001", key: "alpha", name: "Alpha", status: "active" }]
        });
      }

      if (method === "GET" && path === "/workspaces?projectId=prj_001") {
        return jsonResponse({ items: [] });
      }

      if (method === "POST" && path === "/workspaces") {
        const payload = init?.body ? (JSON.parse(init.body.toString()) as Record<string, unknown>) : {};
        expect(payload.projectId).toBe("prj_001");
        expect(payload.mode).toBe("local");
        expect(payload.localPath).toBe("/Users/andromeda/devtool");
        return jsonResponse({
          item: {
            id: "ws_001",
            tenantId: "tenant_default",
            projectId: "prj_001",
            mode: "local",
            localPath: "/Users/andromeda/devtool",
            runtimeStatus: "stopped",
            runtimeDetails: {},
            createdAt: "2026-04-16T10:00:00.000Z",
            updatedAt: "2026-04-16T10:00:00.000Z"
          }
        });
      }

      return jsonResponse({ message: "not_found" }, 404);
    });

    const { deps, out, err } = createDeps({ fetchFn });
    const code = await runCli(["workspace", "attach", "/Users/andromeda/devtool"], deps);

    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out.join("\n")).toContain("OK Workspace attached");
    expect(out.join("\n")).toContain("ws_001");
  });

  it("starts workspace through runner job and waits for completion", async () => {
    let workspaceQueryCount = 0;
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = new URL(raw);
      const method = (init?.method ?? "GET").toUpperCase();
      const path = `${url.pathname}${url.search}`;

      if (method === "GET" && path === "/machines") {
        return jsonResponse({
          items: [
            {
              id: "machine_local_1",
              status: "online",
              agents: ["local-worker"],
              services: ["shell", "internal_runner"],
              lastHeartbeatAt: new Date().toISOString(),
              metadata: { execution: { mode: "local" } }
            }
          ]
        });
      }

      if (method === "GET" && path === "/projects") {
        return jsonResponse({
          items: [{ id: "prj_001", key: "alpha", name: "Alpha", status: "active" }]
        });
      }

      if (method === "GET" && path === "/workspaces?projectId=prj_001") {
        workspaceQueryCount += 1;
        return jsonResponse({
          items: [
            {
              id: "ws_001",
              tenantId: "tenant_default",
              projectId: "prj_001",
              mode: "local",
              localPath: "/Users/andromeda/devtool",
              runtimeStatus: workspaceQueryCount > 1 ? "running" : "starting",
              runtimeDetails: {},
              createdAt: "2026-04-16T10:00:00.000Z",
              updatedAt: "2026-04-16T10:00:00.000Z"
            }
          ]
        });
      }

      if (method === "PATCH" && path === "/workspaces/ws_001") {
        const payload = init?.body ? (JSON.parse(init.body.toString()) as Record<string, unknown>) : {};
        expect(payload.action).toBe("start");
        expect(payload.executionMode).toBe("local");
        return jsonResponse({
          item: {
            id: "ws_001",
            projectId: "prj_001",
            mode: "local",
            runtimeStatus: "starting",
            createdAt: "2026-04-16T10:00:00.000Z",
            updatedAt: "2026-04-16T10:00:00.000Z"
          },
          jobId: "job_ws_start_001",
          status: "pending"
        });
      }

      if (method === "GET" && path === "/jobs/job_ws_start_001") {
        return jsonResponse({
          item: {
            id: "job_ws_start_001",
            status: "done"
          }
        });
      }

      return jsonResponse({ message: "not_found" }, 404);
    });

    const { deps, out, err } = createDeps({ fetchFn });
    const code = await runCli(["workspace", "start"], deps);

    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out.join("\n")).toContain("OK Workspace start completed");
    expect(out.join("\n")).toContain("runtime: running");
    expect(out.join("\n")).toContain("job_ws_start_001");
  });

  it("creates and edits agents from CLI", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = new URL(raw);
      const method = (init?.method ?? "GET").toUpperCase();
      const path = `${url.pathname}${url.search}`;

      if (method === "POST" && path === "/agents") {
        const payload = init?.body ? (JSON.parse(init.body.toString()) as Record<string, unknown>) : {};
        expect(payload.name).toBe("planner");
        expect(payload.role).toBe("planner");
        return jsonResponse({
          item: {
            id: "agent_900",
            name: "planner",
            role: "planner",
            status: "active"
          }
        });
      }

      if (method === "PATCH" && path === "/agents/agent_900") {
        const payload = init?.body ? (JSON.parse(init.body.toString()) as Record<string, unknown>) : {};
        expect(payload.role).toBe("reviewer");
        return jsonResponse({
          item: {
            id: "agent_900",
            name: "planner",
            role: "reviewer",
            status: "active"
          }
        });
      }

      return jsonResponse({ message: "not_found" }, 404);
    });

    const { deps, out, err } = createDeps({ fetchFn });
    const createCode = await runCli(["agents", "create", "planner", "--role", "planner"], deps);
    expect(createCode).toBe(0);
    expect(err).toEqual([]);
    expect(out.join("\n")).toContain("OK Agent created");

    out.length = 0;

    const editCode = await runCli(["agents", "edit", "agent_900", "--role", "reviewer"], deps);
    expect(editCode).toBe(0);
    expect(err).toEqual([]);
    expect(out.join("\n")).toContain("OK Agent updated");
    expect(out.join("\n")).toContain("reviewer");
  });
});
