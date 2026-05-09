# Devtools Roadmap Map

This is the canonical roadmap map. Every agent that changes platform compatibility, project/workspace flows, runtime execution, agents, local companion, mini IDE, security, deploy readiness, or production readiness must update this file in the same turn.

Detailed rationale and phase notes live in [`docs/ROADMAP_DETAILED.md`](./ROADMAP_DETAILED.md).

Last updated: 2026-05-09, passata 2 (PoloSaaS staging sync manifest).

Current table count: 🟢 34 done, 🟡 80 in progress, 🔴 53 to do.

Status legend:

- 🟢 Green: done enough to be used locally or by an early internal operator.
- 🟡 Yellow: partially implemented; needs hardening, UX, tests, scale work, policy, or production runbook.
- 🔴 Red: not implemented yet.

## Readiness Snapshot

| Area                      | Status | What It Means                                                                                                                                    |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| First deploy readiness    | 🟡     | Core app works locally, but deploy runbooks, runtime truthfulness, backups, smoke gates and remote infrastructure need closure.                  |
| Platform compatibility    | 🟡     | Additive `/api/v1/*` contract is mostly present, but enterprise forwarding, full permission mapping and action coverage need hardening.          |
| Project operating model   | 🟡     | Project overview, setup, roadmap, jobs and workspace are usable; hybrid sync and app target contracts are still immature.                        |
| Agent registry            | 🟡     | System agents, profiles and visuals exist in progress; file governance and AI-assisted custom generation need completion.                        |
| Mini IDE / code inspector | 🟡     | Inspect, diff and companion concepts exist; safe edits, terminal handoff and multi-window workflows need production shaping.                     |
| Visual contract layer     | 🟡     | Project schema graph exists; source-linked DB/API/runtime/app-flow maps need a stricter reality contract before they can guide non-senior users. |
| Runtime / jobs            | 🟡     | Runner-job model and DAG concepts exist; every operational button still needs audited runner-bound proof before deploy.                          |
| UX density and IA         | 🟡     | First compaction pass landed; settings, tenant, projects, agents and workspace still need systematic simplification.                             |
| Production operations     | 🔴     | Release runbook, restore drill, log forwarding, deployment topology and incident response are not deploy-ready.                                  |

## PoloSaaS Alignment Block

This block keeps the `POLOSAAS_ALIGNMENT.md` marker honest. Do not remove the marker until every failed check below is implemented and verified.

| Status | Check | Current Truth | Acceptance Criteria |
| ------ | ----- | ------------- | ------------------- |
| 🟢 | Repo rules | Repo has app-local `AGENTS.md` inheriting Devtools guardrails and PoloSaaS standards. | Keep AGENTS current when deploy or platform standards change. |
| 🟡 | README | Root `README.md` now documents local run commands and staging status. | Add complete production runbook, smoke path and operator recovery notes. |
| 🟡 | Deploy manifest | `.polosaas/deploy.json` exists with `deploymentStatus=not_ready` and no autonomous Coolify resources. | Mark ready only after Dockerfiles, env, healthchecks, pushed branch and staging smoke checks exist. |
| 🔴 | Dockerfiles | Root `Dockerfile.web`, `Dockerfile.api` and `Dockerfile.worker` are missing. | Add split web/API/worker Dockerfiles matching Coolify target placement. |
| 🟢 | Health/API manifest | API exposes `/health`, `/api/v1/health`, `/api/v1/app/manifest`, `/api/v1/session/context`, `/api/v1/audit/events` and `/api/v1/usage`. | Keep manifest route coverage and contract tests green. |
| 🟡 | Multitenancy | Tenant headers, tenant context and RBAC concepts exist. | Complete route-by-route tenant isolation smoke matrix before staging. |
| 🟡 | Audit and usage | Audit and usage tables/routes exist; owner UX and forwarding are incomplete. | Add production log/metric forwarding and owner filtering/export coverage. |
| 🟡 | Stateless runtime | API defaults to Postgres, jobs use Redis/runner concepts and idempotency exists for selected writes; artifact storage defaults to local dev storage and worker recovery is not staging-proven. | Use shared `platform-postgres-stg` schema `devtools`, durable object storage, worker health/recovery checks and no local disk source of truth. |
| 🟡 | Shared staging Postgres | Manifest points to `platform-postgres-stg` on `state-stg-01`, database `polosaas_stg`, schema `devtools`. | Apply migrations under app-owned schema and prove no sibling schema reads. |
| 🔴 | Shell embed / experience context | `shell_embed=content`, effective experience context, skins and template packs are not complete enough to claim compliance. | Hide app-global chrome when embedded and consume Platform Core theme/density/direction/skin/template context. |
| 🔴 | i18n/RTL production support | Manifest/session expose locale and direction placeholders, but real translation/RTL work is not complete. | Add localization pipeline, RTL layout checks and manifest fields matching runtime truth. |
| 🟡 | Secrets hygiene | `.env` is ignored and `.env.example` uses placeholders; local Playwright console logs exist untracked under `.playwright-mcp/`. | Keep secrets/runtime logs out of commits and add a preflight secret/log scan before release. |

