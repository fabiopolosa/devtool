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

## Phase G — Legacy Route Deprecation and Context-Scoped Navigation
Status: implemented

Implemented:
- Enforced context-scoped route model:
  - `global`: `/`, `/projects`
  - `project`: `/project/:projectId/*`
  - `platform`: `/settings/*`
- Removed legacy unscoped routes from the web router.
- Kept only canonical scoped paths for project and platform modules.
- Updated internal links to scoped paths only.
- Replaced deprecation redirect coverage with scoped routing smoke coverage:
  - `apps/web/src/__tests__/routing.scoped.smoke.test.tsx`

Key files:
- `apps/web/src/router/router.tsx`
- `apps/web/src/layout/AppShell.tsx`
- `apps/web/src/pages/DashboardPage.tsx`
- `apps/web/src/pages/RuntimePage.tsx`
- `apps/web/src/pages/AgentsListPage.tsx`
- `apps/web/src/pages/AgentCreatePage.tsx`
- `apps/web/src/pages/AgentDetailPage.tsx`
- `apps/web/src/pages/ProjectDetailPage.tsx`
- `apps/web/src/__tests__/routing.scoped.smoke.test.tsx`

Validation:
- `pnpm --filter @cp/web typecheck` passed
- `pnpm --filter @cp/web lint` passed
- `pnpm --filter @cp/web test` passed
- `pnpm --filter @cp/web build` passed
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

## Phase J — Platform Ops Modules + Modern UI Redesign
Status: implemented

Implemented:
- Added new domain entities and schemas for:
  - `SecretConfig`
  - `SchemaDoc`
  - `Environment` and `Machine`
  - `LocalRepository`
  - `VersionSnapshot`
- Added additive migrations and DB table wiring:
  - `008_secrets.sql`
  - `009_schema_docs.sql`
  - `010_env_machine_localrepos_versioning.sql`
- Added modular packages and API wiring:
  - `@cp/secrets` + `/secrets` routes
  - `@cp/schema-docs` + `/schema-docs` routes
  - `@cp/environments` + `/environments` and `/machines` routes
  - `@cp/local-repos` + `/local-repos` routes
  - `@cp/versioning` + `/versioning` routes
- Added UI sections and routing:
  - `/secrets`
  - `/database`
  - `/stack`
  - `/local-repos`
  - `/versioning`
  - `/settings`
- Added local repository file manager UX:
  - folder/file list navigation
  - read-only code viewer
  - git history tab
  - snapshot diff tab
- Added task detail snapshot history + diff panel.
- Expanded context-packet support in retrieval:
  - secret refs
  - environment/machine context
  - version snapshot refs
  - compatibility with selected skills and explicit agent runtime config
- Updated planner prompt guidance to consume expanded context packet fields.
- Implemented modern dashboard redesign:
  - dark Matrix-like theme by default
  - optional light-mode toggle in `/settings`
  - live agent mesh panel for parallel agent/resource visibility on dashboard
- Access control UX behavior:
  - advanced sections (`Secrets`, `Stack & Machines`) hidden when auth is disabled or principal is not admin.

Key files:
- `apps/web/src/pages/SecretsPage.tsx`
- `apps/web/src/pages/DatabasePage.tsx`
- `apps/web/src/pages/StackPage.tsx`
- `apps/web/src/pages/LocalReposPage.tsx`
- `apps/web/src/pages/VersioningPage.tsx`
- `apps/web/src/pages/SettingsPage.tsx`
- `apps/web/src/layout/AppShell.tsx`
- `apps/web/src/router/router.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/components/panels.tsx`
- `packages/retrieval/src/services/context-packet-builder.ts`
- `packages/retrieval/src/retrieval.service.test.ts`
- `apps/api/src/routes/secrets.ts`
- `apps/api/src/routes/schema-docs.ts`
- `apps/api/src/routes/environments.ts`
- `apps/api/src/routes/local-repos.ts`
- `apps/api/src/routes/versioning.ts`

Testing:
- Added smoke coverage for new web sections:
  - `apps/web/src/__tests__/platform-modern-ui.smoke.test.tsx`
- Existing API extension contract coverage remains active:
  - `apps/api/src/__tests__/platform-ext.contract.test.ts`

Usage notes:
- Dark mode is default and can be toggled in `Settings`.
- Live agent runtime panels are visible on dashboard home in the `Live Agent Mesh` section.
- File manager and history/snapshot inspection are available in `Local Repos`.

