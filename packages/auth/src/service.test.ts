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
import type { ExternalIdentityClient } from "./oidc.js";
import { hashSessionToken } from "./crypto.js";
import { AuthService } from "./service.js";
import type { AuthStore } from "./types.js";

class InMemoryAuthStore implements AuthStore {
  users = new Map<string, User>();
  roles = new Map<string, Role>();
  userRoles = new Map<string, UserRole>();
  sessions = new Map<string, Session>();
  projectRoleBindings = new Map<string, ProjectRoleBinding>();
  repositoryRoleBindings = new Map<string, RepositoryRoleBinding>();
  delegatedPermissions = new Map<string, DelegatedPermission>();
  oidcAuthStates = new Map<string, OidcAuthState>();

  async listUsers(filters?: Record<string, unknown>): Promise<User[]> {
    return [...this.users.values()].filter((user) => this.matches(user, filters));
  }

  async getUserById(userId: string): Promise<User | null> {
    return this.users.get(userId) ?? null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return [...this.users.values()].find((user) => user.email === email) ?? null;
  }

  async createUser(user: User): Promise<User> {
    this.users.set(user.id, user);
    return user;
  }

  async updateUser(userId: string, patch: Partial<User>): Promise<User> {
    const current = this.users.get(userId);
    if (!current) throw new Error("user not found");
    const next = { ...current, ...patch };
    this.users.set(userId, next);
    return next;
  }

  async listRoles(filters?: Record<string, unknown>): Promise<Role[]> {
    return [...this.roles.values()].filter((role) => this.matches(role, filters));
  }

  async getRoleByName(name: Role["name"]): Promise<Role | null> {
    return [...this.roles.values()].find((role) => role.name === name) ?? null;
  }

  async getRoleById(roleId: string): Promise<Role | null> {
    return this.roles.get(roleId) ?? null;
  }

  async createRole(role: Role): Promise<Role> {
    this.roles.set(role.id, role);
    return role;
  }

  async updateRole(roleId: string, patch: Partial<Role>): Promise<Role> {
    const current = this.roles.get(roleId);
    if (!current) throw new Error("role not found");
    const next = { ...current, ...patch };
    this.roles.set(roleId, next);
    return next;
  }

  async listUserRoles(filters?: Record<string, unknown>): Promise<UserRole[]> {
    return [...this.userRoles.values()].filter((link) => this.matches(link, filters));
  }

  async createUserRole(userRole: UserRole): Promise<UserRole> {
    this.userRoles.set(userRole.id, userRole);
    return userRole;
  }

  async listSessions(filters?: Record<string, unknown>): Promise<Session[]> {
    return [...this.sessions.values()].filter((session) => this.matches(session, filters));
  }

