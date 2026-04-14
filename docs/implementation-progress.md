# Implementation Progress — Execution Directive Follow-Through

Date: 2026-04-14

This log captures execution results for the approved sequential plan and keeps deviations explicit.

## Step 1 — Normalize Database Schema
Status: implemented

Implemented:
- Replaced generic JSON storage (`entity_records`) with normalized Drizzle table definitions for all core entities.
- Reworked Postgres repository mapping to table-per-entity persistence while preserving existing API envelopes.
- Added migration `002_normalized_tables.sql` that creates normalized tables and migrates legacy `entity_records` payloads.
- Hardened migration parsing for legacy `tasks.approvalsRequired` values (boolean, string, or array).

Key files:
- `packages/db/src/schema.ts`
- `packages/db/src/repository.ts`
- `packages/db/migrations/002_normalized_tables.sql`

Validation:
- `pnpm db:migrate` succeeds against real Postgres.
- Legacy migration path validated on synthetic legacy DB (`001_init.sql` + legacy inserts + `002_normalized_tables.sql`) with successful row transfer to normalized `projects`, `repositories`, and `tasks`.

Notes/deviation:
- Local machine had loopback Postgres collisions on default ports. Compose/env defaults were moved to `56432` for deterministic local execution.

## Step 2 — True End-to-End Provider Tests (Conditional)
Status: implemented

Implemented:
- Added real live-provider test suite with conditional execution gates (`PROVIDER_E2E`, provider key checks).
- Added unit tests for secret resolution, provider registry discovery, and routing fallback behavior.
- Live tests safely skip when credentials are not present.

Key files:
- `packages/providers/src/providers.live.test.ts`
- `packages/providers/src/providers.unit.test.ts`
- `packages/providers/vitest.config.ts`

Validation:
- Provider package test suite passes in default mode (credential-less) and is ready for credential-backed execution.

## Step 3 — Expand Package Test Coverage
Status: implemented

Implemented:
- Added meaningful tests (positive/negative) for:
  - `@cp/memory`
  - `@cp/retrieval`
  - `@cp/orchestration-ruflo`
  - `@cp/autoresearch`
  - `@cp/verifier`
- Replaced placeholder package test scripts with Vitest where requested.

Key files:
- `packages/memory/src/memory.service.test.ts`
- `packages/retrieval/src/retrieval.service.test.ts`
- `packages/orchestration-ruflo/src/__tests__/workflow.dryrun.test.ts`
- `packages/autoresearch/src/autoresearch.service.test.ts`
- `packages/verifier/src/pipeline.test.ts`
- `packages/verifier/src/runner.test.ts`

Validation:
- `pnpm test` passes monorepo-wide with new package assertions.

## Step 4 — Wire Visual and Performance Hooks into Verifier
Status: implemented

Implemented:
- Added real optional verifier tooling commands:
  - visual regression via Playwright screenshot/hash baseline
  - performance benchmark via Playwright timing metrics and thresholds
- Added hook planning helper for dashboard tasks.
- Added policy and env defaults for optional hook behavior.

Key files:
- `scripts/verifier/visual-regression.mjs`
- `scripts/verifier/performance-benchmark.mjs`
- `packages/verifier/src/tooling.ts`
- `configs/policies/verifier-hooks.json`
- `package.json`

Validation:
- Tooling scripts are executable and integrated via root scripts (`verify:visual`, `verify:performance`, `verify:smoke`).

## Step 5 — Auth/RBAC Plan
Status: implemented (design)

Implemented:
- Added initial multi-user auth/RBAC design with integration points for API and UI, role model, and rollout phases.

Key file:
- `docs/auth-rbac-plan.md`

Validation:
- Design aligns with current route boundaries and preserves existing API contracts for incremental adoption.

## Phase E — Auth/RBAC First Implementation Slice
Status: implemented

Implemented:
- Added dedicated `@cp/auth` package for session/authn/authz logic:
  - credential hashing/verification
  - session token hashing and revoke flow
  - system role provisioning (`admin`, `operator`, `viewer`)
  - permission evaluation helper
