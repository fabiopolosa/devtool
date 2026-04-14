import type { FastifyReply, FastifyRequest } from "fastify";
import {
  AuthService,
  createOidcClientFromEnv,
  type AuthStore,
  type ScopeContext,
  type SessionPrincipal
} from "@cp/auth";
import type {
  DelegatedPermission,
  OidcAuthState,
  ProjectRoleBinding,
  RepositoryRoleBinding,
  Role,
  Session,
  User,
  UserRole
} from "@cp/domain";
import { apiStore } from "../services/api-store.js";

declare module "fastify" {
  interface FastifyInstance {
    authRuntime: ApiAuthRuntime;
  }

  interface FastifyRequest {
    authPrincipal: SessionPrincipal | undefined;
  }
}

export interface ApiAuthRuntime {
  enabled: boolean;
  oidcEnabled: boolean;
  oidcRedirectUri?: string;
  service: AuthService;
  bypassPrincipal: SessionPrincipal;
}

const boolFlag = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const numberFlag = (value: string | undefined, defaultValue: number): number => {
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
};

class ApiStoreAuthAdapter implements AuthStore {
  async listUsers(filters?: Record<string, unknown>): Promise<User[]> {
    const users = await apiStore.listUsers();
    return this.filter(users, filters);
  }

  async getUserById(userId: string): Promise<User | null> {
    return apiStore.getUserById(userId);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return apiStore.getUserByEmail(email);
  }

  async createUser(user: User): Promise<User> {
    return apiStore.createUser(user);
  }

  async updateUser(userId: string, patch: Partial<User>): Promise<User> {
    return apiStore.updateUser(userId, patch);
  }

  async listRoles(filters?: Record<string, unknown>): Promise<Role[]> {
    const roles = await apiStore.listRoles();
    return this.filter(roles, filters);
  }

  async getRoleByName(name: Role["name"]): Promise<Role | null> {
    return apiStore.getRoleByName(name);
  }

  async getRoleById(roleId: string): Promise<Role | null> {
    return apiStore.getRoleById(roleId);
  }

  async createRole(role: Role): Promise<Role> {
    return apiStore.createRole(role);
  }

  async updateRole(roleId: string, patch: Partial<Role>): Promise<Role> {
    return apiStore.updateRole(roleId, patch);
  }

  async listUserRoles(filters?: Record<string, unknown>): Promise<UserRole[]> {
    const userId = typeof filters?.userId === "string" ? filters.userId : undefined;
    const userRoles = await apiStore.listUserRoles(userId);
    return this.filter(userRoles, filters);
  }

  async createUserRole(userRole: UserRole): Promise<UserRole> {
    return apiStore.createUserRole(userRole);
  }

  async listSessions(filters?: Record<string, unknown>): Promise<Session[]> {
    const userId = typeof filters?.userId === "string" ? filters.userId : undefined;
    const sessions = await apiStore.listSessions(userId);
    return this.filter(sessions, filters);
  }

