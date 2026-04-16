# AI Development Control-Plane — Architecture v1

## Architecture Stabilization Summary
This document freezes the contract-first foundation before distributed implementation.

Stabilized items:
- Monorepo structure and package boundaries.
- Shared domain model in `packages/domain`.
- Lifecycle definitions for Task, TaskRun, RoadmapItem, Approval.
- Structured artifact schemas for all inter-agent handoffs.
- Provider capability interfaces and capability classes.
- Memory and retrieval interfaces with context packet schema.
- Verification interface and deterministic verification result format.
- Allowed package dependency graph.

Enforcement principles:
- No contract drift without explicit change proposal.
- Capability-first routing in all agent and provider logic.
- Structured artifacts only for handoffs.
- Retrieval by context packet, never full memory dump.

## Locked Contracts
The following are frozen for v1 and cannot be changed by package-local implementation without architecture change review:
- Core entities: `Task`, `TaskRun`, `RoadmapItem`, `Approval`, `MemoryEntry`, `MemoryChunk`, `ProviderConfig`, `RoutingRule`.
- Lifecycle states: `taskStates`, `taskRunStatuses`, `roadmapStates`, `approvalStatuses`.
- Structured schema contracts:
  - `planner-output.schema.ts`
  - `roadmap-proposal.schema.ts`
  - `task-spec.schema.ts`
  - `routing-decision.schema.ts`
  - `builder-handoff.schema.ts`
  - `refactor-handoff.schema.ts`
  - `debugger-handoff.schema.ts`
  - `researcher-handoff.schema.ts`
  - `verifier-result.schema.ts`
  - `context-packet.schema.ts`
  - `escalation-record.schema.ts`
  - `autoresearch-experiment-record.schema.ts`
- Provider capability interfaces:
  - `ChatReasoningProvider`
  - `CodingProvider`
  - `EmbeddingProvider`
  - `ImageGenerationProvider`
  - `ImageEditingProvider`
  - `VisionAnalysisProvider`
- Verification interface: `VerificationRunner`.
- Retrieval interface: `RetrievalService` + `ContextPacketBuilder`.

## Monorepo Structure
```text
apps/
  api/                    # Fastify REST + OpenAPI + orchestration entrypoints
  worker/                 # BullMQ workers for async workflows
  web/                    # React command-center UI
packages/
  domain/                 # shared contracts, schema, lifecycle, interfaces
  db/                     # persistence models, repos, migrations
  providers/              # provider registry + adapters + model/capability discovery
  memory/                 # canonical memory + chunking + ingestion
  retrieval/              # semantic retrieval + packet builder + retrieval logs
  verifier/               # deterministic lint/test/build runner
  orchestration-ruflo/    # workflow adapter, execution engine, escalation
  autoresearch/           # experiment framework and optimizer subsystem
  auth/                   # auth service, session lifecycle, RBAC policy layer
  skills/                 # skills marketplace catalog + install management
  secrets/                # encrypted secret registry service
  schema-docs/            # DB introspection + schema documentation service
  environments/           # environments + machines + healthcheck service
  local-repos/            # local repository registry + file manager backend
  versioning/             # snapshot + diff service
  agents/                 # role prompts and role metadata
  config/                 # policy/env loaders
  ui-kit/                 # reusable dashboard components
configs/
  workflows/
  policies/
  prompts/
  providers/
```

## Package Boundaries
- `packages/domain`: source of truth for shared types/interfaces/schemas.
- `apps/api`: orchestration-facing HTTP contract and service composition.
- `packages/providers`: provider adapters and model routing helpers only.
- `packages/memory`: memory persistence and chunk generation pipeline.
- `packages/retrieval`: vector querying and context packet generation.
- `packages/verifier`: command execution and result normalization.
- `packages/orchestration-ruflo`: deterministic workflow control and run transitions.
- `packages/autoresearch`: offline optimization against metrics logs.
- `packages/auth`: user/session/role orchestration and permission evaluation.
- `packages/skills`: marketplace ingestion, installation orchestration, and installed-skill lookup.
- `packages/secrets`: encrypted secret lifecycle and secure resolution adapters.
- `packages/schema-docs`: schema introspection and convention documentation snapshotting.
- `packages/environments`: environment and machine topology with healthcheck orchestration.
- `packages/local-repos`: local workspace registration, file tree inspection, and git history helpers.
- `packages/versioning`: repository snapshot persistence and deterministic diffing.
- `apps/web`: control-plane UI and inspectability surface.

