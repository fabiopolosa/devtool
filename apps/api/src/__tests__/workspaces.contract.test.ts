import { chmod, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";
import type { Job } from "@cp/domain";
import {
  startTestExecutionWorkerHarness,
  type TestExecutionWorkerHarness
} from "./helpers/execution-worker-harness.js";

describe("Workspaces API contract", () => {
  type InjectRequestOptions = InjectOptions;
  type InjectResponse = LightMyRequestResponse;

  let app: FastifyInstance;
  let projectId: string;
  let workspaceId: string;
  let primaryAgentId: string;
  let workerHarness: TestExecutionWorkerHarness;
  let adminHeaders: Record<string, string>;
  const temporaryPaths: string[] = [];

  const waitForJob = async (jobId: string): Promise<Job> => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 20_000) {
      const response = await inject({
        method: "GET",
        url: `/jobs/${jobId}`
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { item?: Job };
      const item = body.item;
      if (!item) throw new Error(`Job not found: ${jobId}`);
      if (item.status === "done" || item.status === "waiting_user") {
        return item;
      }
      if (item.status === "error") {
        const payload = item.payload as Record<string, unknown> | undefined;
        const lastError =
          payload && typeof payload.lastError === "object" && payload.lastError !== null
            ? (payload.lastError as Record<string, unknown>)
            : undefined;
        const errorMessage =
          typeof lastError?.message === "string" ? lastError.message : `Workspace job failed: ${jobId}`;
        throw new Error(errorMessage);
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new Error(`Timed out waiting for job ${jobId}`);
  };

  beforeAll(async () => {
    process.env.API_STORE_MODE = "in_memory";
    process.env.REDIS_URL = "";
    process.env.AUTH_ENABLED = "1";
    process.env.WORKSPACE_ALLOWED_ROOTS = `${process.cwd()},${tmpdir()}`;

    const { buildApp } = await import("../app.js");
    app = await buildApp();
    workerHarness = await startTestExecutionWorkerHarness();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@control-plane.local", password: "admin123!" }
    });
    expect(login.statusCode).toBe(200);
    const token = (login.json() as { item: { token: string } }).item.token;
    adminHeaders = { authorization: `Bearer ${token}` };

    const projects = await app.inject({ method: "GET", url: "/projects", headers: adminHeaders });
    const projectsBody = projects.json() as { items?: Array<{ id: string }> };
    projectId = projectsBody.items?.[0]?.id ?? "proj_001";

    primaryAgentId = "agent_001";
  });

  afterAll(async () => {
    for (const dirPath of temporaryPaths) {
      try {
        await chmod(dirPath, 0o700);
      } catch {
        // best effort cleanup permission reset
      }
      try {
        await rm(dirPath, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
    }
    if (workerHarness) {
      await workerHarness.stop();
    }
    if (app) {
      await app.close();
    }
    delete process.env.AUTH_ENABLED;
  });

  const inject = (options: InjectRequestOptions): Promise<InjectResponse> =>
    app.inject({
      ...options,
      headers: {
        ...adminHeaders,
        ...(options.headers ?? {})
      }
    });

  const createProject = async (name: string): Promise<string> => {
    const response = await inject({
      method: "POST",
      url: "/projects",
      payload: {
        name
      }
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { item?: { id?: string } };
    const createdProjectId = body.item?.id;
    expect(typeof createdProjectId).toBe("string");
    return createdProjectId as string;
  };

  it("creates and updates a workspace runtime entity", async () => {
    const created = await inject({
      method: "POST",
      url: "/workspaces",
      payload: {
        projectId,
        mode: "local",
        localPath: process.cwd()
      }
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json() as {
      item?: {
        id: string;
        projectId: string;
        runtimeStatus: string;
        mode: string;
        runtimeDetails?: Record<string, unknown>;
      };
    };
    expect(createdBody.item?.projectId).toBe(projectId);
    expect(createdBody.item?.mode).toBe("local");
    expect(createdBody.item?.runtimeStatus).toBe("stopped");
    const createdValidation = (createdBody.item?.runtimeDetails?.pathValidation ?? {}) as Record<string, unknown>;
    expect(typeof createdValidation.directorySizeBytes).toBe("number");
    workspaceId = createdBody.item?.id ?? "";
    expect(workspaceId).not.toHaveLength(0);

    const listed = await inject({
      method: "GET",
      url: `/workspaces?projectId=${projectId}`
    });
    expect(listed.statusCode).toBe(200);
    const listedBody = listed.json() as { items?: Array<{ id: string }> };
    expect(Array.isArray(listedBody.items)).toBe(true);
    expect(listedBody.items?.[0]?.id).toBe(workspaceId);

    const patched = await inject({
      method: "PATCH",
      url: `/workspaces/${workspaceId}`,
      payload: {
        mode: "remote",
        localPath: process.cwd()
      }
    });
    expect(patched.statusCode).toBe(200);
    const patchedBody = patched.json() as { item?: { id: string; mode: string; localPath?: string } };
    expect(patchedBody.item?.id).toBe(workspaceId);
    expect(patchedBody.item?.mode).toBe("remote");
    expect(patchedBody.item?.localPath).toBe(process.cwd());
  });

  it("reads and updates project runtime profile state", async () => {
    const getResponse = await inject({
      method: "GET",
      url: `/projects/${projectId}/runtime`
    });
    expect(getResponse.statusCode).toBe(200);
    const getBody = getResponse.json() as {
      item?: {
        id: string;
        runtimeProfile?: {
          defaultHost?: string;
          defaultExecutionMode?: string;
          heartbeatPolicy?: { interval?: string; triggers?: string[] };
        };
      };
    };
    expect(getBody.item?.id).toBe(projectId);
    expect(getBody.item?.runtimeProfile?.heartbeatPolicy?.interval).toBeDefined();

    const updateResponse = await inject({
      method: "PUT",
      url: `/projects/${projectId}/runtime`,
      payload: {
        primaryAgentId,
        workspaceId: workspaceId || undefined,
        defaultHost: "local_worker",
        defaultExecutionMode: "queued",
        heartbeatPolicy: {
          interval: "1m",
          triggers: ["manual", "on_startup"],
          enabled: true,
          metadata: { source: "test" }
        },
        agentSelectionPolicy: {
          mode: "primary"
        },
        metadata: {
          onboarding: true
        }
      }
    });
    expect(updateResponse.statusCode).toBe(200);
    const updateBody = updateResponse.json() as {
      item?: {
        runtimeProfile?: {
          primaryAgentId?: string;
          workspaceId?: string;
          defaultHost?: string;
          defaultExecutionMode?: string;
          heartbeatPolicy?: { interval?: string; triggers?: string[]; enabled?: boolean };
          metadata?: Record<string, unknown>;
        };
      };
    };
    expect(updateBody.item?.runtimeProfile?.primaryAgentId).toBe(primaryAgentId);
    expect(updateBody.item?.runtimeProfile?.heartbeatPolicy?.interval).toBe("1m");

    const roundTrip = await inject({
      method: "GET",
      url: `/projects/${projectId}/runtime`
    });
    expect(roundTrip.statusCode).toBe(200);
    const roundTripBody = roundTrip.json() as {
      item?: { runtimeProfile?: { primaryAgentId?: string; heartbeatPolicy?: { interval?: string } } };
    };
    expect(roundTripBody.item?.runtimeProfile?.primaryAgentId).toBe(primaryAgentId);
    expect(roundTripBody.item?.runtimeProfile?.heartbeatPolicy?.interval).toBe("1m");
  });

  it("triggers project heartbeat jobs and reports aggregate status", async () => {
    const configuredRuntime = await inject({
      method: "PUT",
      url: `/projects/${projectId}/runtime`,
      payload: {
        primaryAgentId,
        heartbeatPolicy: {
          interval: "manual",
          triggers: ["manual", "on_startup"],
          enabled: true,
          metadata: {}
        },
        metadata: {
          heartbeat: {
            lastHeartbeatAt: new Date(Date.now() - 10 * 60_000).toISOString(),
            lastHeartbeatTrigger: "manual",
            lastHeartbeatJobIds: [],
            lastHeartbeatAgentIds: [primaryAgentId],
            lastHeartbeatStatus: "queued"
          }
        }
      }
    });
    expect(configuredRuntime.statusCode).toBe(200);

    const manualResponse = await inject({
      method: "POST",
      url: `/projects/${projectId}/runtime/heartbeat`,
      payload: {
        trigger: "manual",
        reason: "manual smoke heartbeat"
      }
    });
    expect(manualResponse.statusCode).toBe(200);
    const manualBody = manualResponse.json() as {
      item?: {
        jobs?: Array<{ jobId: string; agentId: string }>;
        targets?: Array<{ agentId: string }>;
        runtimeProfile?: { metadata?: Record<string, unknown> };
      };
    };
    expect(manualBody.item?.jobs?.length).toBeGreaterThan(0);
    expect(manualBody.item?.targets?.[0]?.agentId).toBe(primaryAgentId);

    const statusResponse = await inject({
      method: "GET",
      url: `/projects/${projectId}/runtime/heartbeat/status`
    });
    expect(statusResponse.statusCode).toBe(200);
    const statusBody = statusResponse.json() as {
      item?: {
        projectId: string;
        overallStatus: string;
        queuedCount: number;
        targets?: Array<{ agentId: string; jobStatus?: string }>;
      };
    };
    expect(statusBody.item?.projectId).toBe(projectId);
    expect(statusBody.item?.overallStatus).toBe("queued");
    expect(statusBody.item?.queuedCount).toBeGreaterThan(0);
    expect(statusBody.item?.targets?.[0]?.agentId).toBe(primaryAgentId);
  });

  it("ticks scheduled project heartbeat when stale and skips when fresh", async () => {
    const staleHeartbeatAt = new Date(Date.now() - 2 * 60_000).toISOString();
    const seededRuntime = await inject({
      method: "PUT",
      url: `/projects/${projectId}/runtime`,
      payload: {
        primaryAgentId,
        heartbeatPolicy: {
          interval: "1m",
          triggers: ["manual", "on_startup"],
          enabled: true,
          metadata: {}
        },
        metadata: {
          heartbeat: {
            lastHeartbeatAt: staleHeartbeatAt,
            lastHeartbeatTrigger: "manual",
            lastHeartbeatJobIds: [],
            lastHeartbeatAgentIds: [primaryAgentId],
            lastHeartbeatStatus: "queued"
          }
        }
      }
    });
    expect(seededRuntime.statusCode).toBe(200);

    const tickResponse = await inject({
      method: "POST",
      url: `/projects/${projectId}/runtime/heartbeat/tick`,
      payload: {
        trigger: "on_startup",
        reason: "scheduled_tick"
      }
    });
    expect(tickResponse.statusCode).toBe(200);
    const tickBody = tickResponse.json() as {
      item?: {
        skipped?: boolean;
        jobs?: Array<{ jobId: string }>;
        targets?: Array<{ agentId: string }>;
      };
    };
    expect(tickBody.item?.skipped).toBe(false);
    expect(tickBody.item?.jobs?.length).toBeGreaterThan(0);

    const freshStatus = await inject({
      method: "GET",
      url: `/projects/${projectId}/runtime/heartbeat/status`
    });
    expect(freshStatus.statusCode).toBe(200);
    const freshStatusBody = freshStatus.json() as {
      item?: {
        due: boolean;
        lastTrigger?: string;
        overallStatus: string;
      };
    };
    expect(freshStatusBody.item?.due).toBe(false);
    expect(freshStatusBody.item?.lastTrigger).toBe("on_startup");
  });

  it("browses allowed workspace roots and blocks escapes", async () => {
    const rootsResponse = await inject({
      method: "GET",
      url: "/workspaces/browser/roots"
    });
    expect(rootsResponse.statusCode).toBe(200);
    const rootsBody = rootsResponse.json() as {
      items?: Array<{ path: string; exists: boolean }>;
    };
    expect(Array.isArray(rootsBody.items)).toBe(true);
    expect(rootsBody.items?.length).toBeGreaterThan(0);

    const browseResponse = await inject({
      method: "GET",
      url: `/workspaces/browser?path=${encodeURIComponent(process.cwd())}`
    });
    expect(browseResponse.statusCode).toBe(200);
    const browseBody = browseResponse.json() as {
      item?: { resolvedPath?: string; entries?: Array<{ name: string; kind: string }> };
    };
    expect(browseBody.item?.resolvedPath).toContain(process.cwd());
    expect(Array.isArray(browseBody.item?.entries)).toBe(true);

    const escapeResponse = await inject({
      method: "GET",
      url: `/workspaces/browser?path=${encodeURIComponent("/etc")}`
    });
    expect(escapeResponse.statusCode).toBe(400);
    expect((escapeResponse.json() as { error?: string }).error).toBe("workspace_browser_invalid_path");
  });

  it("dispatches workspace runtime actions through runner jobs", async () => {
    await inject({
      method: "PATCH",
      url: `/workspaces/${workspaceId}`,
      payload: {
        mode: "local",
        localPath: process.cwd()
      }
    });
    const startResponse = await inject({
      method: "PATCH",
      url: `/workspaces/${workspaceId}`,
      payload: {
        action: "start",
        executionMode: "local"
      }
    });
    expect(startResponse.statusCode).toBe(200);
    const startBody = startResponse.json() as { jobId?: string; status?: string };
    expect(typeof startBody.jobId).toBe("string");
    expect(startBody.status).toBe("pending");
    await waitForJob(startBody.jobId!);

    const afterStart = await inject({
      method: "GET",
      url: `/workspaces?projectId=${projectId}`
    });
    const started = (afterStart.json() as { items?: Array<{ runtimeStatus: string; lastStartedAt?: string }> }).items?.[0];
    expect(started?.runtimeStatus).toBe("running");
    expect(typeof started?.lastStartedAt).toBe("string");

    const deployResponse = await inject({
      method: "PATCH",
      url: `/workspaces/${workspaceId}`,
      payload: {
        action: "deploy",
        executionMode: "local"
      }
    });
    expect(deployResponse.statusCode).toBe(200);
    const deployBody = deployResponse.json() as { jobId?: string };
    await waitForJob(deployBody.jobId!);

    const afterDeploy = await inject({
      method: "GET",
      url: `/workspaces?projectId=${projectId}`
    });
    const deployed = (afterDeploy.json() as {
      items?: Array<{ runtimeDetails?: Record<string, unknown> }>;
    }).items?.[0];
    const deployMetadata = ((deployed?.runtimeDetails as Record<string, unknown> | undefined)?.lastActionMetadata ??
      {}) as Record<string, unknown>;
    expect(typeof deployMetadata.deployExecution).toBe("object");

    const stopResponse = await inject({
      method: "PATCH",
      url: `/workspaces/${workspaceId}`,
      payload: {
        action: "stop",
        executionMode: "local"
      }
    });
    expect(stopResponse.statusCode).toBe(200);
    const stopBody = stopResponse.json() as { jobId?: string };
    await waitForJob(stopBody.jobId!);

    const afterStop = await inject({
      method: "GET",
      url: `/workspaces?projectId=${projectId}`
    });
    const stopped = (afterStop.json() as {
      items?: Array<{ runtimeStatus: string; lastStoppedAt?: string; lastDeployedAt?: string }>;
    }).items?.[0];
    expect(stopped?.runtimeStatus).toBe("stopped");
    expect(typeof stopped?.lastStoppedAt).toBe("string");
    expect(typeof stopped?.lastDeployedAt).toBe("string");

    const restartResponse = await inject({
      method: "PATCH",
      url: `/workspaces/${workspaceId}`,
      payload: {
        action: "restart",
        executionMode: "local"
      }
    });
    expect(restartResponse.statusCode).toBe(200);
    const restartBody = restartResponse.json() as { jobId?: string };
    await waitForJob(restartBody.jobId!);

    const afterRestart = await inject({
      method: "GET",
      url: `/workspaces?projectId=${projectId}`
    });
    const restarted = (afterRestart.json() as {
      items?: Array<{ runtimeStatus: string; lastStartedAt?: string; lastStoppedAt?: string }>;
    }).items?.[0];
    expect(restarted?.runtimeStatus).toBe("running");
    expect(typeof restarted?.lastStartedAt).toBe("string");
    expect(typeof restarted?.lastStoppedAt).toBe("string");
  });

  it("stores missing local path validation and blocks local start", async () => {
    const localProjectId = await createProject(`workspace-missing-path-${Date.now()}`);
    const createResponse = await inject({
      method: "POST",
      url: "/workspaces",
      payload: {
        projectId: localProjectId,
        mode: "local"
      }
    });
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as {
      item?: {
        id: string;
        runtimeStatus: string;
        runtimeDetails?: Record<string, unknown>;
      };
    };
    expect(created.item?.runtimeStatus).toBe("error");
    const pathValidation = (created.item?.runtimeDetails?.pathValidation ?? {}) as Record<string, unknown>;
    expect(pathValidation.reason).toBe("missing_path");

    const startResponse = await inject({
      method: "PATCH",
      url: `/workspaces/${created.item?.id}`,
      payload: {
        action: "start",
        executionMode: "local"
      }
    });
    expect(startResponse.statusCode).toBe(400);
    expect((startResponse.json() as { error?: string }).error).toBe("workspace_path_invalid");

    const internalActionResponse = await inject({
      method: "POST",
      url: "/execution/internal-action",
      payload: {
        action: "workspace.start",
        payload: {
          tenantId: "tenant_default",
          projectId: localProjectId,
          workspaceId: created.item?.id,
          actor: "workspace_runtime"
        }
      }
    });
    expect(internalActionResponse.statusCode).toBe(500);
    const internalActionBody = internalActionResponse.json() as { message?: string };
    expect(internalActionBody.message).toContain("required in local mode");
  });

  it("stores invalid local path validation for non-existing paths", async () => {
    const localProjectId = await createProject(`workspace-invalid-path-${Date.now()}`);
    const invalidPath = path.join(tmpdir(), `devtool-workspace-missing-${Date.now()}`);
    const createResponse = await inject({
      method: "POST",
      url: "/workspaces",
      payload: {
        projectId: localProjectId,
        mode: "local",
        localPath: invalidPath
      }
    });
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as {
      item?: {
        runtimeStatus: string;
        runtimeDetails?: Record<string, unknown>;
      };
    };
    expect(created.item?.runtimeStatus).toBe("error");
    const pathValidation = (created.item?.runtimeDetails?.pathValidation ?? {}) as Record<string, unknown>;
    expect(pathValidation.reason).toBe("path_not_found");
  });

  it("stores permission validation errors for non-writable local paths", async () => {
    const localProjectId = await createProject(`workspace-permission-path-${Date.now()}`);
    const restrictedDir = await mkdtemp(path.join(tmpdir(), "devtool-workspace-restricted-"));
    temporaryPaths.push(restrictedDir);
    await chmod(restrictedDir, 0o500);

    const createResponse = await inject({
      method: "POST",
      url: "/workspaces",
      payload: {
        projectId: localProjectId,
        mode: "local",
        localPath: restrictedDir
      }
    });
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as {
      item?: {
        id: string;
        runtimeStatus: string;
        runtimeDetails?: Record<string, unknown>;
      };
    };
    expect(created.item?.runtimeStatus).toBe("error");
    const pathValidation = (created.item?.runtimeDetails?.pathValidation ?? {}) as Record<string, unknown>;
    expect(["permission_denied", "path_escape"]).toContain(pathValidation.reason);

    const startResponse = await inject({
      method: "PATCH",
      url: `/workspaces/${created.item?.id}`,
      payload: {
        action: "start",
        executionMode: "local"
      }
    });
    expect(startResponse.statusCode).toBe(400);
    expect((startResponse.json() as { error?: string }).error).toBe("workspace_path_invalid");
  });

  it("rejects symlink local paths for workspace attachment", async () => {
    const localProjectId = await createProject(`workspace-symlink-path-${Date.now()}`);
    const targetDir = await mkdtemp(path.join(tmpdir(), "devtool-workspace-target-"));
    const nestedDir = path.join(targetDir, "nested");
    await mkdir(nestedDir, { recursive: true });
    await writeFile(path.join(nestedDir, "file.txt"), "hello");
    const symlinkPath = path.join(tmpdir(), `devtool-workspace-symlink-${Date.now()}`);
    await symlink(targetDir, symlinkPath, "dir");
    temporaryPaths.push(symlinkPath, targetDir);

    const createResponse = await inject({
      method: "POST",
      url: "/workspaces",
      payload: {
        projectId: localProjectId,
        mode: "local",
        localPath: symlinkPath
      }
    });
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as {
      item?: {
        runtimeStatus: string;
        runtimeDetails?: Record<string, unknown>;
      };
    };
    expect(created.item?.runtimeStatus).toBe("error");
    const pathValidation = (created.item?.runtimeDetails?.pathValidation ?? {}) as Record<string, unknown>;
    expect(pathValidation.reason).toBe("symlink_not_allowed");
  });

  it("rejects path traversal attempts before workspace creation", async () => {
    const localProjectId = await createProject(`workspace-path-escape-${Date.now()}`);

    const createResponse = await inject({
      method: "POST",
      url: "/workspaces",
      payload: {
        projectId: localProjectId,
        mode: "local",
        localPath: "../outside-workspace"
      }
    });
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as {
      item?: {
        runtimeStatus: string;
        runtimeDetails?: Record<string, unknown>;
      };
    };
    expect(created.item?.runtimeStatus).toBe("error");
    const pathValidation = (created.item?.runtimeDetails?.pathValidation ?? {}) as Record<string, unknown>;
    expect(pathValidation.reason).toBe("path_escape");
  });
});