  async getSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    return apiStore.getSessionByTokenHash(tokenHash);
  }

  async getSessionByRefreshTokenHash(refreshTokenHash: string): Promise<Session | null> {
    return apiStore.getSessionByRefreshTokenHash(refreshTokenHash);
  }

  async createSession(session: Session): Promise<Session> {
    return apiStore.createSession(session);
  }

  async updateSession(sessionId: string, patch: Partial<Session>): Promise<Session> {
    return apiStore.updateSession(sessionId, patch);
  }

  async listProjectRoleBindings(filters?: Record<string, unknown>): Promise<ProjectRoleBinding[]> {
    const userId = typeof filters?.userId === "string" ? filters.userId : undefined;
    const projectId = typeof filters?.projectId === "string" ? filters.projectId : undefined;
    const roleId = typeof filters?.roleId === "string" ? filters.roleId : undefined;
    return apiStore.listProjectRoleBindings({
      ...(userId ? { userId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(roleId ? { roleId } : {})
    });
  }

  async createProjectRoleBinding(binding: ProjectRoleBinding): Promise<ProjectRoleBinding> {
    return apiStore.createProjectRoleBinding(binding);
  }

  async deleteProjectRoleBinding(bindingId: string): Promise<void> {
    await apiStore.deleteProjectRoleBinding(bindingId);
  }

  async listRepositoryRoleBindings(filters?: Record<string, unknown>): Promise<RepositoryRoleBinding[]> {
    const userId = typeof filters?.userId === "string" ? filters.userId : undefined;
    const repositoryId = typeof filters?.repositoryId === "string" ? filters.repositoryId : undefined;
    const roleId = typeof filters?.roleId === "string" ? filters.roleId : undefined;
    return apiStore.listRepositoryRoleBindings({
      ...(userId ? { userId } : {}),
      ...(repositoryId ? { repositoryId } : {}),
      ...(roleId ? { roleId } : {})
    });
  }

  async createRepositoryRoleBinding(binding: RepositoryRoleBinding): Promise<RepositoryRoleBinding> {
    return apiStore.createRepositoryRoleBinding(binding);
  }

  async deleteRepositoryRoleBinding(bindingId: string): Promise<void> {
    await apiStore.deleteRepositoryRoleBinding(bindingId);
  }

  async listDelegatedPermissions(filters?: Record<string, unknown>): Promise<DelegatedPermission[]> {
    const granteeUserId = typeof filters?.granteeUserId === "string" ? filters.granteeUserId : undefined;
    const permission = typeof filters?.permission === "string" ? filters.permission : undefined;
    const scopeType = typeof filters?.scopeType === "string" ? filters.scopeType : undefined;
    const scopeId = typeof filters?.scopeId === "string" ? filters.scopeId : undefined;
    return apiStore.listDelegatedPermissions({
      ...(granteeUserId ? { granteeUserId } : {}),
      ...(permission ? { permission } : {}),
      ...(scopeType ? { scopeType } : {}),
      ...(scopeId ? { scopeId } : {})
    });
  }

  async createDelegatedPermission(permission: DelegatedPermission): Promise<DelegatedPermission> {
    return apiStore.createDelegatedPermission(permission);
  }

  async updateDelegatedPermission(
    delegatedPermissionId: string,
    patch: Partial<DelegatedPermission>
  ): Promise<DelegatedPermission> {
    return apiStore.updateDelegatedPermission(delegatedPermissionId, patch);
  }

  async createOidcAuthState(state: OidcAuthState): Promise<OidcAuthState> {
    return apiStore.createOidcAuthState(state);
  }

  async getOidcAuthStateByState(stateValue: string): Promise<OidcAuthState | null> {
    return apiStore.getOidcAuthStateByState(stateValue);
  }

  async updateOidcAuthState(stateId: string, patch: Partial<OidcAuthState>): Promise<OidcAuthState> {
    return apiStore.updateOidcAuthState(stateId, patch);
  }

  private filter<T extends object>(rows: T[], filters?: Record<string, unknown>): T[] {
    if (!filters) return rows;
    return rows.filter((row) =>
      Object.entries(filters).every(([key, value]) => {
        if (value === undefined) return true;
        const rowValue = Reflect.get(row, key);
        return rowValue === value;
      })
    );
  }
}

export const createAuthRuntime = async (): Promise<ApiAuthRuntime> => {
  const enabled = boolFlag(process.env.AUTH_ENABLED, false);
  const oidcEnabled = boolFlag(process.env.AUTH_OIDC_ENABLED, false);
  const oidcRedirectUri = process.env.AUTH_OIDC_REDIRECT_URI?.trim() || undefined;
  const sessionTtlHours = numberFlag(process.env.AUTH_SESSION_TTL_HOURS, 24);
  const sessionRefreshTtlHours = numberFlag(process.env.AUTH_SESSION_REFRESH_TTL_HOURS, 24 * 14);
  const service = new AuthService(new ApiStoreAuthAdapter(), {
    sessionTtlHours,
    sessionRefreshTtlHours,
    externalIdentityClient: createOidcClientFromEnv()
  });
  await service.ensureSystemRoles("system");

  return {
    enabled,
    oidcEnabled,
    ...(oidcRedirectUri ? { oidcRedirectUri } : {}),
    service,
    bypassPrincipal: {
      userId: "system",
      email: "system@local",
      displayName: "System",
      roleNames: ["admin"],
      permissions: ["*"],
      authBypass: true
    }
  };
};

const parseBearer = (headerValue?: string): string | null => {
  if (!headerValue) return null;
  const [scheme, value] = headerValue.split(" ");
  if (!scheme || !value) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return value.trim();
};

export const resolveRequestPrincipal = async (
  request: FastifyRequest,
  runtime: ApiAuthRuntime
): Promise<SessionPrincipal | undefined> => {
  if (!runtime.enabled) {
    return runtime.bypassPrincipal;
  }

  const token = parseBearer(request.headers.authorization);
  if (!token) {
    return undefined;
  }

  const principal = await runtime.service.resolvePrincipalFromToken(token);
  if (!principal) {
    return undefined;
  }

  return principal;
};

export const requireAuthenticated = (request: FastifyRequest, reply: FastifyReply): SessionPrincipal | null => {
  if (!request.authPrincipal) {
    reply.code(401).send({
      error: "unauthenticated",
      message: "Authentication required"
    });
    return null;
  }
  return request.authPrincipal;
};

export const requireRole = (
  request: FastifyRequest,
  reply: FastifyReply,
  roleName: Role["name"]
): SessionPrincipal | null => {
  const principal = requireAuthenticated(request, reply);
  if (!principal) return null;
  if (!principal.roleNames.includes(roleName)) {
    reply.code(403).send({
      error: "forbidden",
      message: `Missing required role: ${roleName}`
    });
    return null;
  }
  return principal;
};

export const requirePermission = (
  request: FastifyRequest,
  reply: FastifyReply,
  permission: string
): SessionPrincipal | null => {
  const principal = requireAuthenticated(request, reply);
  if (!principal) return null;
  if (!request.server.authRuntime.service.can(principal, permission)) {
    reply.code(403).send({
      error: "forbidden",
      message: `Missing required permission: ${permission}`
    });
    return null;
  }
  return principal;
};

export const requireScopedPermission = async (
  request: FastifyRequest,
  reply: FastifyReply,
  permission: string,
  scope: ScopeContext
): Promise<SessionPrincipal | null> => {
  const principal = requireAuthenticated(request, reply);
  if (!principal) return null;

  const authorized = await request.server.authRuntime.service.canInScope(principal, permission, scope);
  if (!authorized) {
    reply.code(403).send({
      error: "forbidden",
      message: `Missing required permission: ${permission}`,
      scope
    });
    return null;
  }

  return principal;
};

export const extractBearerToken = (authorizationHeader?: string): string | null =>
  parseBearer(authorizationHeader);
