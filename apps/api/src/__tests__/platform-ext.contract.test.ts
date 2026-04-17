import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";

describe("Platform extension API contract", () => {
  type InjectRequestOptions = InjectOptions;
  type InjectResponse = LightMyRequestResponse;

  let app: FastifyInstance;
  let adminHeaders: Record<string, string>;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    process.env.API_STORE_MODE = "in_memory";
    process.env.REDIS_URL = "";
    process.env.AUTH_ENABLED = "1";
    process.env.SECRETS_MASTER_KEY = "integration-master-key";

    const { buildApp } = await import("../app.js");
    app = await buildApp();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@control-plane.local", password: "admin123!" }
    });
    expect(login.statusCode).toBe(200);
    const token = (login.json() as { item: { token: string } }).item.token;
    adminHeaders = { authorization: `Bearer ${token}` };
  });

  afterAll(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
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

  it("manages secrets with create/read/reveal/update/delete", async () => {
    const created = await inject({
      method: "POST",
      url: "/secrets",
      payload: {
        name: "TEST_SECRET",
        description: "test secret",
        value: "hello-world",
        scope: "global"
      }
    });
    expect(created.statusCode).toBe(200);
    const createdBody = created.json() as { item: { id: string; encryptedValue: string } };
    expect(createdBody.item.encryptedValue).toContain("...");

    const reveal = await inject({
      method: "GET",
      url: `/secrets/${createdBody.item.id}/reveal`
    });
    expect(reveal.statusCode).toBe(200);
    const revealBody = reveal.json() as { value: string };
    expect(revealBody.value).toBe("hello-world");

    const updated = await inject({
      method: "PUT",
      url: `/secrets/${createdBody.item.id}`,
      payload: { value: "rotated-secret" }
    });
    expect(updated.statusCode).toBe(200);

    const deleted = await inject({
      method: "DELETE",
      url: `/secrets/${createdBody.item.id}`
    });
    expect(deleted.statusCode).toBe(200);
  });

  it("introspects and stores schema docs", async () => {
    const response = await inject({
      method: "POST",
      url: "/schema-docs/introspect",
      payload: {
        title: "Main DB",
        description: "Schema snapshot"
      }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { item: { id: string; title: string } };
    expect(body.item.title).toBe("Main DB");

    const list = await inject({ method: "GET", url: "/schema-docs" });
    expect(list.statusCode).toBe(200);
    const listBody = list.json() as { items: Array<{ id: string }> };
    expect(listBody.items.some((item) => item.id === body.item.id)).toBe(true);
  });

  it("manages environments and machines", async () => {
    const createdEnvironment = await inject({
      method: "POST",
      url: "/environments",
      payload: {
        name: "Integration env",
        description: "test environment",
        type: "development",
        baseUrl: "http://localhost:3000"
      }
    });
    expect(createdEnvironment.statusCode).toBe(200);
    const environmentId = (createdEnvironment.json() as { item: { id: string } }).item.id;

    const createdMachine = await inject({
      method: "POST",
      url: "/machines",
      payload: {
        environmentId,
        name: "node-a",
        host: "http://localhost:3000",
        cpuCores: 8,
        gpuCount: 1,
        ramGb: 16
      }
    });
    expect(createdMachine.statusCode).toBe(200);
    const machineId = (createdMachine.json() as { item: { id: string } }).item.id;

    const health = await inject({
      method: "POST",
      url: `/machines/${machineId}/healthcheck`
    });
    expect(health.statusCode).toBe(200);
    const healthBody = health.json() as { item: { status: string } };
    expect(["online", "degraded", "offline"]).toContain(healthBody.item.status);
  });

  it("registers local repos and supports file manager + history + scan job", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cp-local-repo-api-"));
    tempDirs.push(root);
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "README.md"), "# Hello\n");
    await writeFile(path.join(root, "src", "index.ts"), "export const x = 1;\n");

    const created = await inject({
      method: "POST",
      url: "/local-repos",
      payload: {
        name: "tmp-repo",
        rootPath: root
      }
    });
    expect(created.statusCode).toBe(200);
    const localRepositoryId = (created.json() as { item: { id: string } }).item.id;

    const files = await inject({
      method: "GET",
      url: `/local-repos/${localRepositoryId}/files?path=.`
    });
    expect(files.statusCode).toBe(200);
    const filesBody = files.json() as { items: Array<{ name: string }> };
    expect(filesBody.items.some((item) => item.name === "README.md")).toBe(true);

    const file = await inject({
      method: "GET",
      url: `/local-repos/${localRepositoryId}/file?path=README.md`
    });
    expect(file.statusCode).toBe(200);
    expect((file.json() as { item: { content: string } }).item.content).toContain("Hello");

    const history = await inject({
      method: "GET",
      url: `/local-repos/${localRepositoryId}/history`
    });
    expect(history.statusCode).toBe(200);
    expect(Array.isArray((history.json() as { items: unknown[] }).items)).toBe(true);

    const legacyScan = await inject({
      method: "POST",
      url: `/local-repos/${localRepositoryId}/scan`
    });
    expect(legacyScan.statusCode).toBe(409);
    expect(legacyScan.json()).toMatchObject({ error: "legacy_scan_path_disabled" });

    const scheduled = await inject({
      method: "POST",
      url: `/local-repos/${localRepositoryId}/scan/schedule`
    });
    expect(scheduled.statusCode).toBe(503);
    const scheduledBody = scheduled.json() as { error?: string; message?: string };
    expect(scheduledBody.error).toBe("scheduler_unavailable");
  });

  it("rejects escaped local-repo reads through the API", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cp-local-repo-escape-api-"));
    const outside = await mkdtemp(path.join(tmpdir(), "cp-local-repo-escape-outside-"));
    tempDirs.push(root, outside);
    await writeFile(path.join(outside, "secret.txt"), "hidden\n");

    const created = await inject({
      method: "POST",
      url: "/local-repos",
      payload: {
        name: "escape-repo",
        rootPath: root
      }
    });
    expect(created.statusCode).toBe(200);
    const localRepositoryId = (created.json() as { item: { id: string } }).item.id;

    await symlink(outside, path.join(root, "escape"), "dir");

    const file = await inject({
      method: "GET",
      url: `/local-repos/${localRepositoryId}/file?path=escape/secret.txt`
    });
    expect(file.statusCode).toBe(400);
    const body = file.json() as { error?: string; message?: string };
    expect(body.error).toBe("invalid_request");
    expect(body.message).toContain("Path escapes repository root");
  });

  it("creates snapshots and computes diffs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cp-versioning-api-"));
    tempDirs.push(root);
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "index.ts"), "export const n = 1;\n");

    const repoResponse = await inject({
      method: "POST",
      url: "/local-repos",
      payload: {
        name: "versioning-repo",
        rootPath: root
      }
    });
    expect(repoResponse.statusCode).toBe(200);
    const localRepositoryId = (repoResponse.json() as { item: { id: string } }).item.id;

    const firstSnapshot = await inject({
      method: "POST",
      url: "/versioning/snapshots",
      payload: {
        localRepositoryId,
        label: "before",
        trigger: "manual"
      }
    });
    expect(firstSnapshot.statusCode).toBe(200);
    const firstId = (firstSnapshot.json() as { item: { id: string } }).item.id;

    await writeFile(path.join(root, "src", "index.ts"), "export const n = 2;\n");
    await writeFile(path.join(root, "src", "added.ts"), "export const added = true;\n");

    const secondSnapshot = await inject({
      method: "POST",
      url: "/versioning/snapshots",
      payload: {
        localRepositoryId,
        label: "after",
        trigger: "manual"
      }
    });
    expect(secondSnapshot.statusCode).toBe(200);
    const secondId = (secondSnapshot.json() as { item: { id: string } }).item.id;

    const diff = await inject({
      method: "GET",
      url: `/versioning/diff?leftSnapshotId=${firstId}&rightSnapshotId=${secondId}`
    });
    expect(diff.statusCode).toBe(200);
    const diffBody = diff.json() as { item: { added: string[]; changed: Array<{ path: string }> } };
    expect(diffBody.item.added).toContain("src/added.ts");
    expect(diffBody.item.changed.some((entry) => entry.path === "src/index.ts")).toBe(true);
  });
});