## Allowed Package Dependencies
These dependencies are the only allowed import directions.

| Package | Allowed imports |
|---|---|
| `@cp/domain` | _(none)_ |
| `@cp/config` | `@cp/domain` |
| `@cp/db` | `@cp/domain`, `@cp/config` |
| `@cp/auth` | `@cp/domain`, `@cp/config` |
| `@cp/skills` | `@cp/domain`, `@cp/config` |
| `@cp/secrets` | `@cp/domain`, `@cp/config` |
| `@cp/schema-docs` | `@cp/domain`, `@cp/config`, `@cp/db` |
| `@cp/environments` | `@cp/domain`, `@cp/config` |
| `@cp/local-repos` | `@cp/domain`, `@cp/config` |
| `@cp/versioning` | `@cp/domain`, `@cp/config` |
| `@cp/providers` | `@cp/domain`, `@cp/config` |
| `@cp/memory` | `@cp/domain`, `@cp/config`, `@cp/providers` |
| `@cp/retrieval` | `@cp/domain`, `@cp/config`, `@cp/memory`, `@cp/providers` |
| `@cp/verifier` | `@cp/domain`, `@cp/config` |
| `@cp/agents` | `@cp/domain`, `@cp/config` |
| `@cp/orchestration-ruflo` | `@cp/domain`, `@cp/config`, `@cp/providers`, `@cp/retrieval`, `@cp/verifier`, `@cp/agents` |
| `@cp/autoresearch` | `@cp/domain`, `@cp/config`, `@cp/retrieval` |
| `@cp/ui-kit` | `@cp/domain` |
| `apps/api` | all packages except `@cp/ui-kit` |
| `apps/worker` | `@cp/domain`, `@cp/config`, `@cp/orchestration-ruflo`, `@cp/retrieval`, `@cp/memory`, `@cp/providers`, `@cp/verifier`, `@cp/autoresearch`, `@cp/local-repos`, `@cp/agents` |
| `apps/web` | `@cp/domain`, `@cp/ui-kit` |

## Lifecycle Definitions
- `Task`: draft -> proposed -> approved -> queued -> running -> waiting_for_research|waiting_for_debug|waiting_for_approval -> verification_failed|completed -> archived|canceled.
- `TaskRun`: queued -> running -> waiting -> failed|completed|canceled.
- `RoadmapItem`: draft -> proposed -> approved -> in_progress -> completed|converted|rejected|archived.
- `Approval`: pending -> approved|rejected|expired.

Completion gate:
- Task can move to `completed` only when deterministic verification passes and all required approvals are satisfied.

## Verification Contract
Verification is deterministic and externalized as command steps.
Minimum required steps:
- lint
- test
- build

Each step emits normalized result data and artifact references.

## Memory and Retrieval Contract
- Memory is centralized (`MemoryEntry` + `MemoryChunk`).
- Retrieval supports semantic top-k with metadata filters.
- Every retrieval emits compact, traceable `ContextPacket`.
- Context packets are role-specific and bounded by token budget.

## Provider Contract
- Agents request capabilities, never vendor names.
- Provider/model routing is project-bound and role-aware.
- Fallback chains are explicit.
- Health status is part of routing decisions.

## Skills Marketplace and Task Skill Selection
- Skills are modeled as first-class domain entities (`Skill`) and persisted in dedicated storage (`skills` table).
- Marketplace ingestion supports adapter-based URL resolution (official/custom GitHub raw manifests), avoiding vendor lock-in.
- Installation is optional and isolated: install failures return warnings and do not block core task execution.
- Task-level skill selection is captured in `TaskSpec.skills` and propagated to retrieval as `skillInstructions` in context packets.
- Planner prompt policy requires selected skill instructions to be included when present, preserving traceability with compact summaries.
- UI surface:
  - `/skills` for catalog discovery and installation
  - task detail section for selecting installed skills per task spec