## First Deploy Gate

| Status | Feature                     | Notes                                                                                                                                                       |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🟡     | Environment contract        | `.env.example` exists and has been updated over time, but first-deploy env matrix, safe defaults and prod/local differences need a single verified runbook. |
| 🟡     | Database migration safety   | Additive migrations are present; replay/restore drill and non-destructive production checklist still need to be proven.                                     |
| 🟡     | Auth/session/tenant gate    | `/auth/me`, tenant runtime and owner/admin/operator/viewer concepts exist; route-level browser smokes and role matrix still need full coverage.             |
| 🟡     | Runtime truthfulness        | Provider/model source labels and runtime status are improving; remaining mock/fallback paths must be labeled or removed before deploy.                      |
| 🟡     | Execution boundary drill    | Runner jobs, worker and API boundaries exist; all runnable UI controls still need proof that they do not bypass runner jobs.                                |
| 🟡     | Provider/model truth source | Provider config, discovery and model pages exist; live/cache/fallback visibility must be consistent everywhere.                                             |
| 🟡     | Secrets safety              | Secrets service and masked responses exist; audit of logs, local storage, browser state and export surfaces is still required.                              |
| 🟡     | Observability baseline      | Health, jobs, audit, usage, MCP and runtime pages exist; deploy dashboard and incident signals are still incomplete.                                        |
| 🟡     | Agent registry readiness    | Agent registry and detail pages exist; all system agents need complete files, diagnostics, visual identity and runtime compatibility.                       |
| 🟡     | Project creation path       | Project list/new/setup flows exist; default coordinator, workspace choice and recovery path need deterministic end-to-end verification.                     |
| 🟡     | Local companion MVP         | Local repos, desktop host and wrapper concepts exist; local command execution and preview must remain runner/API governed.                                  |
| 🔴     | Release runbook             | Start/stop/restart, migration, smoke, rollback, backup and incident response steps need a deploy-ready document.                                            |
| 🔴     | Restore drill               | No verified backup/restore drill is documented for first deploy.                                                                                            |
| 🔴     | First deploy dashboard      | Need one owner page that shows blockers, warnings, smoke status and release readiness.                                                                      |

## Platform Compatibility

| Status | Feature                           | Notes                                                                                                                 |
| ------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 🟢     | Root `GET /health`                | Existing health route remains available.                                                                              |
| 🟢     | `GET /api/v1/health` alias        | Platform health alias has been added as additive compatibility surface.                                               |
| 🟢     | `GET /api/v1/session/context`     | Platform-compatible session context exists with application, subject, tenant and action decision fields.              |
| 🟢     | `GET /api/v1/app/manifest`        | Manifest declares identity, headers, action metadata, route coverage and capability statuses.                         |
| 🟢     | Header normalization              | `x-source-app`, `x-correlation-id`, `x-idempotency-key` and `x-platform-tenant-id` are part of the platform contract. |
| 🟢     | Platform tenant alias             | `x-platform-tenant-id` aliases `x-tenant-id`.                                                                         |
| 🟡     | Audit platform fields             | Audit responses include platform fields in progress; route coverage and event consistency need full verification.     |
| 🟡     | Usage platform alias              | `/api/v1/usage` exists or is planned through compatibility routes; owner UX and contract tests need broad coverage.   |
| 🟡     | `/api/v1/mcp/*` aliases           | MCP compatibility surface exists in part; safe action coverage and delegated metadata need expansion.                 |
| 🟡     | Platform permission mapping       | Current mapping combines tenant role and auth permissions; enterprise-grade coverage per action remains incomplete.   |
| 🟡     | Idempotent write routes           | Idempotency exists for selected platform-managed writes; needs wider drift checks and replay tests.                   |
| 🟡     | Action registry route coverage    | Manifest/actions expose route coverage; coverage must be kept complete as routes evolve.                              |
| 🔴     | Enterprise log forwarding         | No production log forwarding contract for enterprise/platform operators yet.                                          |
| 🔴     | External platform provisioning UI | Signed provisioning/deprovisioning is contract-level only; no full owner workflow yet.                                |
| 🔴     | RTL/i18n production support       | Locale and direction placeholders exist; real translation/RTL work is not started.                                    |