## Phase K — Brainstorming Orchestration, MCP Optional Runtime, Provider Auto-Discovery Finalization
Status: implemented

Implemented:
- Finalized canonical BrainstormPlan runtime flow on nested payload (`plan.*`) with additive orchestration endpoints:
  - `POST /brainstorm` (session start/update)
  - `GET /brainstorm` (session listing/filtering)
  - `GET /brainstorm/plan/:planId` (normalized canonical plan)
  - `POST /brainstorm/plan/:planId/approve`
  - `POST /brainstorm/plan/:planId/create-project`
- Persisted session/plan transitions with explicit lifecycle states:
  - `collecting -> planned -> approved -> applied`
  - added `applied_at` support in persistence and API payloads
- Added subprompt library package and APIs as file-driven source of truth:
  - `configs/subprompts/*`
  - `GET /subprompts`
  - `GET /subprompts/:subpromptId`
  - `POST /subprompts/compose`
  - `POST /subprompts/sync`
- Integrated composed prompt wiring into brainstorm plans:
  - `plan.selectedSubprompts`
  - `plan.composedPrompt`
- Implemented optional MCP integration with graceful degradation:
  - `GET /mcp/status`
  - `GET /mcp/connections`
  - `POST /mcp/connections`
  - `POST /mcp/connections/:connectionId/healthcheck`
  - `GET /mcp/runs`
  - `POST /mcp/delegate`
  - feature-flag/runtime checks return non-breaking `MCP non configurato` behavior when disabled
- Finalized provider auto-discovery orchestration on top of existing provider system:
  - `POST /providers/discovery/update`
  - `GET /providers/discovery/logs`
  - manual trigger in Providers UI with persisted discovery history
- Completed Brainstorming + MCP UI integration:
  - `/brainstorming` page with guided workbench/session state and approve/apply actions
  - `/mcp` page (conditionally visible when enabled/configured)
  - sidebar/router wiring kept additive without changing existing routes

Key files:
- `apps/api/src/routes/brainstorm.ts`
- `apps/api/src/services/brainstorming-service.ts`
- `apps/api/src/routes/subprompts.ts`
- `apps/api/src/services/subprompts-service.ts`
- `apps/api/src/routes/mcp.ts`
- `apps/api/src/services/mcp-service.ts`
- `apps/api/src/services/provider-discovery-service.ts`
- `apps/web/src/pages/BrainstormingPage.tsx`
- `apps/web/src/components/brainstorming/BrainstormingWorkbench.tsx`
- `apps/web/src/pages/McpPage.tsx`
- `apps/web/src/pages/ProvidersPage.tsx`
- `packages/subprompts/src/service.ts`
- `packages/mcp/src/*`
- `packages/providers/src/discovery/provider-auto-discovery.ts`
- `packages/db/migrations/011_auto_discover_brainstorm_mcp.sql`
- `packages/db/migrations/012_brainstorm_applied_state.sql`

Validation:
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm test` passed.
- `pnpm build` passed.
- `pnpm db:migrate` remains environment-dependent; run only when `DATABASE_URL`, `REDIS_URL`, and `SECRETS_MASTER_KEY` are available in execution context.

## Phase L — BrainstormPlan Canonical Hard Cut + Prompt Builder Unification
Status: implemented

Implemented:
- Removed legacy BrainstormPlan compatibility fallback:
  - top-level fields (`recommendedStack`, `roadmap`, `risks`, etc.) are now rejected
  - canonical shape is strictly `brainstormPlan.plan.*`
- API storage paths now persist/read only canonical plans:
  - no legacy normalization in `api-store` for brainstorm plans
  - invalid contract records trigger explicit errors
- Added `@cp/prompt-builder` package to centralize prompt assembly:
  - `buildPrompt({ role, subprompts, plan, context })`
  - planner/brainstorming prompt composition now uses prompt-builder
- Reduced subprompts package scope to registry/loader/composer concerns:
  - DB sync/upsert logic moved out of `@cp/subprompts` into API service layer
- Added route-level contract error handling for brainstorm endpoints:
  - invalid contract payloads return `422 invalid_contract`

Key files:
- `packages/domain/src/entities/brainstorm.ts`
- `packages/domain/src/schemas/brainstorm.schema.ts`
- `apps/api/src/services/api-store.ts`
- `apps/api/src/routes/brainstorm.ts`
- `packages/prompt-builder/src/service.ts`
- `packages/brainstorming/src/service.ts`
- `packages/subprompts/src/service.ts`
- `apps/api/src/services/subprompts-service.ts`

Validation:
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm test` passed.
- `pnpm build` passed.
- `pnpm db:migrate` blocked by missing env vars (`DATABASE_URL`, `REDIS_URL`, `SECRETS_MASTER_KEY`) in current execution context.