## Swarm Readiness Checklist
- [x] Structure frozen.
- [x] Shared contracts frozen.
- [x] Lifecycle definitions frozen.
- [x] Structured artifacts frozen.
- [x] Provider, memory/retrieval, verification interfaces frozen.
- [x] Dependency constraints frozen.

## Implementation Status Addendum (2026-04-14)
This section tracks post-stabilization implementation progress while preserving frozen contracts.

### Step 1 — PostgreSQL Persistence and Normalization
- `apps/api` initializes persistence through `@cp/db` with mode switch support (`postgres` / `in_memory`) while preserving public API contracts.
- Persistence schema is now normalized by entity table (projects, repositories, tasks, task runs, memory, providers, approvals, etc.) instead of generic JSON-only storage.
- Migration `002_normalized_tables.sql` creates normalized tables and migrates legacy `entity_records` payloads.
- Legacy migration parsing was hardened for mixed historical payloads (for example `tasks.approvalsRequired` arriving as boolean/string/array).

### Step 2 — Automated Tests (Core + Expanded Coverage)
- API contract tests (Fastify inject), orchestration dry-run tests, and web smoke tests are active.
- Additional unit/integration tests are now implemented for:
  - `@cp/providers`
  - `@cp/memory`
  - `@cp/retrieval`
  - `@cp/autoresearch`
  - `@cp/verifier`
- Provider live tests are conditional and credential-aware (`PROVIDER_E2E`) to keep default pipelines deterministic without secrets.

### Step 3 — Provider Real Integration Path
- Provider adapters for OpenAI, Anthropic, Gemini, OpenRouter, and Kie.ai execute real HTTP paths behind capability-first interfaces.
- Secret resolution supports `env://` and `secret://` patterns plus provider-default key fallback.
- Health checks return normalized provider/model status for routing and UI inspection.

### Step 4 — Verifier Optional Tooling
- Verifier pipeline supports optional `smoke`, `visual`, and `performance` hooks in addition to required `lint`, `test`, `build`.
- Visual and performance hooks are now wired to executable scripts (Playwright-based), with policy/env control for thresholds and targets.

### Step 5 — CI Hard Gates
- CI enforces hard gates: `typecheck`, `lint`, `test`, `build`.
- Build artifacts are uploaded on successful runs for traceability.

### Step 6 — Auth/RBAC First Slice (Phase E)
- Domain contracts now include `User`, `Role`, `UserRole`, and `Session`, plus auth schemas in `packages/domain/src/schemas/auth.schema.ts`.
- Persistence includes auth tables and migration `003_auth_slice.sql`.
- Dedicated `@cp/auth` package handles:
  - password hashing/verification
  - session token hashing + session lifecycle
  - system role provisioning (`admin`, `editor`, `operator`, `viewer`)
  - permission checks for route guards
  - federated identity entrypoint (`authenticateFederated`) and OIDC abstraction stubs
- API integration adds:
  - optional auth runtime (`AUTH_ENABLED=0` by default)
  - new auth routes (`/auth/login`, `/auth/logout`, `/auth/me`, `/auth/users`, `/auth/users/:userId/roles`)
  - protected admin check route (`/admin/authz-check`)
  - route guard behavior with additive `401/403` responses only on protected routes
- Web integration adds:
  - login route/page (`/login`)
  - session status card and logout in shell
  - client-side auth-aware fetch wrapper with 401/403 login prompting
- Tests include auth success/failure/unauthorized/forbidden cases in `apps/api/src/__tests__/auth.contract.test.ts` and service tests in `packages/auth/src/service.test.ts`.

### Step 7 — Conditional Provider Live CI
- CI runs provider live tests in a separate conditional job only when at least one provider secret is present.
- Base verification always runs unit tests and remains blocking.
- When provider secrets are absent, CI now runs provider sandbox tests (`test:sandbox`) instead of only reporting skip.

### Step 8 — Audit Logging + Admin RBAC + Provider Sandbox
- Added `AuditEvent` domain contract and persistence table (`audit_events`) via migration `004_audit_and_editor.sql`.
- API now records key audit actions:
  - login success/failure
  - logout
  - role assignment/permission changes
  - admin project/task create/update
- Added protected `/admin/*` routes for role management and audit inspection:
  - `/admin/roles`
  - `/admin/roles/:roleId/permissions`
  - `/admin/audit-events`
  - `/admin/projects`
  - `/admin/tasks`