- Extended domain model/contracts with:
  - `User`, `Role`, `UserRole`, `Session`
  - auth schemas in `packages/domain/src/schemas/auth.schema.ts`
- Added DB migration and normalized persistence for auth entities:
  - `003_auth_slice.sql`
  - table wiring in `packages/db/src/schema.ts` and `packages/db/src/repository.ts`
- Added API auth runtime and protected optional routes (existing public contracts unchanged):
  - `/auth/login`
  - `/auth/logout`
  - `/auth/me`
  - `/auth/users`
  - `/auth/users/:userId/roles`
  - `/admin/authz-check`
- Added route guards returning additive `401`/`403` for protected endpoints only.
- Added auth tests:
  - `apps/api/src/__tests__/auth.contract.test.ts`
  - `packages/auth/src/service.test.ts`

Key files:
- `packages/auth/src/service.ts`
- `apps/api/src/auth/runtime.ts`
- `apps/api/src/routes/auth.ts`
- `packages/db/migrations/003_auth_slice.sql`
- `packages/domain/src/entities.ts`

Validation:
- `pnpm db:migrate` applied 3 migrations on real Postgres.
- Auth tests pass:
  - login success
  - login failure
  - unauthorized protected endpoint
  - forbidden protected endpoint

## Phase E — CI Conditional Provider Live Matrix
Status: implemented

Implemented:
- Added explicit provider test scripts:
  - `test:unit`
  - `test:live`
- Updated CI workflow:
  - baseline verify job always runs and blocks on failures (`typecheck/lint/test/build`)
  - conditional `providers-live` job runs only when provider secrets are present
  - `providers-live-skipped` job reports intentional skip when secrets are missing

Key files:
- `.github/workflows/ci.yml`
- `packages/providers/package.json`

Validation:
- Local verification remains deterministic with no provider credentials required.
- CI behavior now explicitly separates unit and live-provider coverage.

## Consolidated Verification Snapshot
Status: green (local)

Executed successfully:
- `pnpm db:migrate` (real Postgres)
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`

## Phase F — Login UX, OIDC Stub, Audit + RBAC Admin, Provider Sandbox
Status: implemented

Implemented:
- Dashboard authentication UX:
  - Added `/login` page with credential flow against `/auth/login`.
  - Added session bootstrap (`/auth/me`), session card ("Logged in as …"), and logout action.
  - Added client-side 401/403 handling that marks session as required and routes users to login.
  - Auth UX remains optional with `VITE_AUTH_ENABLED=0` default.
- OIDC/SSO initial stubs in `@cp/auth`:
  - Added `oidc.ts` with `ExternalIdentityClient` abstractions and typed request/response contracts.
  - Added `UnconfiguredExternalIdentityClient` explicit failure behavior.
  - Added `authenticateFederated(...)` entrypoint in `AuthService` for future IdP callback wiring.
- Audit and advanced RBAC:
  - Added `AuditEvent` domain model and schema.
  - Added DB migration `004_audit_and_editor.sql` for `audit_events` and ensured `editor` role bootstrap.
  - Added API audit logging for login/logout, role operations, and admin project/task mutations.
  - Added protected admin APIs:
    - `/admin/roles`
    - `/admin/roles/:roleId/permissions`
    - `/admin/audit-events`
    - `/admin/projects`
    - `/admin/tasks`
  - Added dashboard admin page `/admin/rbac` for role/permission updates and audit visibility.
- Provider test strategy refinement:
  - `@cp/providers` default `test` now runs unit tests only (`test:unit`).
  - Added `test:sandbox` mode using local mock HTTP provider endpoints.
  - `test:live` remains real-provider mode and CI-conditional on secrets.
  - CI skip message now references sandbox mode for local parity.

Key files:
- `apps/web/src/pages/LoginPage.tsx`
- `apps/web/src/pages/AdminRbacPage.tsx`
- `apps/web/src/store/app-store.tsx`
- `packages/auth/src/oidc.ts`
- `packages/auth/src/service.ts`
- `packages/db/migrations/004_audit_and_editor.sql`
- `apps/api/src/routes/admin.ts`
- `apps/api/src/services/audit-log-service.ts`
- `packages/providers/src/providers.live.test.ts`
- `packages/providers/package.json`

Validation:
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm test` passed (including new `admin.contract.test.ts` and updated auth/provider tests).
- `pnpm build` passed.
- `pnpm db:migrate` passed with explicit env values:
  - `DATABASE_URL`
  - `REDIS_URL`
  - `SECRETS_MASTER_KEY`

