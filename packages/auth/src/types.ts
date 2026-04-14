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
import type { ExternalIdentityClient, ExternalIdentityProvider } from "./oidc.js";

export interface AuthStore {
  listUsers(filters?: Record<string, unknown>): Promise<User[]>;
  getUserById(userId: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  createUser(user: User): Promise<User>;
  updateUser(userId: string, patch: Partial<User>): Promise<User>;

  listRoles(filters?: Record<string, unknown>): Promise<Role[]>;
  getRoleById(roleId: string): Promise<Role | null>;
  getRoleByName(name: Role["name"]): Promise<Role | null>;
  createRole(role: Role): Promise<Role>;
  updateRole(roleId: string, patch: Partial<Role>): Promise<Role>;

  listUserRoles(filters?: Record<string, unknown>): Promise<UserRole[]>;
  createUserRole(userRole: UserRole): Promise<UserRole>;

  listSessions(filters?: Record<string, unknown>): Promise<Session[]>;
  getSessionByTokenHash(tokenHash: string): Promise<Session | null>;
  getSessionByRefreshTokenHash(refreshTokenHash: string): Promise<Session | null>;
  createSession(session: Session): Promise<Session>;
  updateSession(sessionId: string, patch: Partial<Session>): Promise<Session>;

  listProjectRoleBindings(filters?: Record<string, unknown>): Promise<ProjectRoleBinding[]>;
  createProjectRoleBinding(binding: ProjectRoleBinding): Promise<ProjectRoleBinding>;
  deleteProjectRoleBinding(bindingId: string): Promise<void>;

  listRepositoryRoleBindings(filters?: Record<string, unknown>): Promise<RepositoryRoleBinding[]>;
  createRepositoryRoleBinding(binding: RepositoryRoleBinding): Promise<RepositoryRoleBinding>;
  deleteRepositoryRoleBinding(bindingId: string): Promise<void>;

  listDelegatedPermissions(filters?: Record<string, unknown>): Promise<DelegatedPermission[]>;
  createDelegatedPermission(permission: DelegatedPermission): Promise<DelegatedPermission>;
  updateDelegatedPermission(
    delegatedPermissionId: string,
    patch: Partial<DelegatedPermission>
  ): Promise<DelegatedPermission>;

  createOidcAuthState(state: OidcAuthState): Promise<OidcAuthState>;
  getOidcAuthStateByState(stateValue: string): Promise<OidcAuthState | null>;
  updateOidcAuthState(stateId: string, patch: Partial<OidcAuthState>): Promise<OidcAuthState>;
}

export interface AuthServiceOptions {
  sessionTtlHours?: number;
  sessionRefreshTtlHours?: number;
  oidcStateTtlMinutes?: number;
  now?: () => Date;
  idGenerator?: () => string;
  tokenGenerator?: () => string;
  federatedDefaultRoles?: Role["name"][];
  externalIdentityClient?: ExternalIdentityClient;
}

export interface SessionPrincipal {
  userId: string;
  email: string;
  displayName: string;
  roleNames: Role["name"][];
  permissions: string[];
  sessionId?: string;
  authBypass: boolean;
}

export interface CreateUserInput {
  email: string;
  displayName: string;
  password: string;
  roles?: Role["name"][];
}

export interface AuthenticateInput {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface FederatedAuthenticateInput {
  provider: ExternalIdentityProvider;
  subject: string;
  email: string;
  displayName: string;
  claims?: Record<string, unknown>;
  defaultRoles?: Role["name"][];
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthenticatedSession {
  token: string;
  refreshToken: string;
  session: Session;
  user: User;
  roleNames: Role["name"][];
  permissions: string[];
}

export interface ScopeContext {
  projectId?: string;
  repositoryId?: string;
}

export interface OidcStartInput {
  redirectUri?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface OidcStartResult {
  authorizationUrl: string;
  state: string;
}

export interface OidcCallbackInput {
  code: string;
  state: string;
  ipAddress?: string;
  userAgent?: string;
}