- Added dashboard admin panel (`/admin/rbac`) for role/permission management.
- Provider test strategy now supports explicit sandbox mode (`test:sandbox`) with local mock HTTP services, while CI continues to run real provider tests only when secrets exist.

### Step 9 — OIDC + Scoped RBAC + Session Hardening (Phase G)
- Implemented real OIDC client in `@cp/auth` (`OidcHttpClient`) with authorization URL building, token exchange, and userinfo merge.
- Added runtime OIDC wiring through env-configured client factory and optional route exposure:
  - `GET /auth/oidc/start`
  - `GET /auth/oidc/callback`
- Added refresh session lifecycle with rotation:
  - `POST /auth/refresh`
  - `POST /auth/logout-all`
- Added scoped authorization model and admin APIs:
  - project role bindings (`/admin/project-role-bindings`)
  - repository role bindings (`/admin/repository-role-bindings`)
  - delegated permissions (`/admin/delegated-permissions`)
- Updated admin authorization checks for project/task updates to enforce scope-aware permissions (`project.write`, `task.write` with `projectId` scope).
- Added migration `005_scoped_rbac_and_oidc.sql` for:
  - session refresh columns
  - project/repository role bindings
  - delegated permissions
  - OIDC auth state store
- Dashboard now includes:
  - OIDC login entrypoint and callback handling on `/login`
  - refresh-token-backed session continuation
  - scoped bindings/delegation management on `/admin/rbac`

### Step 10 — Agent Management UI + CLI Parity (Phase I)
- Added `AgentConfig` as a first-class domain contract and persistence model:
  - entity + schema in `packages/domain` (`agent.ts`, `agent.schema.ts`)
  - migration `007_agents.sql` introduces dedicated `agents` table (additive only)
- Added agent management service in `@cp/agents` with:
  - CRUD (`list/get/create/update/delete`)
  - runtime jobs (`runHeartbeat`, `diagnoseAgent`)
  - scheduler abstraction:
    - BullMQ-backed runtime scheduler for async CLI execution
    - in-memory scheduler fallback for local/test mode
- Added API endpoints under `/agents` (additive, existing routes unchanged):
  - `GET /agents`
  - `POST /agents`
  - `GET /agents/:agentId`
  - `PUT /agents/:agentId`
  - `DELETE /agents/:agentId`
  - `POST /agents/:agentId/heartbeat`
  - `POST /agents/:agentId/diagnose`
  - `GET /agents/runtime/workflows`
  - `GET /agents/:agentId/jobs/:jobId`
  - `GET /agents/:agentId/jobs/:jobId/events` (SSE snapshot/stream)
- Added worker runtime execution parity for CLI diagnostics:
  - queue `agent-runtime-jobs`
  - async command execution (`devtools-agent heartbeat run`, `devtools-agent doctor run`) with structured log capture
- Added command-center UI surface:
  - `/agents` list view with filtering and quick actions
  - `/agents/new` guided create flow (icon, role, manager, skills, adapter, runtime options, capabilities)
  - `/agents/:agentId` detail/edit view with installed-skill assignment
  - `/runtime` Ruflo & Runtime panel with workflow parameter inspection and diagnostics controls
  - sidebar navigation entries for Agents and Ruflo & Runtime
- Task/orchestration/retrieval integration:
  - `TaskSpec.agentId` optional field for explicit task-to-agent binding
  - orchestration routing honors explicit agent assignment before default role fallback
  - retrieval context packet can include `agentContext` (runtime config + selected skill instructions)
  - planner prompt now includes explicit instruction to factor selected agent/runtime constraints in planning
- Validation coverage:
  - `packages/agents/src/agents.service.test.ts`
  - `apps/api/src/__tests__/agents.contract.test.ts`
  - `apps/web/src/__tests__/agents.smoke.test.tsx`
  - orchestration and retrieval tests updated for routing/context behavior

### Step 11 — Secrets, Schema Docs, Stack/Machines, Local Repos, Versioning, and Modern UI (Phase J)
- Added additive domain contracts and schemas for:
  - `SecretConfig`
  - `SchemaDoc`
  - `Environment` / `Machine`
  - `LocalRepository`
  - `VersionSnapshot`
