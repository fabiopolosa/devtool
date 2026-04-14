# Auth & RBAC Plan (v1.2 Design + Initial Implementation)

## Objective
Introduce multi-user authentication and role-based authorization without breaking current API contracts, orchestration flows, or auditability.

## Scope
- Add authn/authz architecture and integration points.
- Keep current single-tenant behavior as default fallback.
- Add first admin UX for role/permission operations.
- Keep SSO/IdP wiring stubbed but pluggable.

## Implemented Slice (2026-04-14)
Implemented in this iteration:
- Dedicated auth package: `packages/auth`
  - session lifecycle (`create`, `resolve`, `revoke`)
  - password hashing/verification
  - role templates and permission checks
  - federated identity entrypoint (`authenticateFederated`) for OIDC/SAML handoff
  - external identity client abstraction + unconfigured OIDC stub (`oidc.ts`)
- Domain model/contracts:
  - `User`, `Role`, `UserRole`, `Session`
  - `AuditEvent`
  - zod schemas in `packages/domain/src/schemas/auth.schema.ts`
- Database:
  - migration `packages/db/migrations/003_auth_slice.sql`
  - migration `packages/db/migrations/004_audit_and_editor.sql`
  - tables: `users`, `roles`, `user_roles`, `sessions`
  - table: `audit_events`
- API integration:
  - runtime guard + principal resolution in `apps/api/src/auth/runtime.ts`
  - routes in `apps/api/src/routes/auth.ts`
  - admin RBAC/audit routes in `apps/api/src/routes/admin.ts`
  - protected route checks returning additive `401/403`
- Feature flag:
  - `AUTH_ENABLED` (default `0`) keeps auth disabled by default for backward-compatible single-tenant operation.
  - `VITE_AUTH_ENABLED` keeps login UX optional in the dashboard.

Implemented routes:
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /auth/users` (admin)
- `POST /auth/users` (admin)
- `POST /auth/users/:userId/roles` (admin)
- `GET /admin/authz-check` (permission-guarded)
- `GET /admin/roles`
- `POST /admin/roles`
- `PATCH /admin/roles/:roleId/permissions`
- `GET /admin/audit-events`
- `POST /admin/projects`
- `PATCH /admin/projects/:projectId`
- `POST /admin/tasks`
- `PATCH /admin/tasks/:taskId`

## Proposed Model

### Identity
- `User`: internal principal mapped to an external identity provider subject.
- `Session`: short-lived access token + refresh workflow.
- `ServicePrincipal`: non-human identity for worker/orchestrator automation.

### Authorization
- `Role`: named bundle of permissions (for example `admin`, `editor`, `operator`, `viewer`).
- `Permission`: granular action on a resource (for example `task.read`, `task.approve`, `provider.update`).
- `RoleBinding`: assignment of role to user/service principal at scope.

### Scopes
- `global`
- `project`
- `repository` (optional extension)

## Resource Permission Matrix (Initial)
- `projects`: `project.read`, `project.write`
- `repositories`: `repository.read`, `repository.write`
- `roadmap`: `roadmap.read`, `roadmap.write`, `roadmap.approve`
- `tasks/runs`: `task.read`, `task.write`, `run.execute`, `run.cancel`
- `approvals`: `approval.read`, `approval.decide`
- `memory/retrieval`: `memory.read`, `memory.write`
- `providers`: `provider.read`, `provider.write`, `provider.secret.manage`
- `experiments`: `experiment.read`, `experiment.write`, `experiment.promote`
- `chat`: `chat.read`, `chat.write`

## API Integration Points

### Fastify Layer
- Add `authn` pre-handler plugin:
  - Parse bearer token.
  - Resolve principal (`userId`, `tenantId`, claims).
- Add `authz` pre-handler helper:
  - `requirePermission(permission, scopeResolver)`
  - Supports project-aware checks from route params.

### Route Wiring
- Keep route URLs unchanged.
- Add per-route permission gates in `apps/api/src/routes/*.ts`.
- Return `403` with structured denial reason and correlation id.

### Worker/Orchestrator
- Introduce service token for `apps/worker` and orchestration callbacks.
- Tag `createdBy/updatedBy` with service principal id for audit consistency.

## Data Model Extensions
Current tables:
- `users`
- `sessions`
- `roles`
- `user_roles`
- `audit_events`

Planned next tables:
- `service_principals`
- `permissions`
- `role_permissions`
- `role_bindings`
- `auth_audit_events` (optional split from generic `audit_events`)

## UI Integration

### Session & Identity
- Add login guard at `apps/web` shell level.
- Add current user context in global store.
- Add login page + logout action.
- Add session status card ("Logged in as …") in app shell.

### Authorization-aware UI
- Hide/disable actions the principal cannot perform.
- Explicit reason in disabled controls (for example "Missing permission: roadmap.approve").
- Add admin views for role bindings and project-level access.
- Initial implementation: `/admin/rbac` page to list roles, update permissions, and inspect audit events.

## OIDC/SSO Integration (Current Slice)

Implemented:
- `packages/auth/src/oidc.ts` now includes:
  - `OidcHttpClient` with:
    - authorization URL creation
    - PKCE support (`code_challenge_method=S256`)
    - token exchange
    - userinfo fetch
  - `createOidcClientFromEnv` factory with feature flag and secret-ref resolution (`env://`, `secret://`)
  - `UnconfiguredExternalIdentityClient` fallback for safe disabled/unconfigured behavior
- `packages/auth/src/service.ts` now includes:
  - `beginOidcAuthorization(...)` with persisted state/nonce/code_verifier
  - `completeOidcAuthorization(...)` callback completion flow
  - `authenticateFederated(...)` bridge to local user/session lifecycle
- API routes:
  - `GET /auth/oidc/start`
  - `GET /auth/oidc/callback`

Operational flow:
1. Client starts OIDC via `GET /auth/oidc/start`.
2. Auth service stores transient state in `oidc_auth_states`.
3. Callback query (`code`, `state`) is completed through `GET /auth/oidc/callback`.
4. Federated identity is upserted into local user model and normal local session tokens are issued.
5. Existing RBAC checks remain local and provider-agnostic.

## Security Requirements
- JWT validation against configured issuer/audience.
- Refresh token rotation.
- Secret fields never returned in route payloads.
- Explicit audit event for role/permission changes.
- CSRF protections for cookie-based mode (if enabled).
- Session invalidation across devices (logout-all).
- Scoped role and delegated permission expiry enforcement.

## Rollout Plan
1. Completed: authn/authz service interfaces + compatibility-first runtime.
2. Completed: DB schema for users/roles/sessions/user-role bindings.
3. Completed (initial): protected optional auth/admin routes.
4. Completed: initial UI login/session UX.
5. Completed: audit-event persistence for auth/admin actions.
6. Completed: real OIDC start/callback routes and token exchange path.
7. Completed: scoped RBAC bindings (project/repository) and delegated admin flows.
8. Next: JWKS validation and enterprise SSO lifecycle hardening.

## Non-Goals (This Iteration)
- Full enterprise SSO setup (only abstraction points added).
- SCIM provisioning.
- Multi-tenant data partitioning enforcement at storage layer.

## Compatibility Notes
- Existing API contract shapes remain unchanged.
- Authorization errors are additive (`401`, `403`) and do not alter success payload formats.