## Auth, RBAC, Tenant Governance

| Status | Feature                        | Notes                                                                                                             |
| ------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 🟢     | Tenant runtime context         | Request tenant context and role/permission mapping exist.                                                         |
| 🟢     | Fixed tenant roles             | Owner/admin/manager/user/guest style roles exist in domain/runtime.                                               |
| 🟡     | Tenant users UI                | `/tenant/users` and settings users pages exist; owner workflows need denser IA and full role action verification. |
| 🟡     | Platform RBAC UI               | `/platform/rbac` exists; it still needs clearer permission editing, audit trail and contract coverage.            |
| 🟡     | Route guard consistency        | Settings/account/tenant/platform guards exist in concept; needs route-by-route smoke matrix.                      |
| 🟡     | Owner mode                     | Owner/platform view exists; UX still shows duplicated context in places.                                          |
| 🔴     | Fine-grained permission editor | Need a governed UI for permission bundles, exceptions and dry-run impact.                                         |
| 🔴     | SSO/OIDC production hardening  | Auth plan exists; live enterprise identity provider validation is not complete.                                   |

## Projects, Roadmap And Planning

| Status | Feature                           | Notes                                                                                                            |
| ------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 🟢     | Project list and project overview | `/projects` and project overview work locally.                                                                   |
| 🟢     | Project roadmap page              | `/project/:projectId/roadmap` exists with intake class, priority, owner, contract and verification fields.       |
| 🟢     | Roadmap item state updates        | Roadmap items can be updated through API/UI.                                                                     |
| 🟢     | Roadmap-to-task conversion        | Approved roadmap items can be converted into tasks.                                                              |
| 🟢     | Project app blueprint MVP         | Project owners can turn a structured app brief into governed project knowledge plus an initial roadmap seed.     |
| 🟢     | Project app contract MVP          | Latest blueprint can become a governed app contract with entities, lifecycle, workflow, screens and API candidates. |
| 🟡     | First-deploy feature intake       | Intake classes exist; the backlog still needs systematic population and owner review.                            |
| 🟡     | Project setup/onboarding          | Setup exists; needs clearer separation between quick-start onboarding and advanced runtime settings.             |
| 🟡     | Default coordinator assignment    | Runtime profile has coordinator concepts; deterministic project birth with default coordinator needs full proof. |
| 🟡     | Project recovery path             | Setup-required state exists; recovery after partial setup needs stronger UX and tests.                           |
| 🟡     | Brainstorm-to-roadmap             | Brainstorm plans can create project/roadmap/tasks; UX needs production hardening.                                |
| 🔴     | Deploy readiness project gate     | Need a per-project gate that lists blockers, warnings and required smoke tests.                                  |
| 🔴     | Roadmap dependency view           | Need dependency map between roadmap items, tasks, jobs and approvals.                                            |
| 🔴     | Roadmap owner SLA                 | Need owner, due date, risk and escalation semantics surfaced in UI.                                              |

## Workspace, Local Companion And App Targets

