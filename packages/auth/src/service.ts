import { randomUUID } from "node:crypto";
import type { Role, Session, User } from "@cp/domain";
import { hashPassword, hashSessionToken, verifyPassword } from "./crypto.js";
import { UnconfiguredExternalIdentityClient, type ExternalIdentityClient } from "./oidc.js";
import { hasPermission, roleTemplates } from "./policy.js";
import type {
  AuthenticatedSession,
  AuthenticateInput,
  AuthServiceOptions,
  AuthStore,
  CreateUserInput,
  FederatedAuthenticateInput,
  OidcCallbackInput,
  OidcStartInput,
  OidcStartResult,
  ScopeContext,
  SessionPrincipal
} from "./types.js";

const normalizeEmail = (email: string): string => email.trim().toLowerCase();
const sortUnique = <T>(values: T[]): T[] => [...new Set(values)];
const oidcDefaultRedirect = "urn:cp:oidc:callback";

const expiresAtOrInfinity = (expiresAt: string | undefined): number => {
  if (!expiresAt) return Number.POSITIVE_INFINITY;
  const ts = new Date(expiresAt).getTime();
  return Number.isFinite(ts) ? ts : Number.NEGATIVE_INFINITY;
};

const isExpired = (expiresAt: string | undefined, nowMs: number): boolean =>
  expiresAtOrInfinity(expiresAt) <= nowMs;

export class AuthService {
  private readonly now: () => Date;
  private readonly sessionTtlHours: number;
  private readonly sessionRefreshTtlHours: number;
  private readonly oidcStateTtlMinutes: number;
  private readonly idGenerator: () => string;
  private readonly tokenGenerator: () => string;
  private readonly federatedDefaultRoles: Role["name"][];
  private readonly externalIdentityClient: ExternalIdentityClient;

  constructor(
    private readonly store: AuthStore,
    options: AuthServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.sessionTtlHours = options.sessionTtlHours ?? 24;
    this.sessionRefreshTtlHours = options.sessionRefreshTtlHours ?? 24 * 14;
    this.oidcStateTtlMinutes = options.oidcStateTtlMinutes ?? 10;
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
    this.tokenGenerator = options.tokenGenerator ?? (() => randomUUID().replaceAll("-", ""));
    this.federatedDefaultRoles = options.federatedDefaultRoles ?? ["viewer"];
    this.externalIdentityClient = options.externalIdentityClient ?? new UnconfiguredExternalIdentityClient();
  }

  async ensureSystemRoles(actor = "system"): Promise<void> {
    for (const template of roleTemplates) {
      const existing = await this.store.getRoleByName(template.name);
      if (existing) continue;
      const now = this.now().toISOString();
      await this.store.createRole({
        id: this.idGenerator(),
        name: template.name,
        description: template.description,
        permissions: template.permissions,
        isSystem: template.isSystem,
        createdAt: now,
        createdBy: actor,
        updatedAt: now,
        updatedBy: actor
      });
    }
  }

  async listUsers(): Promise<User[]> {
    return this.store.listUsers();
  }

  async listRoles(): Promise<Role[]> {
    return this.store.listRoles();
  }

  async createRole(
    input: { name: Role["name"]; description: string; permissions: string[]; isSystem?: boolean },
    actor: string
  ): Promise<Role> {
    const existing = await this.store.getRoleByName(input.name);
    if (existing) {
      return existing;
    }

    const now = this.now().toISOString();
    return this.store.createRole({
      id: this.idGenerator(),
      name: input.name,
      description: input.description,
      permissions: sortUnique(input.permissions.filter((permission) => permission.trim().length > 0)),
      isSystem: input.isSystem ?? false,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor
    });
  }

  async updateRolePermissions(roleId: string, permissions: string[], actor: string): Promise<Role> {
    const role = await this.store.getRoleById(roleId);
    if (!role) {
      throw new Error(`Role not found: ${roleId}`);
    }

    const nextPermissions = sortUnique(permissions.map((permission) => permission.trim()).filter(Boolean));
    if (nextPermissions.length === 0) {
      throw new Error("At least one permission is required");
    }

    const now = this.now().toISOString();
    return this.store.updateRole(roleId, {
      permissions: nextPermissions,
      updatedAt: now,
      updatedBy: actor
    });
  }