## Phase M — Multi-Tenant Core + Fixed RBAC Roles + Jobs Tracking
Status: implemented (application/runtime); migration execution environment-blocked in current shell

Implemented:
- Added tenant and membership domain contracts:
  - `Tenant`
  - `UserTenant`
  - `TenantRole` (`owner`, `admin`, `manager`, `user`, `guest`)
  - `TenantPermissions` capability map
- Added jobs tracking domain contract:
  - `Job`
  - `JobStatus` (`idle`, `running`, `waiting_user`, `done`, `error`)
- Added additive migration `013_multi_tenant_rbac_jobs.sql`:
  - creates `tenants`, `user_tenants`, `jobs`
  - adds `tenant_id` to tenant-scoped operational tables
  - backfills default tenant (`tenant_default`) and baseline user memberships
- Added tenant-aware DB context and enforcement in repositories:
  - per-request tenant context via async local storage
  - tenant auto-injection on create for scoped tables
  - tenant filtering on list/get/update/delete for scoped tables
- Added API tenant runtime middleware:
  - resolves `tenantId` from `x-tenant-id` header (MVP) with auth-based fallback
  - resolves effective tenant role and permissions
  - attaches `tenantId`, `tenantRole`, and `tenantPermissions` to request context
- Added backend RBAC helper and permission enforcement:
  - centralized `getPermissions(role)` mapping
  - backend-side checks (`canView`, `canEdit`, `canApprove`, etc.) in new tenant-sensitive routes
- Added additive jobs API surface:
  - `GET /jobs`
  - `GET /jobs/:jobId`
  - `PATCH /jobs/:jobId/status`
  - all tenant-scoped and permission-checked
- Integrated jobs into brainstorming lifecycle:
  - start/update of brainstorm session emits job records
  - waiting-for-input transitions set `waiting_user`
  - completion/update paths set `done` or `error`

Key files:
- `packages/domain/src/entities/tenant.ts`
- `packages/domain/src/entities/job.ts`
- `packages/domain/src/schemas/tenant.schema.ts`
- `packages/domain/src/schemas/job.schema.ts`
- `packages/db/migrations/013_multi_tenant_rbac_jobs.sql`
- `packages/db/src/tenant-context.ts`
- `packages/db/src/repository.ts`
- `packages/db/src/schema.ts`
- `apps/api/src/tenant/runtime.ts`
- `apps/api/src/tenant/rbac.ts`
- `apps/api/src/services/jobs-service.ts`
- `apps/api/src/routes/jobs.ts`
- `apps/api/src/services/brainstorming-service.ts`
- `apps/api/src/__tests__/tenant-rbac-jobs.contract.test.ts`

Validation:
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm test` passed.
- `pnpm build` passed.
- `pnpm db:migrate` failed in current execution context because required env vars were not set (`DATABASE_URL`, `REDIS_URL`, `SECRETS_MASTER_KEY`).

## Phase N — Job DAG Orchestration Baseline
Status: implemented (application/runtime); migration execution environment-blocked in current shell

Implemented:
- Evolved `jobs` from flat tracking to dependency-aware DAG execution:
  - new job fields: `dependencies`, `dependsOnCount`, `ready`, `startedAt`, `completedAt`
  - semantic `JobType` values for routing/UI (`ingestion`, `processing`, `generation`, `review`, `deployment`, plus existing control-plane types)
- Added additive migration `015_jobs_dag_fields.sql`:
  - introduces DAG columns on `jobs`
  - backfills defaults and dependency counts
  - adds readiness/dependency indexes
- Implemented DAG orchestration logic in jobs service:
  - cycle detection (`validateDAG`)
  - dependency existence validation
  - readiness recomputation (`applyReadiness`)
  - transition guard: a job cannot move to `running` unless dependencies are complete
  - executable queue query (`getExecutableJobs`)
- Added additive jobs API endpoints:
  - `POST /jobs` (create DAG job nodes)
  - `GET /jobs/executable` (tenant-scoped ready+idle jobs)
  - existing endpoints unchanged (`GET /jobs`, `GET /jobs/:jobId`, `PATCH /jobs/:jobId/status`)
- Updated command-center jobs sidebar for DAG observability:
  - explicit stage labels (`ready`, `waiting_dependencies`, `running`, `waiting_user`, `done`, `error`)
  - dependency counts and selected-job dependency metadata
  - action-required prioritization preserved
- Added tests for DAG behavior:
  - service-level cycle/validity checks (`jobs.dag.service.test.ts`)
  - contract tests for executable jobs, blocked transitions on pending dependencies, and parallel runnable branches.

Key files:
- `packages/domain/src/entities/job.ts`
- `packages/domain/src/schemas/job.schema.ts`
- `packages/db/src/schema.ts`
- `packages/db/migrations/015_jobs_dag_fields.sql`
- `apps/api/src/services/api-store.ts`
- `apps/api/src/services/jobs-service.ts`
- `apps/api/src/routes/jobs.ts`
- `apps/api/src/__tests__/jobs.dag.service.test.ts`
- `apps/api/src/__tests__/tenant-rbac-jobs.contract.test.ts`
- `apps/web/src/layout/AppShell.tsx`
- `apps/web/src/__tests__/dashboard.smoke.test.tsx`

Validation:
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm test` passed.
- `pnpm build` passed.
- `pnpm db:migrate` failed in current execution context because required env vars were not set (`DATABASE_URL`, `REDIS_URL`, `SECRETS_MASTER_KEY`).