  async getSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    return [...this.sessions.values()].find((session) => session.tokenHash === tokenHash) ?? null;
  }

  async getSessionByRefreshTokenHash(refreshTokenHash: string): Promise<Session | null> {
    return [...this.sessions.values()].find((session) => session.refreshTokenHash === refreshTokenHash) ?? null;
  }

  async createSession(session: Session): Promise<Session> {
    this.sessions.set(session.id, session);
    return session;
  }

  async updateSession(sessionId: string, patch: Partial<Session>): Promise<Session> {
    const current = this.sessions.get(sessionId);
    if (!current) throw new Error("session not found");
    const next = { ...current, ...patch };
    this.sessions.set(sessionId, next);
    return next;
  }

  async listProjectRoleBindings(filters?: Record<string, unknown>): Promise<ProjectRoleBinding[]> {
    return [...this.projectRoleBindings.values()].filter((binding) => this.matches(binding, filters));
  }

  async createProjectRoleBinding(binding: ProjectRoleBinding): Promise<ProjectRoleBinding> {
    this.projectRoleBindings.set(binding.id, binding);
    return binding;
  }

  async deleteProjectRoleBinding(bindingId: string): Promise<void> {
    this.projectRoleBindings.delete(bindingId);
  }

  async listRepositoryRoleBindings(filters?: Record<string, unknown>): Promise<RepositoryRoleBinding[]> {
    return [...this.repositoryRoleBindings.values()].filter((binding) => this.matches(binding, filters));
  }

  async createRepositoryRoleBinding(binding: RepositoryRoleBinding): Promise<RepositoryRoleBinding> {
    this.repositoryRoleBindings.set(binding.id, binding);
    return binding;
  }

  async deleteRepositoryRoleBinding(bindingId: string): Promise<void> {
    this.repositoryRoleBindings.delete(bindingId);
  }

  async listDelegatedPermissions(filters?: Record<string, unknown>): Promise<DelegatedPermission[]> {
    return [...this.delegatedPermissions.values()].filter((permission) => this.matches(permission, filters));
  }

  async createDelegatedPermission(permission: DelegatedPermission): Promise<DelegatedPermission> {
    this.delegatedPermissions.set(permission.id, permission);
    return permission;
  }

  async updateDelegatedPermission(
    delegatedPermissionId: string,
    patch: Partial<DelegatedPermission>
  ): Promise<DelegatedPermission> {
    const current = this.delegatedPermissions.get(delegatedPermissionId);
    if (!current) throw new Error("delegated permission not found");
    const next = { ...current, ...patch };
    this.delegatedPermissions.set(delegatedPermissionId, next);
    return next;
  }

  async createOidcAuthState(state: OidcAuthState): Promise<OidcAuthState> {
    this.oidcAuthStates.set(state.id, state);
    return state;
  }

  async getOidcAuthStateByState(stateValue: string): Promise<OidcAuthState | null> {
    return [...this.oidcAuthStates.values()].find((state) => state.state === stateValue) ?? null;
  }

  async updateOidcAuthState(stateId: string, patch: Partial<OidcAuthState>): Promise<OidcAuthState> {
    const current = this.oidcAuthStates.get(stateId);
    if (!current) throw new Error("oidc auth state not found");
    const next = { ...current, ...patch };
    this.oidcAuthStates.set(stateId, next);
    return next;
  }

  private matches(record: object, filters?: Record<string, unknown>): boolean {
    if (!filters) return true;
    return Object.entries(filters).every(([key, value]) => {
      if (value === undefined) return true;
      const recordValue = Reflect.get(record, key);
      return recordValue === value;
    });
  }
}

class StubOidcClient implements ExternalIdentityClient {
  provider = "oidc" as const;

  async beginAuthorization(request: { state: string; nonce: string; codeVerifier?: string }) {
    return {
      authorizationUrl: `https://idp.local/authorize?state=${request.state}`,
      state: request.state,
      nonce: request.nonce,
      ...(request.codeVerifier ? { codeVerifier: request.codeVerifier } : {})
    };
  }

  async exchangeCodeForIdentity(payload: { state: string; code: string }) {
    return {
      subject: `sub-${payload.code}`,
      email: `user-${payload.state}@example.com`,
      displayName: "OIDC User",
      claims: { state: payload.state }
    };
  }
}