- Added additive migrations:
  - `008_secrets.sql`
  - `009_schema_docs.sql`
  - `010_env_machine_localrepos_versioning.sql`
- Added modular service packages:
  - `@cp/secrets` for encrypted secret lifecycle and secure reveal
  - `@cp/schema-docs` for DB introspection + schema conventions snapshots
  - `@cp/environments` for environment/machine inventory + health checks
  - `@cp/local-repos` for local repository registry, file listing, read-only file access, git history, and scan scheduling
  - `@cp/versioning` for snapshot capture and deterministic snapshot diff
- Added additive API routes:
  - `/secrets/*`
  - `/schema-docs/*`
  - `/environments/*`
  - `/machines/*`
  - `/local-repos/*`
  - `/versioning/*`
- Added dashboard command-center pages:
  - `/secrets`
  - `/database`
  - `/stack`
  - `/local-repos`
  - `/versioning`
  - `/settings`
- Implemented UI-first operational capabilities:
  - secrets CRUD/reveal panel with encrypted-at-rest workflow messaging
  - database ER-like table visualization + conventions/stack notes
  - machine topology cards with CPU/GPU/RAM utilization bars and health checks
  - local file manager with path navigation and read-only code inspector
  - repository history tab and snapshot-diff tab
  - global versioning workspace for snapshot creation and diff
- Task and planner context integration:
  - task detail now inspects snapshot history/diffs
  - retrieval/context packet supports:
    - selected skill instructions
    - explicit agent runtime context
    - secret references
    - environment/machine context
    - version snapshot references
  - planner prompt guidance updated to consume the expanded context envelope
- Modern UI redesign:
  - full-width responsive shell
  - dark Matrix-style default palette with subtle grid/scanline motion
  - light mode optional toggle via `/settings`
  - live parallel agent mesh cards on dashboard with resource and step visibility
- Access controls:
  - advanced sections (`Secrets`, `Stack & Machines`) are hidden when auth is disabled or user is non-admin.

### Operational Notes
- Local developer defaults use Postgres host port `56432` in `.env.example` and `docker-compose.yml` to reduce host collision risk.
- Auth runtime is feature-flagged (`AUTH_ENABLED`) and disabled by default for single-tenant compatibility.

### Current Known Gaps (Intentional for this iteration)
- Provider live tests are conditional by available secrets; full credential matrix coverage is not guaranteed on every run.
- Optional visual/performance tooling is wired, but enterprise-grade baselines/reporting backends are not yet integrated.
- OIDC flow currently trusts configured issuer endpoints and does not yet validate JWKS signatures for `id_token`.
- SCIM provisioning, SAML implementation, and full enterprise SSO lifecycle (for example back-channel logout) are not yet implemented.

### Step 12 — Brainstorming Runtime Flow, MCP Optional Integration, and Provider Auto-Discovery Finalization
- Brainstorming contract is canonical on nested payload:
  - `BrainstormPlan.plan.recommendedStack`
  - `BrainstormPlan.plan.architecture`
  - `BrainstormPlan.plan.suggestedAgents`
  - `BrainstormPlan.plan.suggestedSkills`
  - `BrainstormPlan.plan.providerBindings`
  - `BrainstormPlan.plan.roadmap`
  - `BrainstormPlan.plan.assumptions`
  - `BrainstormPlan.plan.risks`
  - `BrainstormPlan.plan.composedPrompt`
  - `BrainstormPlan.plan.selectedSubprompts`
- Compatibility helpers are centralized in `@cp/domain`:
  - `getBrainstormPlanPayload(...)`
  - `normalizeBrainstormPlan(...)`
- Legacy top-level plan fields are rejected at runtime (no compatibility fallback). Invalid payloads surface as contract errors (`422`) in brainstorming read/apply endpoints.
- Prompt composition is centralized in `@cp/prompt-builder`:
  - `buildPrompt({ role, subprompts, plan, context })`
  - Brainstorming uses prompt-builder (not ad-hoc string composition) to build `plan.composedPrompt`.
- Brainstorming orchestration routes are additive and persistent:
  - `GET /brainstorm`
  - `POST /brainstorm`
  - `GET /brainstorm/:sessionId`
  - `GET /brainstorm/plan/:planId`
  - `POST /brainstorm/plan/:planId/approve`
  - `POST /brainstorm/plan/:planId/create-project`