| Status | Feature                        | Notes                                                                                                               |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 🟢     | Local repositories module      | Local repos page/service exists with scanning and repository metadata.                                              |
| 🟡     | Workspace modes                | Local, remote, hybrid manual and hybrid synced concepts are present; semantics and conflict UX need hardening.      |
| 🟡     | Workspace mode UI              | Project overview/setup expose workspace mode; controls still need simplification and validation feedback.           |
| 🟡     | Local folder attach            | Folder picker and local path handling exist; production permission and recovery UX need work.                       |
| 🟡     | App target config              | Name, commands, preview URL/port and local wrapper target fields exist; schema and multi-app UX need strengthening. |
| 🟡     | Local preview                  | Preview URL/port fields exist; actual lifecycle and preview availability need robust runner-bound integration.      |
| 🟡     | Remote workspace               | Remote-only mode exists conceptually; backing storage contract is not deploy-ready.                                 |
| 🔴     | Hybrid sync engine             | Manual push/pull, conflict detection and sync history are not implemented enough for production.                    |
| 🔴     | Preview gateway                | Need controlled gateway/proxy for remote previews without exposing sandbox nodes.                                   |
| 🔴     | Multi-app project runtime      | Need first-class multiple app targets with commands, ports, health and preview selection.                           |
| 🔴     | Companion machine trust policy | Need registration, revocation, permissions and audit for attached local machines.                                   |

## Agents And Agent Registry

| Status | Feature                    | Notes                                                                                                                                              |
| ------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🟢     | Agent registry route       | `/settings/agents` and `/agents` exist.                                                                                                            |
| 🟢     | Agent detail route         | `/settings/agents/:agentId` exists.                                                                                                                |
| 🟡     | System agent presets       | Multiple presets exist; list completeness and migration from old names need verification.                                                          |
| 🟡     | Agent visual identity      | Generated/default portraits are in progress; every system agent still needs a stable face/photo asset.                                             |
| 🟡     | Agent profile files        | `agent.md`, `soul.md`, `summary.md`, `guardrails.md` style artifacts are planned/partially represented; source-of-truth persistence needs closure. |
| 🟡     | Editable agent files       | Editing UX is in progress; validation, versioning and save/audit semantics need hardening.                                                         |
| 🟡     | Agent runtime profile      | Runtime kind/vendor/host/launch mode exists; fixtures/tests and UI must stay aligned.                                                              |
| 🟡     | Agent diagnostics          | Diagnostics tab/route concepts exist; output schema and runbook need standardization.                                                              |
| 🔴     | AI-assisted agent creation | Need governed generation of profile files and visual identity from user-provided identikit.                                                        |
| 🔴     | Agent compatibility matrix | Need visible compatibility between agent, model provider, runtime host and project mode.                                                           |
| 🔴     | Agent change approval      | Need approval/version flow for risky system-agent config changes.                                                                                  |

## Mini IDE, Code Inspector And Terminals

| Status | Feature                          | Notes                                                                                                                 |
| ------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 🟡     | Code inspector page              | Project workspace/mini IDE exists in progress.                                                                        |
| 🟡     | Repository tree navigation       | Tree/list concepts exist; needs compact nested folder navigation and diff markers on files/folders.                   |
| 🟡     | Diff view                        | Diff tabs and +/- visual treatment are in progress; line numbers and readable inline diff need final polish.          |
| 🟡     | Companion IDE window             | `/project/:projectId/ide` companion route exists; open companion behavior and multi-screen workflow need reliability. |
| 🟡     | Assisted terminal UI             | Assisted terminal concepts exist; commands must remain staged for runner approval, not direct execution.              |
| 🟡     | Multiple terminal sessions       | UI concept requested; session model, local/remote/hybrid target and audit trail need implementation.                  |
| 🟡     | Safe file editing                | File editor/write path must go through governed APIs; unsaved state and validation need coverage.                     |
| 🔴     | Runner-backed terminal execution | Need canonical command request -> approval -> runner job -> transcript flow.                                          |
| 🔴     | IDE multi-window layout manager  | Need persistent layout for IDE/control panel/preview across multi-screen setups.                                      |
| 🔴     | Conflict-aware hybrid editing    | Need local/remote file sync conflict model before hybrid editing is trustworthy.                                      |

## Runtime, Jobs, Tasks And Execution

