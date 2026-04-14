import type { FastifyInstance } from "fastify";

describe("Admin RBAC + audit endpoints", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.API_STORE_MODE = "in_memory";
    process.env.AUTH_ENABLED = "1";

    const { buildApp } = await import("../app.js");
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) await app.close();
    delete process.env.AUTH_ENABLED;
  });

  it("requires authentication for /admin/roles", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/admin/roles"
    });

    expect(response.statusCode).toBe(401);
  });

  it("requires admin role for /admin/roles", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "viewer@control-plane.local",
        password: "viewer123!"
      }
    });
    expect(login.statusCode).toBe(200);
    const token = login.json().item.token as string;

    const response = await app.inject({
      method: "GET",
      url: "/admin/roles",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(403);
  });

  it("allows scoped editor bindings to update project and task resources", async () => {
    const viewerLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "viewer@control-plane.local",
        password: "viewer123!"
      }
    });
    expect(viewerLogin.statusCode).toBe(200);
    const token = viewerLogin.json().item.token as string;

    const updateProject = await app.inject({
      method: "PATCH",
      url: "/admin/projects/proj_001",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        description: "Scoped edit applied"
      }
    });
    expect(updateProject.statusCode).toBe(200);

    const updateTask = await app.inject({
      method: "PATCH",
      url: "/admin/tasks/task_001",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: "Scoped editor can update this task"
      }
    });
    expect(updateTask.statusCode).toBe(200);

    const createProjectDenied = await app.inject({
      method: "POST",
      url: "/admin/projects",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        key: "viewer-create-project-denied",
        name: "Should be denied"
      }
    });
    expect(createProjectDenied.statusCode).toBe(403);
  });

  it("allows admin role management and records audit events", async () => {
    const adminLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@control-plane.local",
        password: "admin123!"
      }
    });
    expect(adminLogin.statusCode).toBe(200);
    const adminToken = adminLogin.json().item.token as string;

    const rolesResponse = await app.inject({
      method: "GET",
      url: "/admin/roles",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(rolesResponse.statusCode).toBe(200);
    const roles = rolesResponse.json().items as Array<{ id: string; name: string }>;
    expect(roles.some((role) => role.name === "editor")).toBe(true);

    const viewerRole = roles.find((role) => role.name === "viewer");
    expect(viewerRole).toBeDefined();

    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/admin/roles/${viewerRole!.id}/permissions`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        permissions: ["project.read", "task.read", "memory.read"]
      }
    });
    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json().item.permissions).toContain("task.read");

    const projectResponse = await app.inject({
      method: "POST",
      url: "/admin/projects",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        key: "auth-rbac-slice",
        name: "Auth RBAC Slice"
      }
    });
    expect(projectResponse.statusCode).toBe(200);
    const projectId = projectResponse.json().item.id as string;
    expect(typeof projectId).toBe("string");

    const updateTaskResponse = await app.inject({
      method: "PATCH",
      url: "/admin/tasks/task_001",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: "Implement API scaffold with audit"
      }
    });
    expect(updateTaskResponse.statusCode).toBe(200);

    const auditResponse = await app.inject({
      method: "GET",
      url: "/admin/audit-events",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(auditResponse.statusCode).toBe(200);
    const events = auditResponse.json().items as Array<{ action: string }>;
    expect(events.some((event) => event.action === "admin.project.create")).toBe(true);
    expect(events.some((event) => event.action === "admin.task.update")).toBe(true);
  });

  it("allows admin to manage scoped bindings and delegated permissions", async () => {
    const adminLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@control-plane.local",
        password: "admin123!"
      }
    });
    expect(adminLogin.statusCode).toBe(200);
    const adminToken = adminLogin.json().item.token as string;

    const projectBindingCreate = await app.inject({
      method: "POST",
      url: "/admin/project-role-bindings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId: "user_viewer_001",
        projectId: "proj_001",
        roleName: "viewer"
      }
    });
    expect(projectBindingCreate.statusCode).toBe(200);
    expect(Array.isArray(projectBindingCreate.json().items)).toBe(true);

    const delegatedCreate = await app.inject({
      method: "POST",
      url: "/admin/delegated-permissions",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        granteeUserId: "user_viewer_001",
        permission: "run.execute",
        scopeType: "project",
        scopeId: "proj_001",
        expiresAt: "2026-12-31T23:59:59.000Z"
      }
    });
    expect(delegatedCreate.statusCode).toBe(200);
    const delegatedPermissionId = delegatedCreate.json().item.id as string;
    expect(typeof delegatedPermissionId).toBe("string");

    const delegatedList = await app.inject({
      method: "GET",
      url: "/admin/delegated-permissions",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(delegatedList.statusCode).toBe(200);
    expect(
      (delegatedList.json().items as Array<{ id: string }>).some((item) => item.id === delegatedPermissionId)
    ).toBe(true);

    const delegatedRevoke = await app.inject({
      method: "POST",
      url: `/admin/delegated-permissions/${delegatedPermissionId}/revoke`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(delegatedRevoke.statusCode).toBe(200);
  });
});