  async createUser(input: CreateUserInput, actor: string): Promise<User> {
    await this.ensureSystemRoles(actor);
    const email = normalizeEmail(input.email);
    const existing = await this.store.getUserByEmail(email);
    if (existing) {
      throw new Error(`User already exists for email ${email}`);
    }

    const now = this.now().toISOString();
    const user: User = {
      id: this.idGenerator(),
      email,
      displayName: input.displayName,
      status: "active",
      passwordHash: hashPassword(input.password),
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor
    };
    const created = await this.store.createUser(user);

    await this.assignRoles(created.id, input.roles?.length ? input.roles : ["viewer"], actor);
    return created;
  }

  async assignRoles(userId: string, roleNames: Role["name"][], actor: string): Promise<void> {
    await this.ensureSystemRoles(actor);
    const roles = await this.resolveRoles(roleNames);
    const existing = await this.store.listUserRoles({ userId });
    const existingRoleIds = new Set(existing.map((entry) => entry.roleId));
    const now = this.now().toISOString();

    for (const role of roles) {
      if (existingRoleIds.has(role.id)) continue;
      await this.store.createUserRole({
        id: this.idGenerator(),
        userId,
        roleId: role.id,
        createdAt: now,
        createdBy: actor,
        updatedAt: now,
        updatedBy: actor
      });
    }
  }

  async assignProjectRole(
    userId: string,
    projectId: string,
    roleName: Role["name"],
    actor: string,
    expiresAt?: string
  ): Promise<void> {
    const role = (await this.resolveRoles([roleName]))[0];
    if (!role) {
      throw new Error(`Unknown role: ${roleName}`);
    }

    const existing = await this.store.listProjectRoleBindings({ userId, projectId, roleId: role.id });
    if (existing.length > 0) return;

    const now = this.now().toISOString();
    await this.store.createProjectRoleBinding({
      id: this.idGenerator(),
      userId,
      projectId,
      roleId: role.id,
      ...(expiresAt ? { expiresAt } : {}),
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor
    });
  }

  async removeProjectRoleBinding(bindingId: string): Promise<void> {
    await this.store.deleteProjectRoleBinding(bindingId);
  }

  async listProjectRoleBindings(filters?: { userId?: string; projectId?: string }) {
    return this.store.listProjectRoleBindings(filters);
  }

  async assignRepositoryRole(
    userId: string,
    repositoryId: string,
    roleName: Role["name"],
    actor: string,
    expiresAt?: string
  ): Promise<void> {
    const role = (await this.resolveRoles([roleName]))[0];
    if (!role) {
      throw new Error(`Unknown role: ${roleName}`);
    }

    const existing = await this.store.listRepositoryRoleBindings({ userId, repositoryId, roleId: role.id });
    if (existing.length > 0) return;

    const now = this.now().toISOString();
    await this.store.createRepositoryRoleBinding({
      id: this.idGenerator(),
      userId,
      repositoryId,
      roleId: role.id,
      ...(expiresAt ? { expiresAt } : {}),
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor
    });
  }

  async removeRepositoryRoleBinding(bindingId: string): Promise<void> {
    await this.store.deleteRepositoryRoleBinding(bindingId);
  }

  async listRepositoryRoleBindings(filters?: { userId?: string; repositoryId?: string }) {
    return this.store.listRepositoryRoleBindings(filters);
  }

  async grantDelegatedPermission(
    input: {
      grantedByUserId: string;
      granteeUserId: string;
      permission: string;
      scopeType: "global" | "project" | "repository";
      scopeId?: string;
      expiresAt: string;
    },
    actor: string
  ) {
    if (input.scopeType !== "global" && !input.scopeId) {
      throw new Error("scopeId is required for project/repository delegated permissions");
    }

    const now = this.now().toISOString();
    return this.store.createDelegatedPermission({
      id: this.idGenerator(),
      grantedByUserId: input.grantedByUserId,
      granteeUserId: input.granteeUserId,
      permission: input.permission,
      scopeType: input.scopeType,
      ...(input.scopeId ? { scopeId: input.scopeId } : {}),
      expiresAt: input.expiresAt,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor
    });
  }

  async revokeDelegatedPermission(delegatedPermissionId: string, actor: string): Promise<void> {
    const now = this.now().toISOString();
    await this.store.updateDelegatedPermission(delegatedPermissionId, {
      revokedAt: now,
      updatedAt: now,
      updatedBy: actor
    });
  }