| Status | Feature                  | Notes                                                                                              |
| ------ | ------------------------ | -------------------------------------------------------------------------------------------------- |
| 🟢     | Jobs API                 | Job list/detail/status routes exist.                                                               |
| 🟢     | DAG job baseline         | Dependencies, ready state and executable queue concepts exist.                                     |
| 🟢     | Task/task-run domain     | Tasks and task runs exist with lifecycle states.                                                   |
| 🟡     | Worker executor boundary | Worker is intended as executor only; every operational path needs continuous boundary tests.       |
| 🟡     | Runtime pages            | Runs/runtime/monitoring routes exist; UI still needs clearer status semantics.                     |
| 🟡     | Approval gates           | Approvals exist for roadmap/task flows; need broader execution policy integration.                 |
| 🟡     | Artifacts and retrieval  | Artifact/retrieval pages exist; publication and retention rules need hardening.                    |
| 🟡     | Incident panel           | Failed/stuck jobs and heartbeat drift are visible in pieces; one incident surface is not complete. |
| 🔴     | `doctor` command         | Need web/CLI diagnostics for auth, provider, worker, DB, migration and runtime readiness.          |
| 🔴     | Execution replay/runbook | Need operator runbook for stuck jobs, retries, cancellation and rollback.                          |
| 🔴     | Fair queue policy        | Need tenant/project fairness and priority enforcement before scale.                                |

## Providers, Models And Secrets

| Status | Feature                       | Notes                                                                                           |
| ------ | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| 🟢     | Provider config API/UI        | Provider settings pages and routes exist.                                                       |
| 🟢     | Secret references             | Provider secrets can use masked/env/secret references.                                          |
| 🟢     | Provider validation metadata  | Validation status and error fields exist.                                                       |
| 🟡     | Model catalog                 | Models page exists; stale/hardcoded/fallback data must be impossible to confuse with live data. |
| 🟡     | Provider auto-discovery       | Discovery endpoints and UI exist; scheduling, provenance and rollback need strengthening.       |
| 🟡     | BYO model/provider policy     | BYO keys/runtimes are the product direction; tenant policy UI is incomplete.                    |
| 🟡     | Provider rate limits          | RPM/TPM concepts exist; owner UX and runtime enforcement need verification.                     |
| 🔴     | Cost/budget controls          | Need per-tenant/project budgets, alerts and action blocking.                                    |
| 🔴     | Provider incident degradation | Need clear degraded-provider behavior and operator escalation.                                  |

## Prompt, Knowledge And Context Governance

| Status | Feature                          | Notes                                                                                                                                             |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🟢     | Prompt registry baseline         | Prompt registry and subprompt composition exist.                                                                                                  |
| 🟢     | Brainstorm plan canonical schema | Canonical nested BrainstormPlan shape exists.                                                                                                     |
| 🟡     | Prompt source traceability       | Prompt source metadata exists in parts; every runtime generation path needs audit proof.                                                          |
| 🟡     | Knowledge pages                  | Knowledge/context/memory pages exist; promotion and governance flows need tightening.                                                             |
| 🟡     | pgvector-ready retrieval         | Retrieval/knowledge baseline exists; production data policy and quality gates need work.                                                          |
| 🟢     | Knowledge write governance MVP   | Manual writes now expose governance status, block oversized raw captures, and honor review/approval policy for direct writes and filesystem sync. |
| 🟡     | Context promotion                | Notes/decisions/artifacts need a governed "promote to knowledge" path.                                                                            |
| 🟡     | Knowledge quality gates          | Dedupe, size limits and summary-before-store are listed but not fully enforced everywhere.                                                        |
| 🔴     | Prompt change approval           | Need versioned approval workflow for production prompt changes.                                                                                   |
| 🔴     | Knowledge retention policy       | Need retention, export and deletion semantics for tenant/project knowledge.                                                                       |

## Visual Contract Layer And Diagramming

Reference contract: [`docs/visual-contract-layer.md`](./visual-contract-layer.md).