## Remaining Work (Next Iteration)
- Add migration regression tests into CI (including synthetic legacy `entity_records` conversion cases).
- Increase credential-backed provider coverage and secrets governance in CI.
- Expand remaining placeholder package tests (`@cp/domain`, `@cp/config`, `@cp/ui-kit`, `@cp/db`, `@cp/agents`, `@cp/worker`).
- Add persistent audit analytics dashboards (trend/group visualizations beyond table views).
- Add JWKS signature validation + stronger enterprise SSO controls (for example back-channel logout).

## Phase G — OIDC Runtime, Scoped RBAC, Delegation, Session Hardening
Status: implemented

Implemented:
- Real OIDC runtime slice:
  - Added `OidcHttpClient` in `@cp/auth` for authorization URL building, token exchange, and userinfo merge.
  - Added env-driven OIDC factory (`createOidcClientFromEnv`) with `env://` and `secret://` secret refs.
  - Added API routes:
    - `GET /auth/oidc/start`
    - `GET /auth/oidc/callback`
- Session hardening:
  - Added refresh token issuance and rotation in `AuthService`.
  - Added API routes:
    - `POST /auth/refresh`
    - `POST /auth/logout-all`
  - Added web session refresh flow with automatic refresh retry on `401` and persisted refresh token storage.
- Scoped RBAC + delegated admin:
  - Added scoped role bindings and delegation entities to domain + db schema:
    - `ProjectRoleBinding`
    - `RepositoryRoleBinding`
    - `DelegatedPermission`
    - `OidcAuthState`
  - Added migration `005_scoped_rbac_and_oidc.sql`.
  - Added scope-aware authz helper `requireScopedPermission(...)`.
  - Enforced scoped permissions on admin project/task update routes.
  - Added admin APIs for managing scoped bindings and delegated permissions.
- Admin UX upgrades:
  - Expanded `/admin/rbac` with:
    - project role bindings management
    - repository role bindings management
    - delegated permission grant/revoke
    - existing role + audit management retained
- Provider test strategy in CI:
  - CI now runs provider sandbox tests when live provider secrets are absent.
  - Live provider tests remain conditional on secret availability.

Key files:
- `packages/auth/src/oidc.ts`
- `packages/auth/src/service.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/routes/admin.ts`
- `apps/api/src/auth/runtime.ts`
- `apps/web/src/pages/LoginPage.tsx`
- `apps/web/src/pages/AdminRbacPage.tsx`
- `apps/web/src/store/app-store.tsx`
- `packages/db/migrations/005_scoped_rbac_and_oidc.sql`
- `.github/workflows/ci.yml`