- Session state transitions are explicit and persisted:
  - `collecting -> planned -> approved -> applied`
  - `create-project` requires approved state and returns `409 invalid_state` when called too early.
- Subprompt library is file-driven (`configs/subprompts`) and exposed via additive APIs:
  - `GET /subprompts` (metadata by default)
  - `GET /subprompts?includeContent=1`
  - `GET /subprompts/:subpromptId`
  - `POST /subprompts/compose`
  - `POST /subprompts/sync`
- MCP integration is optional and runtime-safe:
  - controlled by `MCP_ENABLED`
  - graceful degradation when disabled/unconfigured (`MCP non configurato`)
  - secrets resolved through `env://` and `secret://`
  - additive routes under `/mcp` for status, connections, healthcheck, delegation and run listing.
- Provider auto-discovery finalization:
  - startup discovery (tolerant, non-blocking)
  - manual trigger from Providers UI (`Aggiorna provider`)
  - persisted discovery logs (`queries`, timestamp, discovered providers/models, status/notes)
  - fallback behavior keeps default providers when web discovery is unavailable.

### Step 13 — Multi-Tenant Baseline, Fixed RBAC Roles, and Jobs Tracking
- Added additive tenancy contracts and persistence:
  - `tenants` table (`id`, `name`, `created_at`)
  - `user_tenants` table (`user_id`, `tenant_id`, `role`, `created_at`)
- Added required tenant scoping to operational entities:
  - `projects`, `repositories`, `project_repository_links`
  - `roadmap_items`, `tasks`, `task_runs`, `artifacts`, `approvals`
  - `brainstorm_sessions`, `brainstorm_plans`
  - additive migration `013_multi_tenant_rbac_jobs.sql`
- Tenant runtime context is resolved per request via:
  - header `x-tenant-id` (MVP explicit tenant switch)
  - fallback from authenticated user memberships
  - default fallback `tenant_default`
- DB repository access is tenant-enforced:
  - tenant-aware tables are auto-filtered with `tenant_id`
  - create/update/delete/list/get operations are scoped to active tenant context
- Added fixed role model for tenant memberships:
  - `owner`, `admin`, `manager`, `user`, `guest`
  - mapped to capability permissions (`canView`, `canEdit`, `canRunAgent`, `canManageUsers`, `canApprove`)
  - authorization enforcement remains backend-side.
- Added additive jobs module for workflow progress tracking:
  - `jobs` table (`id`, `tenant_id`, `type`, `title`, `status`, timestamps, metadata)
  - statuses: `idle`, `running`, `waiting_user`, `done`, `error`
  - additive APIs:
    - `GET /jobs`
    - `GET /jobs/:jobId`
    - `PATCH /jobs/:jobId/status`
  - brainstorming flow now emits tenant-scoped jobs and status transitions.

### Step 14 — Job DAG Orchestration Baseline (Tenant-Scoped)
- Extended the jobs model from passive tracking to dependency-aware DAG execution:
  - additive fields on `jobs`:
    - `dependencies` (`string[]`)
    - `depends_on_count` (`integer`)
    - `ready` (`boolean`)
    - `started_at`, `completed_at`
  - additive migration: `015_jobs_dag_fields.sql`
- DAG validation and readiness engine implemented in `apps/api/src/services/jobs-service.ts`:
  - `validateDAG(...)` detects cycles before persisting dependency changes.

### Step 15 — Context-Scoped Routing Enforcement (Global / Project / Platform)
- Navigation and routing are aligned to strict context separation:
  - `global`: `/`, `/projects`
  - `project`: `/project/:projectId/*`
  - `platform`: `/settings/*`
- Legacy unscoped routes have been removed from the web router.
- Only scoped routes are accepted for project/platform views.
- Policy guardrail:
  - Do not introduce unscoped routes for project-level or platform-level views.
  - Every new UI route must declare one context boundary (`global`, `project`, `platform`).
  - dependency existence is validated (unknown dependency ids are rejected).
  - readiness is recomputed based on dependency completion:
    - executable condition: `status = idle` and all dependencies `done`.
  - status transitions enforced:
    - `idle -> running -> done|error`
    - starting a job in `running` state is blocked if not `ready`.
