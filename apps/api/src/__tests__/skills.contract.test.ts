import { Buffer } from "node:buffer";
import type { FastifyInstance } from "fastify";
import {
  startTestExecutionWorkerHarness,
  type TestExecutionWorkerHarness
} from "./helpers/execution-worker-harness.js";

describe("Skills API contract", () => {
  let app: FastifyInstance;
  let workerHarness: TestExecutionWorkerHarness;

  beforeAll(async () => {
    process.env.API_STORE_MODE = "in_memory";
    process.env.AUTH_ENABLED = "0";

    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          skills: [
            {
              name: "release-notes",
              description: "Generate release notes from merged work.",
              repositoryUrl: "https://github.com/example/skills-release-notes",
              version: "1.0.0",
              categories: ["ops", "delivery"],
              instructions: "Summarize merged pull requests grouped by scope."
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )) as typeof fetch;

    const { buildApp } = await import("../app.js");
    app = await buildApp();
    workerHarness = await startTestExecutionWorkerHarness();
  });

  afterAll(async () => {
    if (workerHarness) {
      await workerHarness.stop();
    }
    if (app) {
      await app.close();
    }
    delete process.env.AUTH_ENABLED;
  });

  const headers = { "x-tenant-id": "tenant_default" };
  const otherTenantHeaders = { "x-tenant-id": "tenant_other" };

  it("lists marketplace catalog via /skills/catalog", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/skills/catalog?marketplace=https%3A%2F%2Fexample.com%2Fmarketplace.json",
      headers
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: Array<{ name: string }> };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.some((skill) => skill.name === "release-notes")).toBe(true);
  });

  it("lists installed skills via /skills/installed", async () => {
    const response = await app.inject({ method: "GET", url: "/skills/installed", headers });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: Array<{ installed: boolean }> };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.every((item) => item.installed)).toBe(true);
  });

  it("installs uploaded skills via /skills/install-upload", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/skills/install-upload",
      headers,
      payload: {
        name: "local-parser",
        sourceType: "file",
        fileName: "local-parser.skill.md",
        contentBase64: Buffer.from("skill: local parser\nentry: parse").toString("base64"),
        instructions: "Parse local content and return structured extraction for downstream tasks."
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      installed: boolean;
      item: { name: string; sourceType?: string };
      validation: { status: string };
    };
    expect(body.installed).toBe(true);
    expect(body.item.name).toBe("local-parser");
    expect(body.item.sourceType).toBe("file");
    expect(body.validation.status).toBe("valid");
  });

  it("supports skill validation + version update + history + rollback", async () => {
    const validateResponse = await app.inject({
      method: "POST",
      url: "/skills/skill_001/validate",
      headers
    });
    expect(validateResponse.statusCode).toBe(200);

    const updateV1 = await app.inject({
      method: "POST",
      url: "/skills/skill_001/update",
      headers,
      payload: { version: "1.1.0" }
    });
    expect(updateV1.statusCode).toBe(200);

    const updateV2 = await app.inject({
      method: "POST",
      url: "/skills/skill_001/update",
      headers,
      payload: { version: "1.2.0" }
    });
    expect(updateV2.statusCode).toBe(200);

    const historyResponse = await app.inject({
      method: "GET",
      url: "/skills/skill_001/history",
      headers
    });
    expect(historyResponse.statusCode).toBe(200);
    const historyBody = historyResponse.json() as { items: Array<{ version: string }> };
    expect(historyBody.items.length).toBeGreaterThan(0);

    const rollbackResponse = await app.inject({
      method: "POST",
      url: "/skills/skill_001/rollback",
      headers
    });
    expect(rollbackResponse.statusCode).toBe(200);
    const rollbackBody = rollbackResponse.json() as { item: { currentVersion?: string; version: string } };
    expect(rollbackBody.item.currentVersion ?? rollbackBody.item.version).toBe("1.1.0");
  });

  it("supports lifecycle actions: disable, enable, uninstall", async () => {
    const installResponse = await app.inject({
      method: "POST",
      url: "/skills/install-upload",
      headers,
      payload: {
        name: "lifecycle-tool",
        sourceType: "file",
        fileName: "lifecycle-tool.skill.md",
        contentBase64: Buffer.from("skill: lifecycle\naction: test").toString("base64"),
        instructions: "Lifecycle test helper skill with deterministic behavior."
      }
    });
    expect(installResponse.statusCode).toBe(200);
    const installBody = installResponse.json() as { item: { id: string } };
    const skillId = installBody.item.id;

    const disableResponse = await app.inject({
      method: "POST",
      url: `/skills/${skillId}/disable`,
      headers
    });
    expect(disableResponse.statusCode).toBe(200);
    const disabledBody = disableResponse.json() as { item: { installed: boolean } };
    expect(disabledBody.item.installed).toBe(false);

    const listWithDisabled = await app.inject({
      method: "GET",
      url: "/skills/installed?includeDisabled=1",
      headers
    });
    expect(listWithDisabled.statusCode).toBe(200);
    const listWithDisabledBody = listWithDisabled.json() as { items: Array<{ id: string; installed: boolean }> };
    expect(listWithDisabledBody.items.some((item) => item.id === skillId && item.installed === false)).toBe(true);

    const enableResponse = await app.inject({
      method: "POST",
      url: `/skills/${skillId}/enable`,
      headers
    });
    expect(enableResponse.statusCode).toBe(200);
    const enabledBody = enableResponse.json() as { item: { installed: boolean } };
    expect(enabledBody.item.installed).toBe(true);

    const uninstallResponse = await app.inject({
      method: "DELETE",
      url: `/skills/${skillId}`,
      headers
    });
    expect(uninstallResponse.statusCode).toBe(200);

    const afterUninstall = await app.inject({
      method: "GET",
      url: "/skills/installed?includeDisabled=1",
      headers
    });
    const afterUninstallBody = afterUninstall.json() as { items: Array<{ id: string }> };
    expect(afterUninstallBody.items.some((item) => item.id === skillId)).toBe(false);
  });

  it("executes skill through runner via /skills/:id/execute", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/skills/skill_001/execute",
      headers,
      payload: {
        mode: "local"
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      jobId: string;
      status: string;
      item?: { success?: boolean; logs?: string[] };
    };

    expect(typeof body.jobId).toBe("string");
    expect(body.status).toBe("done");
    expect(body.item?.success).toBe(true);
  });

  it("records skill execution audit events", async () => {
    const execute = await app.inject({
      method: "POST",
      url: "/skills/skill_001/execute",
      headers,
      payload: {
        mode: "local"
      }
    });
    expect(execute.statusCode).toBe(200);

    const audit = await app.inject({
      method: "GET",
      url: "/audit?action=skill.execute&resourceType=skill&resourceId=skill_001",
      headers
    });
    expect(audit.statusCode).toBe(200);
    const auditBody = audit.json() as {
      items: Array<{ action: string; status: string; metadata?: Record<string, unknown> }>;
    };
    expect(auditBody.items.length).toBeGreaterThan(0);
    expect(auditBody.items.some((item) => item.action === "skill.execute")).toBe(true);
    const skillAudit = auditBody.items.find((item) => item.action === "skill.execute");
    expect(typeof skillAudit?.metadata?.skillVersion).toBe("string");
    expect(typeof skillAudit?.metadata?.scope).toBe("string");
    expect(typeof skillAudit?.metadata?.durationMs).toBe("number");
    expect(typeof skillAudit?.metadata?.input).toBe("object");
    expect(typeof skillAudit?.metadata?.output).toBe("object");
  });

  it("isolates skills by tenant scope", async () => {
    const install = await app.inject({
      method: "POST",
      url: "/skills/install-upload",
      headers: { "x-tenant-id": "tenant_default" },
      payload: {
        name: "tenant-default-only",
        sourceType: "file",
        fileName: "tenant-default-only.skill.md",
        contentBase64: Buffer.from("skill: tenant default only").toString("base64"),
        instructions: "Tenant isolated skill for cross-tenant visibility checks."
      }
    });
    expect(install.statusCode).toBe(200);
    const installBody = install.json() as { item: { id: string } };

    const crossTenantList = await app.inject({
      method: "GET",
      url: "/skills/installed?includeDisabled=1",
      headers: { "x-tenant-id": "tenant_other" }
    });
    expect(crossTenantList.statusCode).toBe(200);
    const crossTenantBody = crossTenantList.json() as { items: Array<{ id: string }> };
    expect(crossTenantBody.items.some((item) => item.id === installBody.item.id)).toBe(false);
  });

  it("keeps installed skill search tenant-scoped", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/skills/installed?includeDisabled=1&query=release-notes",
      headers: otherTenantHeaders
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: Array<{ id: string; name: string }> };
    expect(body.items.some((item) => item.name === "release-notes")).toBe(false);
  });

  it("blocks cross-tenant skill execution", async () => {
    const install = await app.inject({
      method: "POST",
      url: "/skills/install-upload",
      headers,
      payload: {
        name: "tenant-execution-guard",
        sourceType: "file",
        fileName: "tenant-execution-guard.skill.md",
        contentBase64: Buffer.from("skill: execution guard").toString("base64"),
        instructions: "Tenant isolated skill for execution path checks."
      }
    });
    expect(install.statusCode).toBe(200);
    const installBody = install.json() as { item: { id: string } };

    const execute = await app.inject({
      method: "POST",
      url: `/skills/${installBody.item.id}/execute`,
      headers: otherTenantHeaders,
      payload: {
        mode: "local"
      }
    });

    expect(execute.statusCode).toBe(404);
  });
});