describe("AuthService", () => {
  it("creates users, authenticates, resolves principal, and checks permissions", async () => {
    const store = new InMemoryAuthStore();
    const service = new AuthService(store, {
      now: () => new Date("2026-04-14T12:00:00.000Z"),
      idGenerator: (() => {
        let i = 0;
        return () => `id_${++i}`;
      })(),
      tokenGenerator: (() => {
        let i = 0;
        return () => `token_fixed_${++i}`;
      })()
    });

    const user = await service.createUser(
      {
        email: "admin@example.com",
        displayName: "Admin",
        password: "super-secret",
        roles: ["admin"]
      },
      "system"
    );

    const authenticated = await service.authenticate({
      email: "admin@example.com",
      password: "super-secret"
    });
    expect(authenticated).not.toBeNull();
    expect(authenticated?.user.id).toBe(user.id);
    expect(authenticated?.roleNames).toContain("admin");
    expect(authenticated?.permissions).toContain("*");
    expect(typeof authenticated?.refreshToken).toBe("string");

    const principal = await service.resolvePrincipalFromToken(authenticated!.token);
    expect(principal?.userId).toBe(user.id);
    expect(service.can(principal!, "provider.write")).toBe(true);

    const tokenHash = hashSessionToken(authenticated!.token);
    const storedSession = await store.getSessionByTokenHash(tokenHash);
    expect(storedSession?.userId).toBe(user.id);
    expect(storedSession?.refreshTokenHash).toBe(hashSessionToken(authenticated!.refreshToken));
  });

  it("refreshes sessions with refresh token rotation", async () => {
    const store = new InMemoryAuthStore();
    const service = new AuthService(store, {
      now: (() => {
        let now = new Date("2026-04-14T12:00:00.000Z").getTime();
        return () => {
          now += 1000;
          return new Date(now);
        };
      })(),
      tokenGenerator: (() => {
        let i = 0;
        return () => `rot_token_${++i}`;
      })()
    });

    await service.createUser(
      {
        email: "viewer@example.com",
        displayName: "Viewer",
        password: "viewer-pass",
        roles: ["viewer"]
      },
      "system"
    );

    const authOk = await service.authenticate({
      email: "viewer@example.com",
      password: "viewer-pass"
    });
    expect(authOk).not.toBeNull();

    const refreshed = await service.refreshSession(authOk!.refreshToken, "user_viewer");
    expect(refreshed).not.toBeNull();
    expect(refreshed?.token).not.toBe(authOk?.token);

    const oldPrincipal = await service.resolvePrincipalFromToken(authOk!.token);
    expect(oldPrincipal).toBeNull();

    const newPrincipal = await service.resolvePrincipalFromToken(refreshed!.token);
    expect(newPrincipal?.email).toBe("viewer@example.com");
  });

  it("supports scoped permissions and delegated grants", async () => {
    const store = new InMemoryAuthStore();
    const service = new AuthService(store, {
      now: () => new Date("2026-04-14T12:00:00.000Z"),
      idGenerator: (() => {
        let i = 0;
        return () => `id_${++i}`;
      })(),
      tokenGenerator: (() => {
        let i = 0;
        return () => `token_scope_${++i}`;
      })()
    });

    const user = await service.createUser(
      {
        email: "scoped@example.com",
        displayName: "Scoped",
        password: "scoped-pass",
        roles: ["viewer"]
      },
      "system"
    );

    await service.assignProjectRole(user.id, "proj_1", "editor", "system");
    await service.grantDelegatedPermission(
      {
        grantedByUserId: "system",
        granteeUserId: user.id,
        permission: "approval.decide",
        scopeType: "project",
        scopeId: "proj_2",
        expiresAt: "2026-12-31T23:59:59.000Z"
      },
      "system"
    );

    const auth = await service.authenticate({ email: "scoped@example.com", password: "scoped-pass" });
    expect(auth).not.toBeNull();

    const principal = await service.resolvePrincipalFromToken(auth!.token);
    expect(principal).not.toBeNull();

    const canWriteProject1 = await service.canInScope(principal!, "project.write", { projectId: "proj_1" });
    const canWriteProject2 = await service.canInScope(principal!, "project.write", { projectId: "proj_2" });
    const canApproveProject2 = await service.canInScope(principal!, "approval.decide", { projectId: "proj_2" });

    expect(canWriteProject1).toBe(true);
    expect(canWriteProject2).toBe(false);
    expect(canApproveProject2).toBe(true);
  });

  it("supports oidc authorization begin/callback flow", async () => {
    const store = new InMemoryAuthStore();
    const service = new AuthService(store, {
      now: () => new Date("2026-04-14T12:00:00.000Z"),
      idGenerator: (() => {
        let i = 0;
        return () => `id_${++i}`;
      })(),
      tokenGenerator: (() => {
        let i = 0;
        return () => `oidc_token_${++i}`;
      })(),
      externalIdentityClient: new StubOidcClient()
    });

    const start = await service.beginOidcAuthorization({
      redirectUri: "http://localhost:5173/auth/oidc/callback"
    });

    expect(start.authorizationUrl).toContain("state=");
    expect(start.state).toContain("oidc_token");

    const callback = await service.completeOidcAuthorization({
      state: start.state,
      code: "abc123"
    });

    expect(callback.user.email).toContain("@example.com");
    expect(callback.roleNames).toContain("viewer");
  });
});