- Additive jobs APIs for orchestration and automation:
  - `POST /jobs` (create job nodes with optional dependencies)
  - `GET /jobs/executable` (returns current runnable jobs)
  - existing routes preserved:
    - `GET /jobs`
    - `GET /jobs/:jobId`
    - `PATCH /jobs/:jobId/status`
- Tenant + RBAC enforcement remains backend-side:
  - list/detail routes require `canView`
  - create/update routes require `canEdit` (or ownership where already allowed)
  - executable route requires `canRunAgent`
- UI queue now exposes DAG state instead of flat status-only tracking:
  - highlights `ready`, `waiting_dependencies`, `running`, `waiting_user`, `error`, `done`
  - surfaces dependency count/details in the left jobs sidebar
  - keeps action-required jobs prioritized.

### Step 15 — Provider Config Production Hardening
- Provider credentials handling is now reference-first and non-plaintext:
  - `provider_configs` continues to carry routing metadata (`provider`, `provider_id`, `auth_ref`, `endpoint`)
  - secrets can be persisted encrypted in `secrets` and referenced with `secret://provider/<provider>/<configId>/api-key`
  - API responses never expose clear provider keys; only masked output (`apiKeyMasked`).
- Additive provider config fields for operational safety:
  - `secret_ref`
  - `validation_status` (`valid | invalid | unknown`)
  - `last_validated_at`
  - `validation_error`
  - `requests_per_minute`
  - `tokens_per_minute`
  - migration: `021_provider_config_hardening.sql`.
- Validation-on-save is enforced in provider config write routes:
  - `POST /providers/config`
  - `PATCH /providers/config/:id`
  - a provider endpoint probe is executed (`/models` or provider equivalent), then status/lastValidatedAt/error are persisted.
- Model discovery strict mode is exposed through `MODELS_STRICT`:
  - `/models` now publishes canonical envelope:
    - `source: "live" | "mock"`
    - `models: [...]`
  - backward-compatible aliases remain (`items`, `meta`).
  - providers UI shows a warning banner when source is `mock`.
- Discovery cache is tenant-aware and invalidated on provider config mutations:
  - model discovery cache key is scoped by `tenantId`
  - cache is reset after provider config create/update and manual provider discovery refresh.
- Runner-side provider throttling is enforced before provider calls:
  - in-memory limiter consumes per-tenant/per-provider RPM+TPM budgets
  - limits are read from `provider_configs.requests_per_minute` and `provider_configs.tokens_per_minute`
  - enforced in generation flow prior to invoking coding/chat providers.

### Step 16 — Knowledge System (LLMWIKI + pgvector-ready)
- Added additive knowledge persistence layer with markdown-first authoring and retrieval-ready records:
  - DB table: `knowledge_nodes`
  - fields: `id`, `tenant_id?`, `project_id?`, `scope`, `path`, `content`, `embedding?`, audit metadata
  - additive migration: `022_knowledge_system.sql`
- Scope model enforced:
  - `system`: global operational principles and architecture notes
  - `tenant`: tenant-wide standards and reusable patterns
  - `project`: project decisions/insights tied to execution context
- Filesystem knowledge tree introduced:
  - `knowledge/system/`
  - `knowledge/tenants/{tenantId}/`
  - `knowledge/projects/{projectId}/`
  - startup sync loads markdown into canonical DB records.
- New service package `@cp/knowledge`:
  - CRUD-compatible knowledge store adapter
  - markdown filesystem sync (`syncFilesystem`)
  - lexical search with semantic scoring fallback when embedding providers are configured
  - compact context builder for generation workflows.
- API routes added (additive only):
  - `GET /knowledge` (list/search by `tenant`, `project`, `scope`, `path`, `query`)
  - `GET /knowledge/:knowledgeNodeId`
  - `POST /knowledge`
  - `PATCH /knowledge/:knowledgeNodeId`
  - `DELETE /knowledge/:knowledgeNodeId`
  - `POST /knowledge/sync`
  - `GET /knowledge/context/search`
- Runner integration:
  - generation jobs inject compact system/project knowledge context before model call.
  - optional insight persistence from generation output is supported via `payload.captureKnowledge=true`.
  - only compact decisions/insights are persisted, not raw execution logs.