| Status | Feature                             | Notes                                                                                                                                              |
| ------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🟢     | Project schema graph route          | `/project/:projectId/schemas` exists with a node-based canvas for Data Model, API Contracts and System Structure.                                  |
| 🟢     | API-first source provenance MVP     | The schema graph consumes canonical `/schema-observability`; frontend no longer rebuilds a legacy graph and visible node details show source refs. |
| 🟢     | Blueprint-to-visual map seed        | Project app blueprints now appear as a source-linked App Blueprint graph section backed by governed knowledge and roadmap refs.                    |
| 🟢     | App contract graph anchor           | Saved app contracts add a source-linked node to the App Blueprint graph so planning artifacts remain visible before implementation.                |
| 🟡     | Data model source anchoring         | Schema docs and introspection feed the graph; FK/relation extraction, stale-state warnings and source references need hardening.                   |
| 🟡     | System flow source anchoring        | Project/tasks/jobs/agents are represented; route/service/job/event extraction must replace static or manually inferred flow nodes.                 |
| 🔴     | React Flow/canvas interaction layer | Need production-grade pan/zoom, minimap, layout, grouping, filtering and source drill-down; current custom canvas can remain an interim renderer.  |
| 🔴     | Validated diagram artifact store    | Need versioned graph snapshots with source refs, generatedAt, confidence, stale state and approval/lock status.                                    |
| 🔴     | Excalidraw brainstorming lane       | Need a separate freeform sketching surface where ideas are explicitly draft/unverified and cannot masquerade as validated architecture.            |
| 🔴     | Non-senior explanation mode         | Need plain-language overlays that explain why a table, endpoint, service or job exists and what changes would affect it.                           |
| 🔴     | Diagram-to-roadmap/task linking     | Need graph nodes that can open related files/routes/jobs and create roadmap items or tasks without bypassing governance.                           |

## MCP, Integrations And Extensibility

| Status | Feature                           | Notes                                                                                 |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------- |
| 🟢     | MCP status and connections        | `/mcp/status` and `/mcp/connections` exist.                                           |
| 🟡     | MCP delegate                      | Delegation exists; agent-operable action coverage and safety metadata need expansion. |
| 🟡     | Platform MCP action export        | `/api/v1/mcp/actions` exists/contracted; coverage needs to stay complete.             |
| 🟡     | Integrations page                 | Settings/platform integrations route exists through MCP page.                         |
| 🔴     | Plugin marketplace                | Explicitly not for first deploy.                                                      |
| 🔴     | Public extension API              | Need stable versioned plugin/action contracts before external extension.              |
| 🔴     | Third-party customer data sources | Planned; not started.                                                                 |

## Audit, Usage, Observability And Admin

| Status | Feature               | Notes                                                                                           |
| ------ | --------------------- | ----------------------------------------------------------------------------------------------- |
| 🟢     | Audit route           | Audit route exists.                                                                             |
| 🟢     | Usage route           | Usage route exists.                                                                             |
| 🟡     | Audit owner UI        | Platform audit route exists but shares RBAC/admin surface; needs dedicated filtering/export UX. |
| 🟡     | Usage owner UI        | Usage is visible through runtime/settings in pieces; cost/usage view needs clearer IA.          |
| 🟡     | Database/schema pages | Database and schema docs/observability routes exist; operator affordances need simplification.  |
| 🟡     | Versioning page       | Versioning route exists; release provenance needs stronger integration.                         |
| 🟡     | Stack page            | Stack route exists; deploy topology and health signals need production alignment.               |
| 🔴     | Enterprise log export | Need external SIEM/log drain integration and retention policy.                                  |
| 🔴     | Alerting              | Need alerts for failed jobs, provider failures, worker drift, DB pressure and security events.  |
| 🔴     | Incident timeline     | Need correlation-based timeline across audit, jobs, usage and MCP delegation.                   |

## UI, IA And Usability