## Phase O — Provider Config Production Hardening
Status: implemented (application/runtime); migration execution environment-blocked in current shell

Implemented:
- Provider config schema hardening with additive migration:
  - `021_provider_config_hardening.sql`
  - new fields: `secret_ref`, `validation_status`, `last_validated_at`, `validation_error`, `requests_per_minute`, `tokens_per_minute`
  - legacy `api_key` values scrubbed (`NULL`) to stop plaintext persistence in `provider_configs`.
- Secure provider credential flow in API:
  - raw `apiKey` input can be encrypted into `secrets` and rewritten to `secret://provider/<provider>/<configId>/api-key`
  - env/secret references remain supported (`env://`, `secret://`)
  - provider config responses now expose masked values only (`apiKeyMasked`), never clear API keys.
- Validation-on-save for provider config writes:
  - `POST /providers/config`
  - `PATCH /providers/config/:id`
  - each write performs provider connectivity validation and persists:
    - `validationStatus`
    - `lastValidatedAt`
    - `validationError`
- Owner-level audit enrichment:
  - provider config create/update actions are logged with redacted before/after payload diff metadata.
- Model discovery strict-mode contract alignment:
  - `/models` now returns canonical `source` + `models`
  - source normalized to `live|mock`
  - backward-compatible aliases (`items`, `meta`) preserved.
- Tenant-aware model discovery cache:
  - cache key scoped by tenant
  - cache invalidated on provider config writes and manual discovery refresh.
- Runner provider throttling:
  - introduced in-memory RPM/TPM limiter (`@cp/runner`)
  - enforced before generation provider calls
  - limits loaded from tenant provider config (`requestsPerMinute`, `tokensPerMinute`).
- Providers UI updates:
  - model source fallback banner when `/models.source = mock`
  - owner provider settings include validation visibility + RPM/TPM fields.

Key files:
- `packages/db/migrations/021_provider_config_hardening.sql`
- `packages/db/src/schema.ts`
- `packages/domain/src/entities.ts`
- `apps/api/src/services/provider-config-service.ts`
- `apps/api/src/routes/providers.ts`
- `apps/api/src/routes/models.ts`
- `packages/providers/src/models/model-discovery.ts`
- `packages/runner/src/rate-limit.ts`
- `packages/runner/src/handlers/generation-handler.ts`
- `apps/worker/src/dag-job-store.ts`
- `apps/worker/src/index.ts`
- `apps/web/src/pages/ProvidersPage.tsx`
- `apps/web/src/pages/SettingsProvidersPage.tsx`