  async listDelegatedPermissions(filters?: {
    granteeUserId?: string;
    permission?: string;
    scopeType?: "global" | "project" | "repository";
    scopeId?: string;
  }) {
    return this.store.listDelegatedPermissions(filters);
  }

  async authenticate(input: AuthenticateInput): Promise<AuthenticatedSession | null> {
    const email = normalizeEmail(input.email);
    const user = await this.store.getUserByEmail(email);
    if (!user || user.status !== "active") {
      return null;
    }

    if (!verifyPassword(input.password, user.passwordHash)) {
      return null;
    }

    const { roleNames, permissions } = await this.resolveUserRoleContext(user.id);
    return this.issueSession(
      user,
      roleNames,
      permissions,
      user.id,
      {
        ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
        ...(input.userAgent ? { userAgent: input.userAgent } : {})
      }
    );
  }

  async authenticateFederated(input: FederatedAuthenticateInput): Promise<AuthenticatedSession | null> {
    await this.ensureSystemRoles(input.subject);
    const email = normalizeEmail(input.email);
    const nowIso = this.now().toISOString();
    const existing = await this.store.getUserByEmail(email);
    if (existing && existing.status !== "active") {
      return null;
    }

    const user = existing
      ? await this.store.updateUser(existing.id, {
          displayName: input.displayName,
          updatedAt: nowIso,
          updatedBy: input.subject
        })
      : await this.createUser(
          {
            email,
            displayName: input.displayName,
            // Federated identities rely on the IdP; local password stays opaque.
            password: randomUUID(),
            roles: input.defaultRoles?.length ? input.defaultRoles : this.federatedDefaultRoles
          },
          input.subject
        );

    const { roleNames, permissions } = await this.resolveUserRoleContext(user.id);
    return this.issueSession(
      user,
      roleNames,
      permissions,
      input.subject,
      {
        ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
        ...(input.userAgent ? { userAgent: input.userAgent } : {})
      }
    );
  }

  async beginOidcAuthorization(input: OidcStartInput = {}): Promise<OidcStartResult> {
    const now = this.now();
    const nowIso = now.toISOString();
    const state = this.tokenGenerator();
    const nonce = this.tokenGenerator();
    const codeVerifier = this.tokenGenerator();

    const authStart = await this.externalIdentityClient.beginAuthorization({
      state,
      nonce,
      codeVerifier
    });

    const redirectUri = input.redirectUri ?? oidcDefaultRedirect;
    const expiresAt = new Date(now.getTime() + this.oidcStateTtlMinutes * 60 * 1000).toISOString();

    await this.store.createOidcAuthState({
      id: this.idGenerator(),
      provider: "oidc",
      state: authStart.state,
      nonce: authStart.nonce,
      codeVerifier: authStart.codeVerifier ?? codeVerifier,
      redirectUri,
      expiresAt,
      ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
      ...(input.userAgent ? { userAgent: input.userAgent } : {}),
      createdAt: nowIso,
      createdBy: "system",
      updatedAt: nowIso,
      updatedBy: "system"
    });

    return {
      authorizationUrl: authStart.authorizationUrl,
      state: authStart.state
    };
  }

  async completeOidcAuthorization(input: OidcCallbackInput): Promise<AuthenticatedSession> {
    if (!input.code || !input.state) {
      throw new Error("OIDC callback requires both code and state");
    }

    const stateRecord = await this.store.getOidcAuthStateByState(input.state);
    if (!stateRecord) {
      throw new Error("Invalid or expired OIDC state");
    }

    const now = this.now();
    const nowIso = now.toISOString();
    if (stateRecord.consumedAt) {
      throw new Error("OIDC state has already been consumed");
    }
    if (isExpired(stateRecord.expiresAt, now.getTime())) {
      throw new Error("OIDC state has expired");
    }

    const identity = await this.externalIdentityClient.exchangeCodeForIdentity({
      code: input.code,
      state: input.state,
      codeVerifier: stateRecord.codeVerifier
    });

    await this.store.updateOidcAuthState(stateRecord.id, {
      consumedAt: nowIso,
      updatedAt: nowIso,
      updatedBy: "system"
    });

    const session = await this.authenticateFederated({
      provider: "oidc",
      subject: `oidc:${identity.subject}`,
      email: identity.email,
      displayName: identity.displayName,
      ...(identity.claims ? { claims: identity.claims } : {}),
      ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
      ...(input.userAgent ? { userAgent: input.userAgent } : {})
    });

    if (!session) {
      throw new Error("Federated identity rejected");
    }

    return session;
  }

