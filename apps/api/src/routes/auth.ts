import type { FastifyPluginAsync } from "fastify";
import { extractBearerToken, requireAuthenticated, requirePermission, requireRole } from "../auth/runtime.js";
import { auditLogService } from "../services/audit-log-service.js";

interface LoginBody {
  email: string;
  password: string;
}

interface CreateUserBody {
  email: string;
  displayName: string;
  password: string;
  roles?: Array<"admin" | "editor" | "operator" | "viewer">;
}

interface AssignRolesBody {
  roles: Array<"admin" | "editor" | "operator" | "viewer">;
}

interface RefreshBody {
  refreshToken: string;
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
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
        permissions: result.permissions
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
        permissions: result.permissions
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
          permissions: result.permissions
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
        authBypass: principal.authBypass
      }
    };
  });

  fastify.get("/auth/users", {
    schema: { tags: ["auth"], summary: "List users (admin role required)" }
  }, async (request, reply) => {
    const principal = requireRole(request, reply, "admin");
    if (!principal) return;

    const users = await fastify.authRuntime.service.listUsers();
    return {
      items: users.map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        status: user.status,
        lastLoginAt: user.lastLoginAt
      }))
    };
  });

  fastify.post<{ Body: CreateUserBody }>("/auth/users", {
    schema: { tags: ["auth"], summary: "Create user and assign roles (admin role required)" }
  }, async (request, reply) => {
    const principal = requireRole(request, reply, "admin");
    if (!principal) return;

    const body = request.body;
    if (!body?.email || !body?.displayName || !body?.password) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "email, displayName and password are required"
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
      await auditLogService.record({
        userId: principal.userId,
        action: "auth.user.create",
        resourceType: "user",
        resourceId: created.id,
        status: "success",
        metadata: { email: created.email, roles: body.roles ?? ["viewer"] },
        actor: principal.userId
      });
      return {
        item: {
          id: created.id,
          email: created.email,
          displayName: created.displayName,
          status: created.status
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
    schema: { tags: ["auth"], summary: "Assign roles to user (admin role required)" }
  }, async (request, reply) => {
    const principal = requireRole(request, reply, "admin");
    if (!principal) return;

    const roles = request.body?.roles ?? [];
    if (roles.length === 0) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "At least one role is required"
      });
    }

    try {
      await fastify.authRuntime.service.assignRoles(request.params.userId, roles, principal.userId);
      await auditLogService.record({
        userId: principal.userId,
        action: "auth.user.roles.assign",
        resourceType: "user",
        resourceId: request.params.userId,
        status: "success",
        metadata: { roles },
        actor: principal.userId
      });
      return { ok: true, message: "Roles assigned" };
    } catch (error) {
      return reply.code(400).send({
        error: "invalid_request",
        message: error instanceof Error ? error.message : "Unable to assign roles"
      });
    }
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
