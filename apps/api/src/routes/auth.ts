import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { TenantRole } from "@cp/domain";
import { extractBearerToken, requireAuthenticated, requirePermission } from "../auth/runtime.js";
import { apiStore } from "../services/api-store.js";
import { auditLogService } from "../services/audit-log-service.js";
import { requireTenantPermission } from "../tenant/rbac.js";

interface LoginBody {
  email: string;
  password: string;
}

interface CreateUserBody {
  email: string;
  displayName: string;
  password: string;
  roles?: Array<"admin" | "editor" | "operator" | "viewer">;
  tenantRole?: TenantRole;
}

interface AssignRolesBody {
  roles: Array<"admin" | "editor" | "operator" | "viewer">;
}

interface AssignTenantMembershipBody {
  role: TenantRole;
}

interface RefreshBody {
  refreshToken: string;
}

const tenantRoles: TenantRole[] = ["owner", "admin", "manager", "user", "guest"];

const isTenantRole = (value: unknown): value is TenantRole =>
  typeof value === "string" && tenantRoles.includes(value as TenantRole);

const canAssignTenantOwnerRole = (tenantRole: TenantRole | undefined, authBypass: boolean): boolean =>
  authBypass || tenantRole === "owner";

const resolveDefaultTenantContext = async (
  userId: string
): Promise<{ tenantId?: string; tenantRole?: string }> => {
  const memberships = await apiStore.listUserTenants({ userId });
  const primaryMembership = memberships[0];
  if (!primaryMembership) {
    return {};
  }
  return {
    tenantId: primaryMembership.tenantId,
    tenantRole: primaryMembership.role
  };
};

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const requireUsersManagement = (request: FastifyRequest, reply: FastifyReply) => {
    const principal = requireAuthenticated(request, reply);
    if (!principal) return null;
    if (principal.authBypass) return principal;
    if (!requireTenantPermission(request, reply, "canManageUsers")) return null;
    return principal;
  };

  fastify.post<{ Body: LoginBody }>("/auth/login", {
    schema: { tags: ["auth"], summary: "Authenticate and create a session token" }
  }, async (request, reply) => {
    const body = request.body;
    if (!body?.email || !body?.password) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "email and password are required"
      });
    }

    const result = await fastify.authRuntime.service.authenticate({
      email: body.email,
      password: body.password,
      ...(request.ip ? { ipAddress: request.ip } : {}),
      ...(request.headers["user-agent"] ? { userAgent: request.headers["user-agent"] } : {})
    });

    if (!result) {
      await auditLogService.record({
        action: "auth.login",
        resourceType: "user",
        status: "failure",
        metadata: { email: body.email, reason: "invalid_credentials" },
        actor: "anonymous"
      });
      return reply.code(401).send({
        error: "invalid_credentials",
        message: "Invalid email or password"
      });
    }

    await auditLogService.record({
      userId: result.user.id,
      action: "auth.login",
      resourceType: "session",
      resourceId: result.session.id,
      status: "success",
      metadata: { email: result.user.email },
      actor: result.user.id
    });

    const tenantContext = await resolveDefaultTenantContext(result.user.id);

    return {
      item: {
        token: result.token,
        refreshToken: result.refreshToken,
        sessionId: result.session.id,
        expiresAt: result.session.expiresAt,
        refreshExpiresAt: result.session.refreshExpiresAt,
        user: {
          id: result.user.id,
          email: result.user.email,
          displayName: result.user.displayName,
          status: result.user.status
        },
        roles: result.roleNames,
        permissions: result.permissions,
        ...(tenantContext.tenantId
          ? {
              tenantId: tenantContext.tenantId,
              tenantRole: tenantContext.tenantRole
            }
          : {})
      }
    };
  });

  fastify.post<{ Body: RefreshBody }>("/auth/refresh", {
    schema: { tags: ["auth"], summary: "Rotate refresh token and issue a new session token" }
  }, async (request, reply) => {
    const body = request.body;
    const refreshToken = body?.refreshToken?.trim();
    if (!refreshToken) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "refreshToken is required"
      });
    }

    const result = await fastify.authRuntime.service.refreshSession(refreshToken, "refresh_token", {
      ...(request.ip ? { ipAddress: request.ip } : {}),
      ...(request.headers["user-agent"] ? { userAgent: request.headers["user-agent"] } : {})
    });

    if (!result) {
      await auditLogService.record({
        action: "auth.refresh",
        resourceType: "session",
        status: "failure",
        metadata: { reason: "invalid_refresh_token" },
        actor: "anonymous"
      });
      return reply.code(401).send({
        error: "invalid_refresh_token",
        message: "Refresh token is invalid or expired"
      });
    }

    await auditLogService.record({
      userId: result.user.id,
      action: "auth.refresh",
      resourceType: "session",
      resourceId: result.session.id,
      status: "success",
      metadata: {},
      actor: result.user.id
    });

    const tenantContext = await resolveDefaultTenantContext(result.user.id);

    return {
      item: {
        token: result.token,
        refreshToken: result.refreshToken,
        sessionId: result.session.id,
        expiresAt: result.session.expiresAt,
        refreshExpiresAt: result.session.refreshExpiresAt,
        user: {
          id: result.user.id,
          email: result.user.email,
          displayName: result.user.displayName,
          status: result.user.status
        },
        roles: result.roleNames,
        permissions: result.permissions,
        ...(tenantContext.tenantId
          ? {
              tenantId: tenantContext.tenantId,
              tenantRole: tenantContext.tenantRole
            }
          : {})
      }
    };
  });

  fastify.post("/auth/logout", {
    schema: { tags: ["auth"], summary: "Revoke active session token" }
  }, async (request, reply) => {
    const principal = requireAuthenticated(request, reply);
    if (!principal) return;

    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "Bearer token is required"
      });
    }

    await fastify.authRuntime.service.revokeSession(token, principal.userId);
    await auditLogService.record({
      userId: principal.userId,
      action: "auth.logout",
      resourceType: "session",
      ...(principal.sessionId ? { resourceId: principal.sessionId } : {}),
      status: "success",
      metadata: {},
      actor: principal.userId
    });
    return { ok: true, message: "Session revoked" };
  });

  fastify.post("/auth/logout-all", {
    schema: { tags: ["auth"], summary: "Revoke all user sessions except the current one" }
  }, async (request, reply) => {
    const principal = requireAuthenticated(request, reply);
    if (!principal) return;

    const revoked = await fastify.authRuntime.service.revokeAllUserSessions(
      principal.userId,
      principal.userId,
      principal.sessionId
    );

    await auditLogService.record({
      userId: principal.userId,
      action: "auth.logout_all",
      resourceType: "session",
      status: "success",
      metadata: { revokedSessions: revoked },
      actor: principal.userId
    });

    return { ok: true, revokedSessions: revoked };
  });

  fastify.get("/auth/oidc/start", {
    schema: { tags: ["auth"], summary: "Start OIDC authorization code flow" }
  }, async (request, reply) => {
    if (!fastify.authRuntime.enabled || !fastify.authRuntime.oidcEnabled) {
      return reply.code(404).send({
        error: "not_found",
        message: "OIDC authentication is disabled"
      });
    }

    try {
      const start = await fastify.authRuntime.service.beginOidcAuthorization({
        ...(fastify.authRuntime.oidcRedirectUri ? { redirectUri: fastify.authRuntime.oidcRedirectUri } : {}),
        ...(request.ip ? { ipAddress: request.ip } : {}),
        ...(request.headers["user-agent"] ? { userAgent: request.headers["user-agent"] } : {})
      });

      return { item: start };
    } catch (error) {
      return reply.code(500).send({
        error: "oidc_start_failed",
        message: error instanceof Error ? error.message : "Unable to start OIDC flow"
      });
    }
  });

  fastify.get<{ Querystring: { code?: string; state?: string; error?: string } }>("/auth/oidc/callback", {
    schema: { tags: ["auth"], summary: "OIDC authorization callback" }
  }, async (request, reply) => {
    if (!fastify.authRuntime.enabled || !fastify.authRuntime.oidcEnabled) {
      return reply.code(404).send({
        error: "not_found",
        message: "OIDC authentication is disabled"
      });
    }

    if (request.query.error) {
      await auditLogService.record({
        action: "auth.oidc.callback",
        resourceType: "session",
        status: "failure",
        metadata: { error: request.query.error },
        actor: "anonymous"
      });
      return reply.code(400).send({
        error: "oidc_error",
        message: request.query.error
      });
    }

    if (!request.query.code || !request.query.state) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "code and state are required"
      });
    }

    try {
      const result = await fastify.authRuntime.service.completeOidcAuthorization({
        code: request.query.code,
        state: request.query.state,
        ...(request.ip ? { ipAddress: request.ip } : {}),
        ...(request.headers["user-agent"] ? { userAgent: request.headers["user-agent"] } : {})
      });

      await auditLogService.record({
        userId: result.user.id,
        action: "auth.oidc.callback",
        resourceType: "session",
        resourceId: result.session.id,
        status: "success",
        metadata: { email: result.user.email },
        actor: result.user.id
      });

      const tenantContext = await resolveDefaultTenantContext(result.user.id);

      return {
        item: {
          token: result.token,
          refreshToken: result.refreshToken,
          sessionId: result.session.id,
          expiresAt: result.session.expiresAt,
          refreshExpiresAt: result.session.refreshExpiresAt,
          user: {
            id: result.user.id,
            email: result.user.email,
            displayName: result.user.displayName,
            status: result.user.status
          },
          roles: result.roleNames,
          permissions: result.permissions,
          ...(tenantContext.tenantId
            ? {
                tenantId: tenantContext.tenantId,
                tenantRole: tenantContext.tenantRole
              }
            : {})
        }
      };
    } catch (error) {
      await auditLogService.record({
        action: "auth.oidc.callback",
        resourceType: "session",
        status: "failure",
        metadata: {
          reason: error instanceof Error ? error.message : "callback_failure"
        },
        actor: "anonymous"
      });
      return reply.code(401).send({
        error: "oidc_auth_failed",
        message: error instanceof Error ? error.message : "OIDC callback failed"
      });
    }
  });

  fastify.get("/auth/me", {
    schema: { tags: ["auth"], summary: "Return current principal context" }
  }, async (request, reply) => {
    const principal = requireAuthenticated(request, reply);
    if (!principal) return;

    return {
      item: {
        userId: principal.userId,
        email: principal.email,
        displayName: principal.displayName,
        roles: principal.roleNames,
        permissions: principal.permissions,
        authBypass: principal.authBypass,
        ...(request.tenantId ? { tenantId: request.tenantId } : {}),
        ...(request.tenantRole ? { tenantRole: request.tenantRole } : {})
      }
    };
  });

  fastify.get("/auth/users", {
    schema: { tags: ["auth"], summary: "List tenant-scoped users with roles and tenant membership" }
  }, async (request, reply) => {
    const principal = requireUsersManagement(request, reply);
    if (!principal) return;

    const tenantId = request.tenantId ?? "tenant_default";
    const tenantMemberships = await apiStore.listUserTenants({ tenantId });
    const userIds = new Set(tenantMemberships.map((entry) => entry.userId));
    const users = (await fastify.authRuntime.service.listUsers()).filter((user) => userIds.has(user.id));
    const userRoles = await apiStore.listUserRoles();
    const roles = await fastify.authRuntime.service.listRoles();
    const roleById = new Map(roles.map((role) => [role.id, role.name]));

    const roleNamesByUser = new Map<string, string[]>();
    for (const entry of userRoles) {
      if (!userIds.has(entry.userId)) continue;
      const roleName = roleById.get(entry.roleId);
      if (!roleName) continue;
      const existing = roleNamesByUser.get(entry.userId) ?? [];
      if (!existing.includes(roleName)) {
        existing.push(roleName);
      }
      roleNamesByUser.set(entry.userId, existing);
    }

    const tenantMembershipByUser = new Map(tenantMemberships.map((entry) => [entry.userId, entry]));

    return {
      items: users.map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
        roles: (roleNamesByUser.get(user.id) ?? []).sort((left, right) => left.localeCompare(right)),
        tenantMembership: (() => {
          const membership = tenantMembershipByUser.get(user.id);
          if (!membership) return null;
          return {
            id: membership.id,
            tenantId: membership.tenantId,
            role: membership.role
          };
        })(),
        self: user.id === principal.userId
      }))
    };
  });

  fastify.post<{ Body: CreateUserBody }>("/auth/users", {
    schema: { tags: ["auth"], summary: "Create user, assign roles, and attach tenant membership" }
  }, async (request, reply) => {
    const principal = requireUsersManagement(request, reply);
    if (!principal) return;

    const body = request.body;
    if (!body?.email || !body?.displayName || !body?.password) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "email, displayName and password are required"
      });
    }

    const tenantId = request.tenantId ?? "tenant_default";
    const tenantRole = body.tenantRole ?? "user";
    if (!isTenantRole(tenantRole)) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "tenantRole must be one of owner|admin|manager|user|guest"
      });
    }
    if (tenantRole === "owner" && !canAssignTenantOwnerRole(request.tenantRole, principal.authBypass)) {
      return reply.code(403).send({
        error: "forbidden",
        message: "Only tenant owners can assign owner membership."
      });
    }

    try {
      const created = await fastify.authRuntime.service.createUser(
        {
          email: body.email,
          displayName: body.displayName,
          password: body.password,
          ...(body.roles ? { roles: body.roles } : {})
        },
        principal.userId
      );

      await apiStore.createUserTenant({
        id: `user_tenant_${randomUUID()}`,
        userId: created.id,
        tenantId,
        role: tenantRole,
        createdAt: new Date().toISOString()
      });

      await auditLogService.record({
        userId: principal.userId,
        action: "auth.user.create",
        resourceType: "user",
        resourceId: created.id,
        status: "success",
        metadata: {
          email: created.email,
          roles: body.roles ?? ["viewer"],
          tenantId,
          tenantRole
        },
        actor: principal.userId
      });
      return {
        item: {
          id: created.id,
          email: created.email,
          displayName: created.displayName,
          status: created.status,
          roles: body.roles ?? ["viewer"],
          tenantMembership: {
            tenantId,
            role: tenantRole
          }
        }
      };
    } catch (error) {
      return reply.code(409).send({
        error: "conflict",
        message: error instanceof Error ? error.message : "Unable to create user"
      });
    }
  });

  fastify.post<{ Params: { userId: string }; Body: AssignRolesBody }>("/auth/users/:userId/roles", {
    schema: { tags: ["auth"], summary: "Assign roles to a tenant-scoped user" }
  }, async (request, reply) => {
    const principal = requireUsersManagement(request, reply);
    if (!principal) return;

    const tenantId = request.tenantId ?? "tenant_default";
    const tenantMembership = (await apiStore.listUserTenants({
      userId: request.params.userId,
      tenantId
    }))[0];
    if (!tenantMembership) {
      return reply.code(404).send({
        error: "not_found",
        message: "User is not a member of the current tenant."
      });
    }

    const roles = request.body?.roles ?? [];
    if (roles.length === 0) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "At least one role is required"
      });
    }

    try {
      await fastify.authRuntime.service.assignRoles(request.params.userId, roles, principal.userId);
      const allRoles = await fastify.authRuntime.service.listRoles();
      const roleById = new Map(allRoles.map((role) => [role.id, role.name]));
      const linkedRoles = await apiStore.listUserRoles(request.params.userId);
      const effectiveRoles = [...new Set(linkedRoles.map((link) => roleById.get(link.roleId)).filter(Boolean) as string[])]
        .sort((left, right) => left.localeCompare(right));

      await auditLogService.record({
        userId: principal.userId,
        action: "auth.user.roles.assign",
        resourceType: "user",
        resourceId: request.params.userId,
        status: "success",
        metadata: { roles },
        actor: principal.userId
      });
      return {
        ok: true,
        message: "Roles assigned",
        item: {
          userId: request.params.userId,
          roles: effectiveRoles,
          tenantMembership: {
            tenantId,
            role: tenantMembership.role
          }
        }
      };
    } catch (error) {
      return reply.code(400).send({
        error: "invalid_request",
        message: error instanceof Error ? error.message : "Unable to assign roles"
      });
    }
  });

  fastify.put<{ Params: { userId: string }; Body: AssignTenantMembershipBody }>("/auth/users/:userId/tenant-membership", {
    schema: { tags: ["auth"], summary: "Set tenant membership role for a user in the current tenant" }
  }, async (request, reply) => {
    const principal = requireUsersManagement(request, reply);
    if (!principal) return;

    const tenantId = request.tenantId ?? "tenant_default";
    const requestedRole = request.body?.role;
    if (!isTenantRole(requestedRole)) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "role must be one of owner|admin|manager|user|guest"
      });
    }
    if (requestedRole === "owner" && !canAssignTenantOwnerRole(request.tenantRole, principal.authBypass)) {
      return reply.code(403).send({
        error: "forbidden",
        message: "Only tenant owners can assign owner membership."
      });
    }

    const targetUser = await apiStore.getUserById(request.params.userId);
    if (!targetUser) {
      return reply.code(404).send({
        error: "not_found",
        message: "User not found"
      });
    }

    const existingMembership = (await apiStore.listUserTenants({
      userId: request.params.userId,
      tenantId
    }))[0];

    const nowIso = new Date().toISOString();
    const membership = existingMembership
      ? await apiStore.updateUserTenant(existingMembership.id, { role: requestedRole })
      : await apiStore.createUserTenant({
          id: `user_tenant_${randomUUID()}`,
          userId: request.params.userId,
          tenantId,
          role: requestedRole,
          createdAt: nowIso
        });

    await auditLogService.record({
      userId: principal.userId,
      action: "auth.user.tenant_membership.update",
      resourceType: "user_tenant",
      resourceId: membership.id,
      status: "success",
      metadata: {
        userId: request.params.userId,
        tenantId,
        role: requestedRole
      },
      actor: principal.userId
    });

    return {
      item: {
        userId: request.params.userId,
        tenantId,
        role: membership.role
      }
    };
  });

  fastify.get("/admin/authz-check", {
    schema: { tags: ["auth"], summary: "Protected admin route to verify guards" }
  }, async (request, reply) => {
    const principal = requirePermission(request, reply, "provider.write");
    if (!principal) return;

    return {
      ok: true,
      message: "authorized",
      principal: {
        userId: principal.userId,
        roles: principal.roleNames
      }
    };
  });
};