- UI integration:
  - project-scoped knowledge workspace route: `/project/:projectId/knowledge`
  - legacy `/knowledge` redirects to project-scoped route
  - supports list/search/edit/create/delete and filesystem sync trigger.

### Step 17 — Knowledge Configuration Layer (tenant/project policy controls)
- Added additive configuration model for deterministic knowledge behavior:
  - DB table: `knowledge_configs`
  - fields: `tenant_id`, optional `project_id`, `scope`, `auto_capture`, `capture_modes`, `require_approval`, `max_nodes`, `relevance_threshold`, `versioning`, `require_review`, audit metadata
  - additive migration: `023_knowledge_config.sql`.
- API routes (additive under `/knowledge/*`):
  - `GET /knowledge/config`
    - resolves effective policy with precedence `project -> tenant -> system -> default`.
    - returns canonical shape `{ item, source, items }`.
  - `POST /knowledge/config`
    - creates scoped policy records.
    - protected by tenant permission `canManageUsers` (owner/admin in RBAC mapping).
  - `PATCH /knowledge/config`
    - upsert-style patch; creates scoped default then applies patch when record is missing.
    - protected by tenant permission `canManageUsers`.
- Retrieval alignment:
  - `GET /knowledge/context/search` now applies effective `maxNodes` + `relevanceThreshold` when query overrides are not provided.
- Runner alignment:
  - generation jobs resolve effective knowledge config per tenant/project.
  - retrieval injection uses configured `maxNodes`/`relevanceThreshold`.
  - insight mutation follows config gates:
    - auto-capture only when enabled and `generation_output` mode is active
    - skips persistence when `requireApproval` or `requireReview` is enabled
    - writes into configured scope (`system|tenant|project`).
- Platform UI:
  - new settings page `/settings/knowledge` exposes capture, scope, retrieval and mutation controls.
  - integrated in owner/platform navigation and remains additive to existing routes/contracts.

### Step 18 — Prompt Governance + Coding HITL + Schemas Graph + Context Workspace
- Prompt governance is now first-class and additive:
  - domain contract: `PromptRegistryEntry` (`system|tenant|project`, version, status, target, content)
  - migration: `024_prompt_registry.sql`
  - routes:
    - `GET /prompts`
    - `GET /prompts/:promptId`
    - `POST /prompts`
    - `PATCH /prompts/:promptId`
    - `POST /prompts/:promptId/activate`
    - `POST /prompts/:promptId/deprecate`
  - active prompt resolution is scope-aware and consumed by prompt composition paths.
- Prompt composition remains centralized in `@cp/prompt-builder`:
  - brainstorming now resolves role instructions through prompt registry active entries before role-file fallback.
  - no direct prompt composition is introduced outside the builder boundary.
- Internal coding workflow with HITL is additive and project-scoped:
  - migration: `025_coding_workflow.sql`
  - entity: coding request/plan/tasks/approval states with explicit transitions
  - routes:
    - `GET /coding-workflow`
    - `GET /coding-workflow/:workflowId`
    - `POST /coding-workflow`
    - `POST /coding-workflow/:workflowId/approve`
    - `POST /coding-workflow/:workflowId/reject`
    - `POST /coding-workflow/:workflowId/revise`
    - `POST /coding-workflow/:workflowId/finalize`
- Schemas observability is now node-based in project context:
  - route: `/project/:projectId/schemas`
  - sections:
    - Data Model
    - API Contracts
    - System Structure
  - graph canvas + node detail panel are implemented in web app components, not as static tables.
- Project Context module (Obsidian-like notes) is additive:
  - migration: `026_context_notes.sql`
  - package: `@cp/context`
  - routes:
    - `GET /context`
    - `GET /context/:contextId`
    - `POST /context`
    - `PATCH /context/:contextId`
    - `DELETE /context/:contextId`
  - UI route: `/project/:projectId/context` with notes list, markdown editor, reader, search.
- Advanced memory integration:
  - knowledge retrieval thresholds and max nodes are enforced by effective config
  - context packet builder includes scoped knowledge snippets for generation/coding paths
  - runner writes compact knowledge insights only for meaningful outputs, policy-gated.