| Status | Feature                       | Notes                                                                                           |
| ------ | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| 🟡     | Global compactness pass       | First density pass completed on shared panels/topbar/project overview; more pages need cleanup. |
| 🟡     | Settings IA                   | Account/tenant/platform split exists; duplicate headers and hub copy need reduction.            |
| 🟡     | Project shell IA              | `launcher -> operations -> workspace` exists; some duplicated project context remains.          |
| 🟡     | Agent cards                   | Compact cards and portraits are in progress; card/detail hierarchy needs final polish.          |
| 🟡     | Models page                   | Visual refresh exists; live source truth and stale state warnings need refinement.              |
| 🟡     | Local repos page              | Existing page is functional but still too bulky for repeated owner use.                         |
| 🟡     | Tenant users page             | Needs compact table/actions and clearer role management.                                        |
| 🔴     | Accessibility audit           | Keyboard, focus, contrast and screen-reader flow need a dedicated pass.                         |
| 🔴     | Mobile/tablet operator layout | Responsive rules exist in places; core owner workflows need real mobile/tablet validation.      |
| 🔴     | UX contract snapshots         | Need visual/smoke snapshots for key pages so density work does not regress.                     |

## Infrastructure And Deployment

| Status | Feature                   | Notes                                                                             |
| ------ | ------------------------- | --------------------------------------------------------------------------------- |
| 🟢     | Local dev Docker services | Postgres/Redis local compose path exists.                                         |
| 🟡     | Local dev server workflow | API/web can run locally on separate ports; needs single documented clean start.   |
| 🟡     | Cloud.it MVP topology     | Roadmap defines topology; implementation and deployment scripts are not complete. |
| 🟡     | Remote runner host        | Concept exists; MVP provisioning and isolation policy need implementation.        |
| 🟡     | Remote workspace storage  | 20GB/50GB contract is planned; backing service and quotas are not ready.          |
| 🔴     | Production backup/restore | Need backup automation and restore verification.                                  |
| 🔴     | Rollback process          | Need release rollback, migration rollback and config rollback procedures.         |
| 🔴     | Public preview gateway    | Need secure preview routing for remote sandboxes.                                 |
| 🔴     | AWS migration             | Strategic later track only; not needed before product validation.                 |
| 🔴     | Autoscaling/fairness      | Need queue/worker scaling policy after MVP validation.                            |

## Strategic / Post-Deploy Backlog

| Status | Feature                             | Notes                                                                                 |
| ------ | ----------------------------------- | ------------------------------------------------------------------------------------- |
| 🔴     | Plugin marketplace                  | Wait until runner/API/worker contracts are stable.                                    |
| 🔴     | Enterprise policy packs             | Need reusable tenant policies for regulated teams.                                    |
| 🔴     | Multi-tenant billing/entitlements   | Not first deploy unless tied to PoloSaaS platform account controls.                   |
| 🔴     | Advanced analytics for usage        | Need cost, productivity, quality and model/provider analytics after base usage works. |
| 🔴     | Full remote dev environment product | Remote workspaces/sandboxes should mature after local/hybrid trust is proven.         |
| 🔴     | Public API for external agents      | Blocked until action registry, permission mapping and audit contracts are complete.   |

## Immediate Next Pass

| Priority | Status | Task                                                                                                                                              | Verification                                                                                                     |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1        | 🟡     | Populate first-deploy blockers into the live roadmap module for `proj_001`.                                                                       | Browser: `/project/proj_001/roadmap`; API: `GET /roadmap?projectId=proj_001`.                                    |
| 2        | 🟡     | Finish compact UI pass on `/settings`, `/settings/agents`, `/settings/local-repos`, `/projects`, `/tenant/users`, `/projects/proj_001/workspace`. | Focused browser screenshots plus existing smoke tests.                                                           |
| 3        | 🟡     | Prove all workspace/runtime buttons create or inspect runner jobs instead of executing directly.                                                  | Contract tests around workspace/runtime routes and job audit metadata.                                           |
| 4        | 🟡     | Complete system agent profile files, portraits, diagnostics and runtime compatibility metadata.                                                   | Agent registry smoke + file persistence validation.                                                              |
| 5        | 🟡     | Expand the source-linked visual contract layer beyond the API-first provenance MVP and keep Excalidraw separate for brainstorming.                | `/project/proj_001/schemas`; source refs visible on every validated node; unverified nodes clearly marked draft. |
| 6        | 🔴     | Write first deploy runbook and restore drill.                                                                                                     | Dry run from clean env; documented rollback and restore output.                                                  |
| 7        | 🔴     | Define hybrid sync contract before adding auto-sync behavior.                                                                                     | Contract doc plus conflict-state UI mock/smoke.                                                                  |
