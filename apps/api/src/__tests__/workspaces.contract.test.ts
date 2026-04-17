import { chmod, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { Job } from "@cp/domain";
import {
  startTestExecutionWorkerHarness,
  type TestExecutionWorkerHarness
} from "./helpers/execution-worker-harness.js";

describe("Workspaces API contract", () => {
  let app: FastifyInstance;
  let projectId: string;
  let workspaceId: string;
  let workerHarness: TestExecutionWorkerHarness;
  const temporaryPaths: string[] = [];

  const waitForJob = async (jobId: string): Promise<Job> => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 20_000) {
      const response = await app.inject({
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

    const { buildApp } = await import("../app.js");
    app = await buildApp();
    workerHarness = await startTestExecutionWorkerHarness();

    const projects = await app.inject({ method: "GET", url: "/projects" });
    const projectsBody = projects.json() as { items?: Array<{ id: string }> };
    projectId = projectsBody.items?.[0]?.id ?? "proj_001";
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
  });

  const createProject = async (name: string): Promise<string> => {
    const response = await app.inject({
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
    const created = await app.inject({
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

    const listed = await app.inject({
      method: "GET",
      url: `/workspaces?projectId=${projectId}`
    });
    expect(listed.statusCode).toBe(200);
    const listedBody = listed.json() as { items?: Array<{ id: string }> };
    expect(Array.isArray(listedBody.items)).toBe(true);
    expect(listedBody.items?.[0]?.id).toBe(workspaceId);

    const patched = await app.inject({
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

  it("dispatches workspace runtime actions through runner jobs", async () => {
    await app.inject({
      method: "PATCH",
      url: `/workspaces/${workspaceId}`,
      payload: {
        mode: "local",
        localPath: process.cwd()
      }
    });
    const startResponse = await app.inject({
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

    const afterStart = await app.inject({
      method: "GET",
      url: `/workspaces?projectId=${projectId}`
    });
    const started = (afterStart.json() as { items?: Array<{ runtimeStatus: string; lastStartedAt?: string }> }).items?.[0];
    expect(started?.runtimeStatus).toBe("running");
    expect(typeof started?.lastStartedAt).toBe("string");

    const deployResponse = await app.inject({
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

    const afterDeploy = await app.inject({
      method: "GET",
      url: `/workspaces?projectId=${projectId}`
    });
    const deployed = (afterDeploy.json() as {
      items?: Array<{ runtimeDetails?: Record<string, unknown> }>;
    }).items?.[0];
    const deployMetadata = ((deployed?.runtimeDetails as Record<string, unknown> | undefined)?.lastActionMetadata ??
      {}) as Record<string, unknown>;
    expect(typeof deployMetadata.deployExecution).toBe("object");

    const stopResponse = await app.inject({
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

    const afterStop = await app.inject({
      method: "GET",
      url: `/workspaces?projectId=${projectId}`
    });
    const stopped = (afterStop.json() as {
      items?: Array<{ runtimeStatus: string; lastStoppedAt?: string; lastDeployedAt?: string }>;
    }).items?.[0];
    expect(stopped?.runtimeStatus).toBe("stopped");
    expect(typeof stopped?.lastStoppedAt).toBe("string");
    expect(typeof stopped?.lastDeployedAt).toBe("string");

    const restartResponse = await app.inject({
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

    const afterRestart = await app.inject({
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
    const createResponse = await app.inject({
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

    const startResponse = await app.inject({
      method: "PATCH",
      url: `/workspaces/${created.item?.id}`,
      payload: {
        action: "start",
        executionMode: "local"
      }
    });
    expect(startResponse.statusCode).toBe(400);
    expect((startResponse.json() as { error?: string }).error).toBe("workspace_path_invalid");

    const internalActionResponse = await app.inject({
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
    const createResponse = await app.inject({
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

    const createResponse = await app.inject({
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
    expect(pathValidation.reason).toBe("permission_denied");

    const startResponse = await app.inject({
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

    const createResponse = await app.inject({
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

    const createResponse = await app.inject({
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