  async refreshSession(
    refreshToken: string,
    actor: string,
    sessionMetadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<AuthenticatedSession | null> {
    const refreshTokenHash = hashSessionToken(refreshToken);
    const existing = await this.store.getSessionByRefreshTokenHash(refreshTokenHash);
    if (!existing) return null;

    const now = this.now();
    const nowIso = now.toISOString();
    const nowMs = now.getTime();

    if (existing.revokedAt || existing.refreshRevokedAt) return null;
    if (isExpired(existing.refreshExpiresAt, nowMs)) return null;

    const user = await this.store.getUserById(existing.userId);
    if (!user || user.status !== "active") return null;

    await this.store.updateSession(existing.id, {
      revokedAt: nowIso,
      refreshRevokedAt: nowIso,
      updatedAt: nowIso,
      updatedBy: actor
    });

    const { roleNames, permissions } = await this.resolveUserRoleContext(user.id);
    return this.issueSession(user, roleNames, permissions, actor, sessionMetadata);
  }

  async resolvePrincipalFromToken(token: string): Promise<SessionPrincipal | null> {
    const tokenHash = hashSessionToken(token);
    const session = await this.store.getSessionByTokenHash(tokenHash);
    if (!session) return null;

    if (session.revokedAt) return null;
    if (new Date(session.expiresAt).getTime() <= this.now().getTime()) return null;

    const user = await this.store.getUserById(session.userId);
    if (!user || user.status !== "active") return null;

    const { roleNames, permissions } = await this.resolveUserRoleContext(user.id);
    return {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      roleNames,
      permissions,
      sessionId: session.id,
      authBypass: false
    };
  }

  async revokeSession(token: string, actor: string): Promise<void> {
    const tokenHash = hashSessionToken(token);
    const session = await this.store.getSessionByTokenHash(tokenHash);
    if (!session || session.revokedAt) return;

    const now = this.now().toISOString();
    await this.store.updateSession(session.id, {
      revokedAt: now,
      ...(session.refreshTokenHash ? { refreshRevokedAt: now } : {}),
      updatedAt: now,
      updatedBy: actor
    });
  }

  async revokeAllUserSessions(userId: string, actor: string, exceptSessionId?: string): Promise<number> {
    const sessions = await this.store.listSessions({ userId });
    const now = this.now().toISOString();
    let revoked = 0;

    for (const session of sessions) {
      if (session.revokedAt) continue;
      if (exceptSessionId && session.id === exceptSessionId) continue;
      await this.store.updateSession(session.id, {
        revokedAt: now,
        ...(session.refreshTokenHash ? { refreshRevokedAt: now } : {}),
        updatedAt: now,
        updatedBy: actor
      });
      revoked += 1;
    }

    return revoked;
  }

  async hasRole(userId: string, roleName: Role["name"]): Promise<boolean> {
    const { roleNames } = await this.resolveUserRoleContext(userId);
    return roleNames.includes(roleName);
  }

  can(principal: SessionPrincipal, permission: string): boolean {
    return hasPermission(principal.permissions, permission);
  }

  async canInScope(
    principal: SessionPrincipal,
    permission: string,
    scope: ScopeContext = {}
  ): Promise<boolean> {
    if (this.can(principal, permission)) {
      return true;
    }

    const nowMs = this.now().getTime();
    const scopedPermissions = await this.resolveScopedPermissions(principal.userId, scope, nowMs);
    if (hasPermission(scopedPermissions, permission)) {
      return true;
    }

    return this.hasDelegatedPermission(principal.userId, permission, scope, nowMs);
  }

  private async hasDelegatedPermission(
    userId: string,
    permission: string,
    scope: ScopeContext,
    nowMs: number
  ): Promise<boolean> {
    const entries = await this.store.listDelegatedPermissions({ granteeUserId: userId });

    for (const entry of entries) {
      if (entry.revokedAt) continue;
      if (isExpired(entry.expiresAt, nowMs)) continue;
      if (!hasPermission([entry.permission], permission)) continue;

      if (entry.scopeType === "global") {
        return true;
      }

      if (entry.scopeType === "project" && scope.projectId && entry.scopeId === scope.projectId) {
        return true;
      }

      if (entry.scopeType === "repository" && scope.repositoryId && entry.scopeId === scope.repositoryId) {
        return true;
      }
    }

    return false;
  }

  private async resolveScopedPermissions(
    userId: string,
    scope: ScopeContext,
    nowMs: number
  ): Promise<string[]> {
    if (!scope.projectId && !scope.repositoryId) {
      return [];
    }

    const roles = await this.store.listRoles();
    const roleById = new Map(roles.map((role) => [role.id, role] as const));
    const permissions: string[] = [];

    if (scope.projectId) {
      const bindings = await this.store.listProjectRoleBindings({ userId, projectId: scope.projectId });
      for (const binding of bindings) {
        if (isExpired(binding.expiresAt, nowMs)) continue;
        const role = roleById.get(binding.roleId);
        if (role) {
          permissions.push(...role.permissions);
        }
      }
    }

    if (scope.repositoryId) {
      const bindings = await this.store.listRepositoryRoleBindings({ userId, repositoryId: scope.repositoryId });
      for (const binding of bindings) {
        if (isExpired(binding.expiresAt, nowMs)) continue;
        const role = roleById.get(binding.roleId);
        if (role) {
          permissions.push(...role.permissions);
        }
      }
    }

    return sortUnique(permissions);
  }

  private async resolveRoles(roleNames: Role["name"][]): Promise<Role[]> {
    const unique = sortUnique(roleNames);
    const roles = await Promise.all(unique.map(async (roleName) => this.store.getRoleByName(roleName)));
    const missing = roles
      .map((role, index) => (role ? null : unique[index]))
      .filter((name): name is Role["name"] => Boolean(name));

    if (missing.length > 0) {
      throw new Error(`Unknown roles: ${missing.join(", ")}`);
    }

    return roles as Role[];
  }

  private async resolveUserRoleContext(
    userId: string
  ): Promise<{ roleNames: Role["name"][]; permissions: string[] }> {
    const links = await this.store.listUserRoles({ userId });
    if (links.length === 0) {
      return {
        roleNames: ["viewer"],
        permissions: roleTemplates.find((role) => role.name === "viewer")?.permissions ?? []
      };
    }

    const roles = await this.store.listRoles();
    const roleById = new Map(roles.map((role) => [role.id, role] as const));
    const linkedRoles = links
      .map((link) => roleById.get(link.roleId))
      .filter((role): role is Role => Boolean(role));

    const roleNames = sortUnique(linkedRoles.map((role) => role.name));
    const permissions = sortUnique(linkedRoles.flatMap((role) => role.permissions));
    return { roleNames, permissions };
  }

  private async issueSession(
    user: User,
    roleNames: Role["name"][],
    permissions: string[],
    actor: string,
    sessionMetadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<AuthenticatedSession> {
    const now = this.now();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + this.sessionTtlHours * 60 * 60 * 1000).toISOString();
    const refreshExpiresAt = new Date(
      now.getTime() + this.sessionRefreshTtlHours * 60 * 60 * 1000
    ).toISOString();

    const token = this.tokenGenerator();
    const refreshToken = this.tokenGenerator();
    const tokenHash = hashSessionToken(token);
    const refreshTokenHash = hashSessionToken(refreshToken);

    const session: Session = await this.store.createSession({
      id: this.idGenerator(),
      userId: user.id,
      tokenHash,
      refreshTokenHash,
      expiresAt,
      refreshExpiresAt,
      ...(sessionMetadata?.ipAddress ? { ipAddress: sessionMetadata.ipAddress } : {}),
      ...(sessionMetadata?.userAgent ? { userAgent: sessionMetadata.userAgent } : {}),
      createdAt: nowIso,
      createdBy: actor,
      updatedAt: nowIso,
      updatedBy: actor
    });

    const updatedUser = await this.store.updateUser(user.id, {
      lastLoginAt: nowIso,
      updatedAt: nowIso,
      updatedBy: actor
    });

    return { token, refreshToken, session, user: updatedUser, roleNames, permissions };
  }
}
