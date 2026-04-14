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
| `@cp/providers` | `@cp/domain`, `@cp/config` |
| `@cp/memory` | `@cp/domain`, `@cp/config`, `@cp/providers` |
| `@cp/retrieval` | `@cp/domain`, `@cp/config`, `@cp/memory`, `@cp/providers` |
| `@cp/verifier` | `@cp/domain`, `@cp/config` |
| `@cp/agents` | `@cp/domain`, `@cp/config` |
| `@cp/orchestration-ruflo` | `@cp/domain`, `@cp/config`, `@cp/providers`, `@cp/retrieval`, `@cp/verifier`, `@cp/agents` |
| `@cp/autoresearch` | `@cp/domain`, `@cp/config`, `@cp/retrieval` |
| `@cp/ui-kit` | `@cp/domain` |
| `apps/api` | all packages except `@cp/ui-kit` |
| `apps/worker` | `@cp/domain`, `@cp/config`, `@cp/orchestration-ruflo`, `@cp/retrieval`, `@cp/memory`, `@cp/providers`, `@cp/verifier`, `@cp/autoresearch` |
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
- Added worker runtime execution parity for Paperclip-style CLI diagnostics:
  - queue `agent-runtime-jobs`
  - async command execution (`paperclipai heartbeat run`, `paperclipai doctor run`) with structured log capture
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

### Operational Notes
- Local developer defaults use Postgres host port `56432` in `.env.example` and `docker-compose.yml` to reduce host collision risk.
- Auth runtime is feature-flagged (`AUTH_ENABLED`) and disabled by default for single-tenant compatibility.

### Current Known Gaps (Intentional for this iteration)
- Provider live tests are conditional by available secrets; full credential matrix coverage is not guaranteed on every run.
- Optional visual/performance tooling is wired, but enterprise-grade baselines/reporting backends are not yet integrated.
- OIDC flow currently trusts configured issuer endpoints and does not yet validate JWKS signatures for `id_token`.
- SCIM provisioning, SAML implementation, and full enterprise SSO lifecycle (for example back-channel logout) are not yet implemented.