Validation:
- `pnpm db:migrate` applied migration 005.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm test` passed.
- `pnpm build` passed.

## Phase H — Skills Marketplace + Per-Task Skill Selection
Status: implemented

Implemented:
- Added `Skill` as first-class domain entity and schema contracts:
  - `packages/domain/src/entities/skill.ts`
  - `packages/domain/src/schemas/skill.schema.ts`
  - exports updated in domain index/schema barrels.
- Added DB migration `006_skills.sql` and repository/schema wiring for `skills` persistence.
- Added dedicated `@cp/skills` package with:
  - marketplace adapters (raw URL + GitHub repository)
  - marketplace fetch and catalog upsert
  - optional shell installer (`npx -y skills add <repo>`)
  - installed/search/list APIs through service contracts
- Added API endpoints:
  - `GET /skills/catalog?marketplace=<url>`
  - `GET /skills/installed`
  - `POST /skills/install`
- Added dashboard Skills page (`/skills`) with:
  - marketplace URL input
  - search + category filter
  - available skills list with install action
  - installed skills list
- Added per-task skill selection UI in task detail, mapped to `TaskSpec.skills` intent via app state (`taskSpecSkills`) without changing existing `Task` contract.
- Extended retrieval context packet flow with skill instructions:
  - `RetrievalQuery.skillInstructions`
  - context packet schema + builder includes compact skill instruction summaries and token accounting.
- Updated planner prompt guidance to include selected skill instructions in context-aware planning output.
- Added tests:
  - `packages/skills/src/service.test.ts`
  - `apps/api/src/__tests__/skills.contract.test.ts`
  - `apps/web/src/__tests__/skills.smoke.test.tsx`
  - retrieval test updated to validate skill instructions in context packets.

Validation:
- New skills migration is included in normal migration path.
- API/UI test coverage for skills routes and UI smoke is active.

## Phase I — Agent Management UI and CLI Parity
Status: implemented

Implemented:
- Added `AgentConfig` domain contract and schema:
  - `packages/domain/src/entities/agent.ts`
  - `packages/domain/src/schemas/agent.schema.ts`
  - exports wired through entity/schema barrels
- Added persistence for agents with additive migration:
  - `packages/db/migrations/007_agents.sql`
  - table wiring in `packages/db/src/schema.ts`, `repository.ts`, `types.ts`
  - API seed includes default `builderAgent`
- Added `@cp/agents` service package capabilities:
  - CRUD operations (`listAgents`, `getAgent`, `createAgent`, `updateAgent`, `deleteAgent`)
  - runtime actions (`runHeartbeat`, `diagnoseAgent`, `getRuntimeJob`)
  - runtime scheduling abstraction with BullMQ and in-memory fallback implementations
- Added API routes in `apps/api`:
  - `GET /agents`
  - `POST /agents`
  - `GET /agents/:agentId`
  - `PUT /agents/:agentId`
  - `DELETE /agents/:agentId`
  - `POST /agents/:agentId/heartbeat`
  - `POST /agents/:agentId/diagnose`
  - `GET /agents/runtime/workflows`
  - `GET /agents/:agentId/jobs/:jobId`
  - `GET /agents/:agentId/jobs/:jobId/events` (SSE + snapshot mode for deterministic tests)
- Added worker support for async CLI parity jobs:
  - BullMQ queue `agent-runtime-jobs`
  - command execution bridge for heartbeat/diagnose flows with captured stdout/stderr metadata
- Added dashboard pages and navigation:
  - `/agents` (`AgentsListPage.tsx`)
  - `/agents/new` (`AgentCreatePage.tsx`)
  - `/agents/:agentId` (`AgentDetailPage.tsx`)
  - `/runtime` (`RuntimePage.tsx`)
  - sidebar links in app shell
- Integrated task/orchestration/retrieval flow:
  - `TaskSpec.agentId` optional assignment field
  - routing helper prefers explicit `agentId` before default builder role
  - context packet builder merges `agentContext.runtimeConfig` and selected skill instructions
  - planner prompt guidance updated for agent-specific context behavior

Key files:
- `packages/domain/src/entities/agent.ts`
- `packages/domain/src/schemas/agent.schema.ts`
- `packages/db/migrations/007_agents.sql`
- `packages/agents/src/service.ts`
- `apps/api/src/routes/agents.ts`
- `apps/worker/src/index.ts`
- `apps/web/src/pages/AgentsListPage.tsx`
- `apps/web/src/pages/AgentCreatePage.tsx`
- `apps/web/src/pages/AgentDetailPage.tsx`
- `apps/web/src/pages/RuntimePage.tsx`
- `packages/orchestration-ruflo/src/orchestrator/task-routing.ts`
- `packages/retrieval/src/services/context-packet-builder.ts`

Validation:
- `pnpm db:migrate` passed (`7 migrations tracked`).
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm test` passed (including new agents API/service/web smoke suites).
- `pnpm build` passed.