Validation:
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm test` passed.
- `pnpm build` passed.
- `pnpm db:migrate` failed in current execution context because required env vars were not set (`DATABASE_URL`, `REDIS_URL`, `SECRETS_MASTER_KEY`).

## Phase P — Knowledge System (LLMWIKI + pgvector-ready baseline)
Status: implemented (application/runtime); migration execution depends on environment DB variables

Implemented:
- Added knowledge domain model and schema:
  - `KnowledgeNode` with scope (`system|tenant|project`), markdown content, optional embedding vector.
  - exported via `@cp/domain` schemas/entities.
- Added additive DB migration:
  - `022_knowledge_system.sql`
  - creates `knowledge_nodes` + indexes.
- Introduced `@cp/knowledge` package:
  - filesystem markdown sync from `knowledge/` tree
  - CRUD service for canonical node storage
  - lexical + semantic search path (semantic enabled only when embedding provider is configured)
  - compact generation context builder for runner pipelines.
- Added markdown knowledge tree seeds:
  - `knowledge/system/*`
  - `knowledge/tenants/tenant_default/*`
  - `knowledge/projects/proj_001/*`
- API integration (additive routes):
  - `GET /knowledge`
  - `GET /knowledge/:knowledgeNodeId`
  - `POST /knowledge`
  - `PATCH /knowledge/:knowledgeNodeId`
  - `DELETE /knowledge/:knowledgeNodeId`
  - `POST /knowledge/sync`
  - `GET /knowledge/context/search`
- Startup sync:
  - API startup now runs knowledge sync (`syncKnowledgeFromFilesystem`) with non-blocking fallback.
- Runner integration:
  - generation jobs enrich prompt context with scoped knowledge snippets.
  - optional insight capture persists compact decision notes when `payload.captureKnowledge=true`.
- UI integration:
  - new project route `/project/:projectId/knowledge`
  - knowledge page supports list/search/create/edit/delete + filesystem sync.
  - AppShell project navigation includes `Knowledge`.
- Tests added:
  - API contract tests for knowledge routes (`knowledge.contract.test.ts`)
  - web smoke test for knowledge page (`knowledge.smoke.test.tsx`)
  - package tests for `@cp/knowledge` service behavior.

Key files:
- `packages/domain/src/entities/knowledge.ts`
- `packages/domain/src/schemas/knowledge.schema.ts`
- `packages/db/migrations/022_knowledge_system.sql`
- `packages/knowledge/src/service.ts`
- `apps/api/src/services/knowledge-service.ts`
- `apps/api/src/routes/knowledge.ts`
- `apps/worker/src/dag-job-store.ts`
- `packages/runner/src/executor.ts`
- `apps/web/src/pages/KnowledgePage.tsx`
- `apps/web/src/router/router.tsx`

Validation:
- Pending in this execution block until final run:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
- `pnpm db:migrate` must run only when `DATABASE_URL` is available.

## Phase Q — Knowledge Configuration Layer
Status: implemented (application/runtime); migration execution depends on environment DB variables

Implemented:
- Added knowledge policy domain contract:
  - `KnowledgeConfig` in domain entities.
  - zod schema `knowledge-config.schema.ts` with create/update variants.
- Added additive DB migration:
  - `023_knowledge_config.sql`
  - creates `knowledge_configs` with tenant/project scope, capture/retrieval/mutation controls and constraints.
- Wired DB schema/repository/types:
  - `knowledge_configs` table in Drizzle schema.
  - repository mapping + tenant-aware table enforcement.
- API seed/runtime integration:
  - seeded tenant-level default config in API seed data.
  - `ApiStore` CRUD methods for `knowledge_configs`.
- Added knowledge config service:
  - effective policy resolution with precedence `project -> tenant -> system -> default`.
  - scoped list/create/patch flows with canonical payloads.
  - patch supports scoped upsert behavior.
- Extended knowledge API routes (additive):
  - `GET /knowledge/config`
  - `POST /knowledge/config`
  - `PATCH /knowledge/config`
  - write operations protected by tenant permission `canManageUsers`.
- Retrieval path alignment:
  - `/knowledge/context/search` now applies effective `maxNodes` + `relevanceThreshold` defaults when query overrides are absent.
- Runner alignment:
  - worker store resolves effective config per tenant/project.
  - generation context retrieval uses configured node limits + threshold.
  - insight persistence respects config:
    - auto-capture by policy (`autoCapture` + `captureModes`)
    - skips write when `requireApproval` or `requireReview` is enabled
    - writes to configured scope (`system|tenant|project`).
- UI platform settings:
  - new page `/settings/knowledge` for capture/scope/retrieval/mutation controls.
  - added platform nav entry `Knowledge Config`.
- Tests added:
  - API contract test: `knowledge-config.contract.test.ts`
  - web smoke test: `settings-knowledge.smoke.test.tsx`

Key files:
- `packages/domain/src/entities.ts`
- `packages/domain/src/schemas/knowledge-config.schema.ts`
- `packages/db/migrations/023_knowledge_config.sql`
- `packages/db/src/schema.ts`
- `packages/db/src/repository.ts`
- `apps/api/src/services/seed-data.ts`
- `apps/api/src/services/api-store.ts`
- `apps/api/src/services/knowledge-config-service.ts`
- `apps/api/src/routes/knowledge.ts`
- `apps/worker/src/dag-job-store.ts`
- `packages/runner/src/types.ts`
- `packages/runner/src/executor.ts`
- `apps/web/src/pages/SettingsKnowledgePage.tsx`
- `apps/web/src/router/router.tsx`
- `apps/web/src/layout/AppShell.tsx`

Validation:
- Executed in this phase:
  - `pnpm --filter @cp/api typecheck` ✅
  - `pnpm --filter @cp/web typecheck` ✅
  - `pnpm --filter @cp/worker typecheck` ✅
  - `pnpm --filter @cp/runner typecheck` ✅
  - `pnpm --filter @cp/api test -- --run src/__tests__/knowledge-config.contract.test.ts` ✅
  - `pnpm --filter @cp/web test -- --run src/__tests__/settings-knowledge.smoke.test.tsx` ✅
- Full monorepo gates to be run at end of integration block:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
- `pnpm db:migrate` remains environment-dependent on:
  - `DATABASE_URL`
  - `REDIS_URL`
  - `SECRETS_MASTER_KEY`

## Step 16 — Alpha Operability Blocks (Prompt Registry, Coding HITL, Schemas Graph, Context, Memory)
Status: implemented and integrated

Implemented:
- Prompt registry governance:
  - new domain entity/schema for prompt records with scope/version/status targeting.
  - additive migration `024_prompt_registry.sql`.
  - API CRUD + activation/deprecation under `/prompts`.
  - platform UI page `/settings/prompts` with filtering by scope/status and edit lifecycle.
  - brainstorming prompt composition now resolves active role instructions from prompt registry before fallback to role files.
- Internal coding workflow (HITL):
  - additive migration `025_coding_workflow.sql`.
  - project-scoped service + API routes in `/coding-workflow`.
  - approvals flow supports approve/reject/revise/finalize actions.
  - UI page `/project/:projectId/coding` added to project operations.
- Schemas graph observability:
  - project route `/project/:projectId/schemas` renders a node-based canvas with:
    - Data Model
    - API Contracts
    - System Structure
  - node detail panel updates on selection and keeps project context scoping.
- Context module (Obsidian-like notes):
  - additive migration `026_context_notes.sql`.
  - new package `@cp/context` with CRUD/search service.
  - API routes `/context` and `/context/:contextId`.
  - UI page `/project/:projectId/context` with notes list, markdown editor, reader view and search.
- Advanced memory integration:
  - retrieval and context packet composition consume effective knowledge config (`maxNodes`, `relevanceThreshold`).
  - runner/coding-generation paths inject compact scoped knowledge context.
  - noisy/low-signal outputs are skipped for auto-capture; meaningful outputs produce compact insight notes.

Key files:
- `packages/domain/src/entities/prompt.ts`
- `packages/domain/src/schemas/prompt.schema.ts`
- `packages/db/migrations/024_prompt_registry.sql`
- `apps/api/src/services/prompt-registry-service.ts`
- `apps/api/src/routes/prompts.ts`
- `packages/domain/src/entities/coding-workflow.ts`
- `packages/domain/src/schemas/coding-workflow.schema.ts`
- `packages/db/migrations/025_coding_workflow.sql`
- `apps/api/src/services/coding-workflow-service.ts`
- `apps/api/src/routes/coding-workflow.ts`
- `apps/web/src/pages/CodingWorkflowPage.tsx`
- `apps/web/src/pages/SchemasGraphPage.tsx`
- `apps/web/src/components/schemas/*`
- `packages/domain/src/entities/context-note.ts`
- `packages/domain/src/schemas/context-note.schema.ts`
- `packages/db/migrations/026_context_notes.sql`
- `packages/context/src/service.ts`
- `apps/api/src/services/context-service.ts`
- `apps/api/src/routes/context.ts`
- `apps/web/src/pages/ContextPage.tsx`
- `packages/retrieval/src/services/context-packet-builder.ts`
- `packages/knowledge/src/service.ts`
- `packages/runner/src/executor.ts`

Validation:
- `pnpm typecheck` ✅
- `pnpm lint` ✅
- `pnpm test` ✅
- `pnpm build` ✅
- `pnpm db:migrate` ❌ environment-blocked in this execution context (`DATABASE_URL`, `REDIS_URL`, `SECRETS_MASTER_KEY` missing).
