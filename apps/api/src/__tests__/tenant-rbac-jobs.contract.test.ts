import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { apiStore } from "../services/api-store.js";
import {
  startTestExecutionWorkerHarness,
  type TestExecutionWorkerHarness
} from "./helpers/execution-worker-harness.js";

describe("Tenant isolation + RBAC + jobs", () => {
  describe("tenant isolation using x-tenant-id", () => {
    let app: FastifyInstance;
    let adminToken: string;

    beforeAll(async () => {
      process.env.API_STORE_MODE = "in_memory";
      process.env.AUTH_ENABLED = "1";
      const { buildApp } = await import("../app.js");
      app = await buildApp();

      const now = new Date().toISOString();
      await apiStore.createTenant({
        id: "tenant_a",
        name: "Tenant A",
        createdAt: now
      });
      await apiStore.createTenant({
        id: "tenant_b",
        name: "Tenant B",
        createdAt: now
      });
      await apiStore.createUserTenant({
        id: "user_tenant_admin_a",
        userId: "user_admin_001",
        tenantId: "tenant_a",
        role: "owner",
        createdAt: now
      });
      await apiStore.createUserTenant({
        id: "user_tenant_admin_b",
        userId: "user_admin_001",
        tenantId: "tenant_b",
        role: "owner",
        createdAt: now
      });
      await apiStore.createProject({
        id: "proj_tenant_a",
        tenantId: "tenant_a",
        key: "tenant-a",
        name: "Tenant A project",
        status: "active",
        createdAt: now,
        createdBy: "test",
        updatedAt: now,
        updatedBy: "test"
      });
      await apiStore.createProject({
        id: "proj_tenant_b",
        tenantId: "tenant_b",
        key: "tenant-b",
        name: "Tenant B project",
        status: "active",
        createdAt: now,
        createdBy: "test",
        updatedAt: now,
        updatedBy: "test"
      });

      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "admin@control-plane.local",
          password: "admin123!"
        }
      });
      expect(login.statusCode).toBe(200);
      adminToken = (login.json() as { item: { token: string } }).item.token;
    });

    afterAll(async () => {
      if (app) await app.close();
      delete process.env.AUTH_ENABLED;
    });

    it("does not leak projects across tenants", async () => {
      const a = await app.inject({
        method: "GET",
        url: "/projects",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "x-tenant-id": "tenant_a"
        }
      });
      expect(a.statusCode).toBe(200);
      const aItems = (a.json() as { items: Array<{ id: string; tenantId: string }> }).items;
      expect(aItems.every((item) => item.tenantId === "tenant_a")).toBe(true);

      const b = await app.inject({
        method: "GET",
        url: "/projects",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "x-tenant-id": "tenant_b"
        }
      });
      expect(b.statusCode).toBe(200);
      const bItems = (b.json() as { items: Array<{ id: string; tenantId: string }> }).items;
      expect(bItems.every((item) => item.tenantId === "tenant_b")).toBe(true);
    });
  });

  describe("jobs + tenant RBAC", () => {
    let app: FastifyInstance;
    let workerHarness: TestExecutionWorkerHarness;

    beforeAll(async () => {
      process.env.API_STORE_MODE = "in_memory";
      process.env.AUTH_ENABLED = "1";
      const { buildApp } = await import("../app.js");
      app = await buildApp();
      workerHarness = await startTestExecutionWorkerHarness({
        tenantIds: ["tenant_default"]
      });
    });

    afterAll(async () => {
      if (workerHarness) {
        await workerHarness.stop();
      }
      if (app) await app.close();
      delete process.env.AUTH_ENABLED;
    });

    it("creates and updates job status for tenant owner", async () => {
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "admin@control-plane.local",
          password: "admin123!"
        }
      });
      expect(login.statusCode).toBe(200);
      const token = (login.json() as { item: { token: string } }).item.token;

      const created = await apiStore.createJob({
        id: randomUUID(),
        tenantId: "tenant_default",
        type: "brainstorm",
        title: "RBAC test job",
        status: "idle",
        priority: 10,
        retryCount: 0,
        maxRetries: 3,
        actionRequired: false,
        resourceType: "brainstorm",
        resourceId: "session_001",
        payload: {},
        dependencies: [],
        dependsOnCount: 0,
        ready: true,
        createdBy: "user_admin_001",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const patch = await app.inject({
        method: "PATCH",
        url: `/jobs/${created.id}/status`,
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_default"
        },
        payload: {
          status: "running"
        }
      });
      expect(patch.statusCode).toBe(200);
      const body = patch.json() as { item: { status: string } };
      expect(body.item.status).toBe("running");
    });

    it("blocks job status update for tenant user role", async () => {
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "viewer@control-plane.local",
          password: "viewer123!"
        }
      });
      expect(login.statusCode).toBe(200);
      const token = (login.json() as { item: { token: string } }).item.token;

      const created = await apiStore.createJob({
        id: randomUUID(),
        tenantId: "tenant_default",
        type: "brainstorm",
        title: "RBAC deny job",
        status: "idle",
        priority: 10,
        retryCount: 0,
        maxRetries: 3,
        actionRequired: false,
        resourceType: "brainstorm",
        resourceId: "session_001",
        payload: {},
        dependencies: [],
        dependsOnCount: 0,
        ready: true,
        createdBy: "user_admin_001",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const patch = await app.inject({
        method: "PATCH",
        url: `/jobs/${created.id}/status`,
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_default"
        },
        payload: {
          status: "running"
        }
      });
      expect(patch.statusCode).toBe(403);
      expect(patch.json()).toMatchObject({ error: "forbidden" });
    });

    it("allows owner update even without global edit permission", async () => {
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "viewer@control-plane.local",
          password: "viewer123!"
        }
      });
      expect(login.statusCode).toBe(200);
      const token = (login.json() as { item: { token: string } }).item.token;

      const created = await apiStore.createJob({
        id: randomUUID(),
        tenantId: "tenant_default",
        type: "brainstorm",
        title: "Owner can patch",
        status: "idle",
        priority: 10,
        retryCount: 0,
        maxRetries: 3,
        actionRequired: false,
        resourceType: "brainstorm",
        resourceId: "session_owner",
        payload: {},
        dependencies: [],
        dependsOnCount: 0,
        ready: true,
        createdBy: "user_viewer_001",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const patch = await app.inject({
        method: "PATCH",
        url: `/jobs/${created.id}/status`,
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_default"
        },
        payload: {
          status: "running"
        }
      });

      expect(patch.statusCode).toBe(200);
      expect((patch.json() as { item: { status: string } }).item.status).toBe("running");
    });

    it("creates brainstorming jobs and tracks status transitions", async () => {
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "admin@control-plane.local",
          password: "admin123!"
        }
      });
      expect(login.statusCode).toBe(200);
      const token = (login.json() as { item: { token: string } }).item.token;

      const start = await app.inject({
        method: "POST",
        url: "/brainstorm",
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_default"
        },
        payload: {
          projectIntent: "Test brainstorming job hook",
          generatePlan: false
        }
      });
      expect(start.statusCode).toBe(200);

      const jobs = await app.inject({
        method: "GET",
        url: "/jobs?type=brainstorm",
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_default"
        }
      });
      expect(jobs.statusCode).toBe(200);
      const items = (jobs.json() as {
        items: Array<{ status: string; title: string; actionRequired: boolean; actionType?: string }>;
      }).items;
      expect(items.some((item) => item.status === "waiting_user" || item.status === "done")).toBe(true);
    });

    it("returns 403 when user requests a tenant without membership", async () => {
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "viewer@control-plane.local",
          password: "viewer123!"
        }
      });
      expect(login.statusCode).toBe(200);
      const token = (login.json() as { item: { token: string } }).item.token;

      const denied = await app.inject({
        method: "GET",
        url: "/jobs",
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_other"
        }
      });

      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({ error: "forbidden" });
    });

    it("updates jobs from /agent/chat when action is requested", async () => {
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "admin@control-plane.local",
          password: "admin123!"
        }
      });
      expect(login.statusCode).toBe(200);
      const token = (login.json() as { item: { token: string } }).item.token;

      const created = await apiStore.createJob({
        id: randomUUID(),
        tenantId: "tenant_default",
        type: "brainstorm",
        title: "Agent chat transition",
        status: "running",
        priority: 10,
        retryCount: 0,
        maxRetries: 3,
        actionRequired: false,
        resourceType: "brainstorm",
        resourceId: "plan_001",
        payload: {},
        dependencies: [],
        dependsOnCount: 0,
        ready: false,
        createdBy: "user_admin_001",
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const response = await app.inject({
        method: "POST",
        url: "/agent/chat",
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_default"
        },
        payload: {
          message: "Need input from product owner before continuing",
          jobId: created.id,
          context: { planId: "plan_001" }
        }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { item: { job?: { status: string; actionRequired: boolean; actionType?: string } } };
      expect(body.item.job).toMatchObject({
        status: "waiting_user",
        actionRequired: true,
        actionType: "input"
      });
    });

    it("exposes executable DAG jobs only when dependencies are done", async () => {
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "admin@control-plane.local",
          password: "admin123!"
        }
      });
      expect(login.statusCode).toBe(200);
      const token = (login.json() as { item: { token: string } }).item.token;

      const rootCreate = await app.inject({
        method: "POST",
        url: "/jobs",
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_default"
        },
        payload: {
          type: "generation",
          title: "DAG root done",
          status: "done",
          resourceType: "project",
          resourceId: "proj_001"
        }
      });
      expect(rootCreate.statusCode).toBe(200);
      const rootId = (rootCreate.json() as { item: { id: string } }).item.id;

      const childCreate = await app.inject({
        method: "POST",
        url: "/jobs",
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_default"
        },
        payload: {
          type: "generation",
          title: "DAG child ready",
          status: "idle",
          resourceType: "project",
          resourceId: "proj_001",
          dependencies: [rootId]
        }
      });
      expect(childCreate.statusCode).toBe(200);
      const child = (childCreate.json() as { item: { id: string; ready: boolean } }).item;
      expect(child.ready).toBe(true);

      const executable = await app.inject({
        method: "GET",
        url: "/jobs/executable",
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_default"
        }
      });
      expect(executable.statusCode).toBe(200);
      const executableIds = (executable.json() as { items: Array<{ id: string }> }).items.map((item) => item.id);
      expect(executableIds).toContain(child.id);
    });

    it("blocks running transition when dependencies are still pending", async () => {
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "admin@control-plane.local",
          password: "admin123!"
        }
      });
      expect(login.statusCode).toBe(200);
      const token = (login.json() as { item: { token: string } }).item.token;

      const parentCreate = await app.inject({
        method: "POST",
        url: "/jobs",
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_default"
        },
        payload: {
          type: "processing",
          title: "pending dependency parent",
          status: "running",
          resourceType: "project",
          resourceId: "proj_pending"
        }
      });
      expect(parentCreate.statusCode).toBe(200);
      const parentId = (parentCreate.json() as { item: { id: string } }).item.id;

      const childCreate = await app.inject({
        method: "POST",
        url: "/jobs",
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_default"
        },
        payload: {
          type: "generation",
          title: "pending dependency child",
          status: "idle",
          resourceType: "project",
          resourceId: "proj_pending",
          dependencies: [parentId]
        }
      });
      expect(childCreate.statusCode).toBe(200);
      const childId = (childCreate.json() as { item: { id: string } }).item.id;

      const blocked = await app.inject({
        method: "PATCH",
        url: `/jobs/${childId}/status`,
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_default"
        },
        payload: {
          status: "running"
        }
      });
      expect(blocked.statusCode).toBe(400);
      expect(blocked.json()).toMatchObject({ error: "invalid_request" });
    });

    it("supports parallel executable jobs from the same completed dependency", async () => {
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "admin@control-plane.local",
          password: "admin123!"
        }
      });
      expect(login.statusCode).toBe(200);
      const token = (login.json() as { item: { token: string } }).item.token;

      const rootCreate = await app.inject({
        method: "POST",
        url: "/jobs",
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_default"
        },
        payload: {
          type: "processing",
          title: "parallel root",
          status: "done",
          resourceType: "project",
          resourceId: "proj_parallel"
        }
      });
      expect(rootCreate.statusCode).toBe(200);
      const rootId = (rootCreate.json() as { item: { id: string } }).item.id;

      const firstCreate = await app.inject({
        method: "POST",
        url: "/jobs",
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_default"
        },
        payload: {
          type: "processing",
          title: "parallel child 1",
          status: "idle",
          resourceType: "project",
          resourceId: "proj_parallel",
          dependencies: [rootId]
        }
      });
      expect(firstCreate.statusCode).toBe(200);
      const firstId = (firstCreate.json() as { item: { id: string } }).item.id;

      const secondCreate = await app.inject({
        method: "POST",
        url: "/jobs",
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_default"
        },
        payload: {
          type: "review",
          title: "parallel child 2",
          status: "idle",
          resourceType: "project",
          resourceId: "proj_parallel",
          dependencies: [rootId]
        }
      });
      expect(secondCreate.statusCode).toBe(200);
      const secondId = (secondCreate.json() as { item: { id: string } }).item.id;

      const executable = await app.inject({
        method: "GET",
        url: "/jobs/executable?projectId=proj_parallel",
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_default"
        }
      });
      expect(executable.statusCode).toBe(200);
      const executableIds = new Set(
        (executable.json() as { items: Array<{ id: string }> }).items.map((item) => item.id)
      );
      expect(executableIds.has(firstId)).toBe(true);
      expect(executableIds.has(secondId)).toBe(true);
    });

    it("returns project-scoped jobs from /projects/:projectId/jobs", async () => {
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "admin@control-plane.local",
          password: "admin123!"
        }
      });
      expect(login.statusCode).toBe(200);
      const token = (login.json() as { item: { token: string } }).item.token;

      const createResponse = await app.inject({
        method: "POST",
        url: "/jobs",
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_default"
        },
        payload: {
          type: "generation",
          title: "project scoped visibility",
          status: "idle",
          resourceType: "project",
          resourceId: "proj_scoped"
        }
      });
      expect(createResponse.statusCode).toBe(200);
      const created = (createResponse.json() as { item: { id: string } }).item;

      const scopedList = await app.inject({
        method: "GET",
        url: "/projects/proj_scoped/jobs",
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": "tenant_default"
        }
      });
      expect(scopedList.statusCode).toBe(200);
      const scopedIds = new Set(
        (scopedList.json() as { items: Array<{ id: string }> }).items.map((item) => item.id)
      );
      expect(scopedIds.has(created.id)).toBe(true);
    });
  });
});
