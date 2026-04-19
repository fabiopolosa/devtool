# DevTools Technical Roadmap (Detailed)

## 0. Current Stage and Intent
- Stage: alpha internal operability.
- Primary objective: move from feature-rich alpha to predictable platform behavior under multi-agent load.
- Non-goal for this roadmap: maximizing feature count before control, reliability, and operating contracts are stable.

### 0.1 Workspace and Runtime Thesis
- `Workspace` is the persistent project filesystem, not the place where agents or application runtimes permanently live.
- `Project agent` is the per-project coordinator. It manages run/test/build/restart/deploy flows through runner jobs and remains the operational brain of the project.
- `Application sandbox` is a temporary runtime used for `npm run dev`, tests, build, preview, and similar app execution tasks. It is distinct from both the workspace and the agent runtime.
- `Local companion / worker` gives the same project access to local filesystem, local CLI, and local preview flows without creating a second control plane.
- Browser and desktop must converge on the same control plane and project model. The desktop shell may add native capabilities, but it must not create a separate product logic path.
- Model/provider compute is expected to be customer-supplied by default (`BYO API key`, `BYO CLI`, customer-local or customer-hosted runtimes). Platform value comes from orchestration, workspace continuity, and project control.

### 0.2 Workspace Modes (Product Contract)
- `Local only`: project works against a customer filesystem only, with no remote workspace copy.
- `Remote only`: project works against a remote workspace copy and uses remote app sandboxes.
- `Hybrid synced`: local and remote workspace copies can be synchronized under explicit sync policy.
- `Hybrid manual`: local remains primary until the user explicitly pushes/pulls sync state.
- Workspace sync policy must be explicit (`no sync`, `manual sync`, `auto sync`) and conflict handling must be visible to the operator.
- Multi-app projects must be first-class: each project can define multiple app targets with command contracts, default ports, preview semantics, and runtime requirements.

## 1. Phase Map (P0 to P5)
| Phase | Status | Primary Outcome | Exit Gate |
|---|---|---|---|
| P0 | Done | Foundation shipped for execution + research + prompt governance baseline | Core flows operational in internal env |
| P1 | Current | Operability hardening and usability coherence | Operators can run daily workflows without manual recovery |
| P2 | Planned | Deterministic control system from intent to orchestrated jobs | Chat-to-job control is explicit, auditable, and reversible |
| P3 | Planned | Content system productization | Research/content/multimodal pipelines are production-shaped |
| P4 | Planned | Scalable execution substrate | Tenant-safe queue and worker scaling with fairness |
| P5 | Planned | Platform extension model | Plugins/integrations/API can extend system without forking core |

## 1.1 Deployment Track A: Cloud.it MVP
### Mission
Validate the product on low-cost private infrastructure before committing to hyperscaler complexity.

### Topology
- Public edge: `frontend` and preview/access gateway.
- Private network: `api/control plane`, `postgres + pgvector`, `runner host`, and remote workspace backing services.
- Remote workspaces remain persistent while app sandboxes are started on demand.
- One warm runner is acceptable for MVP; additional runner capacity should be added horizontally, not by turning the control-plane node into a general compute host.

### MVP Principles
- Prefer small machines and explicit limits over early autoscaling complexity.
- Keep control plane, database, and runner isolation explicit even if fleet size is tiny.
- Do not expose sandbox nodes directly to the public Internet; preview access should flow through a controlled gateway/proxy path.
- Accept that local development is the primary path early on; remote workspaces and remote sandboxes are there to validate continuity, not to replace the developer workstation on day one.

### MVP Backlog Additions
- Define remote workspace storage contract for `20 GB` / `50 GB` workspace plans.
- Add project-level workspace mode selection (`local`, `remote`, `hybrid`) in onboarding and project settings.
- Add project app-target schema (`name`, `path`, `devCommand`, `testCommand`, `buildCommand`, `defaultPort`, `previewType`).
- Add preview gateway contract for multi-app projects and port selection.
- Add local companion registration path so a browser user can attach a local machine without changing control-plane behavior.

### MVP Exit Gate
- A developer can start local-first, attach a remote workspace, continue from another machine, and return to the original machine with an explicit sync flow.
- A project agent can run install/test/build/restart actions against both local companion targets and remote app sandboxes through the same runner job model.
- Remote previews work without exposing sandbox nodes directly.

## 1.2 Deployment Track B: AWS Migration Target
### Mission
Move from small-scale validation infrastructure to managed, scalable, isolated production infrastructure after product validation.

### Migration Trigger
- Trigger migration only after product validation shows repeated hybrid workspace use, meaningful remote sandbox demand, and stable paying usage.
- AWS migration is not a prerequisite for product-market validation; it is a scaling and operability milestone.

### Target Topology
- Public edge: CDN/ALB/web frontend.
- Private VPC services: API/control plane, queue/cache, project-agent execution pool, sandbox runner pools, database, workspace backing services.
- Managed services preferred where they reduce operational risk (`RDS/pgvector-compatible Postgres`, managed queue/cache, object/block storage, autoscaling groups or container orchestration only when justified).
- Separate pools for control-plane workloads, agent workloads, and app sandbox workloads.

### Migration Objectives
- Preserve the same project/workspace/app-target contracts used in the Cloud.it MVP.
- Replace hand-managed runner growth with predictable autoscaling policies.
- Improve tenant/project isolation, observability, and disaster recovery.
- Introduce cost controls for remote workspaces, preview lifetimes, and sandbox concurrency before widening remote-runtime usage.

### AWS Exit Gate
- Same workspace contract works unchanged across both infrastructure tracks.
- Project agents and app sandboxes remain on one runner job model with auditable routing.
- Tenant-heavy usage no longer requires manual node intervention for normal workload bursts.

## 2. P0 (DONE) Baseline Summary
Delivered baseline capabilities (without re-explaining internals):
- Hybrid execution fabric (local + remote) with DAG runner integration.
- Local worker + CLI operational path.
- Provider system with OpenAI/OpenRouter support and routing primitives.
- Prompt registry baseline and governed prompt lifecycle.
- pgvector-ready retrieval and knowledge context composition.
- AutoResearch pipeline baseline.

P0 carry-over debt to handle in later phases:
- Runtime fallback and mock pathways still exist in parts of runtime/UI.
- Control-plane and execution-plane boundaries are not fully strict yet.
- Prompt resolution still has fallback defaults in some flows.

## 3. P1 (CURRENT) Operability
### P1 Mission
Make daily internal operation stable, legible, and low-friction before adding larger control abstractions.

### P1 Workstreams and Actionable Backlog
- `P1-UX-01` Control layer UX: unify operational views for jobs, agents, pipelines, and approvals into a single journey (`launcher -> operations -> workspace`).
- `P1-UX-02` Add deterministic status semantics (`idle/running/waiting_user/done/error`) everywhere in UI and CLI output.
- `P1-UX-03` Add first-class incident panel (failed jobs, stuck jobs, worker heartbeat drift, provider degradation).
- `P1-AGENT-01` Agent usability: improve agent card model (capabilities, health, tenancy, adapter visibility) with clear routing explanations.
- `P1-AGENT-02` Add agent diagnostics runbook output from API and CLI in the same schema.
- `P1-CODE-01` Coding workflow refinement: enforce approval checkpoints and structured diff artifact publication.
- `P1-CODE-02` Remove hidden workflow side effects and require explicit state transitions for revise/approve/finalize.
- `P1-CONTEXT-01` Context workspace maturity: note links, decision tagging, scoped search, and "promote to knowledge insight" flow.
- `P1-CONTEXT-02` Introduce context quality gates (dedupe, size limits, summary-before-store).
- `P1-SCHEMA-01` Schemas usability: improve graph discoverability with dependency highlighting and contract provenance.
- `P1-PROV-01` Provider UX: make source-of-truth visible (`live/cache/fallback`), routing rationale, and model capability errors.
- `P1-PROV-02` Standardize provider misconfiguration messages for UI + CLI parity.
- `P1-CLI-01` CLI usability: simplify command surfaces around run/inspect/fix workflows and make mode choice explicit.
- `P1-CLI-02` Add one-command diagnostics (`devtools doctor`) including auth/provider/worker/readiness checks.
- `P1-WS-01` Workspace UX: make `local`, `remote`, and `hybrid` modes explicit in onboarding and project views, with no ambiguous duplicate controls.
- `P1-WS-02` Remove "project not found / onboarding dead-end" flows by ensuring every new project is born with a default coordinator agent and a pending setup state.
- `P1-WS-03` Add first usable workspace sync semantics (`manual push`, `manual pull`, visible conflict state) before any auto-sync expansion.
- `P1-RUN-01` Project runtime UX: make app targets, default ports, preview actions, and local-vs-remote execution intent visible at project level.
- `P1-RUN-02` Split onboarding from advanced runtime configuration: onboarding should capture the minimal decisions needed to start, while detailed runtime/app controls live in project settings.
- `P1-LOCAL-01` Ship the first local wrapper / companion path as soon as possible so the same project can access local folders, local CLI, and local browser previews from the unified Devtools UI.
- `P1-LOCAL-02` Keep the wrapper thin: native bridge, machine registration, local folder attach, command execution, and local preview open; no separate control logic in the wrapper.

### P1 Architectural Decisions
- Keep runner as canonical execution engine, not per-feature executors.
- Keep API as system-of-record and policy gate.
- Keep worker as execution runtime and telemetry emitter.
- Keep prompt resolution explicit and traceable with source metadata.
- Keep `workspace`, `project agent`, and `application sandbox` as separate concerns in both code and UX.

### P1 Risks
- Boundary leakage between API and execution runtime can reintroduce hidden execution paths.
- Mock/fallback behavior in runtime can mask production defects.
- UI can drift into duplicate entry points if navigation is not constrained.
- Workspace sync without explicit conflict semantics can destroy user trust faster than almost any other feature.

### P1 Exit Criteria
- 95% of internal tasks complete without manual DB edits or service restarts.
- 100% execution actions carry routing metadata and actor attribution.
- CLI and web show the same job state and failure reasons for sampled flows.
- Prompt source (`registry` vs fallback) is visible in logs for all generation paths.
- A new project is always created with a default coordinator agent and a valid setup path.
- Workspace mode and preview target are legible from the project UI without reading documentation.

### P1 Not To Build Yet
- No plugin marketplace work.
- No custom queue infrastructure beyond current minimal needs.
- No new orchestration engines.
- No broad "universal builder" UI.
- No fully automatic bidirectional filesystem sync until manual sync and conflict visibility are proven usable.

## 4. P2 Control System
### P2 Mission
Turn chat and operator intent into deterministic, typed, auditable job plans.

### P2 Scope
- Chat control layer with explicit command envelopes.
- Intent-to-job mapping with strict schema validation.
- Agent orchestration policies (selection, budget, retries, approval boundaries).
- Pipeline abstraction as typed domain contracts, not free-form graphs.
- Workspace action envelopes (`sync`, `attach local`, `prepare sandbox`, `open preview`, `restart app`) with typed intent and auditability.

### P2 Backlog
- `P2-CHAT-01` Define canonical chat command contract with validation and versioning.
- `P2-CHAT-02` Add control-layer intent classifier with confidence and fallback handling.
- `P2-MAP-01` Build intent-to-job planner producing DAG-ready jobs with dependencies.
- `P2-MAP-02` Add dry-run mode that shows produced jobs without execution.
- `P2-ORCH-01` Add orchestration policy module for capability match, budget, and approval gates.
- `P2-ORCH-02` Add deterministic idempotency keys for repeated control requests.
- `P2-PIPE-01` Normalize pipeline contracts (research/content/visual/multimodal) into stable I/O schemas.
- `P2-WS-01` Define typed workspace sync contract (`push`, `pull`, `reconcile`, `no-sync`) with explicit conflict results.
- `P2-WS-02` Define canonical app-target execution contract so the same project can run one or more apps on known ports locally or remotely.
- `P2-AGENT-01` Normalize the project-agent contract so every project has one primary coordinator and optional additional agents created either manually or through governed setup flows.

### P2 Dependencies
- Depends on P1 status semantics, diagnostics, and boundary hardening.

### P2 Risks
- Over-general control model can become a second orchestration path.
- Insufficient schema rigor can make intent mapping non-deterministic.

### P2 Exit Criteria
- Same intent produces same job plan under same inputs.
- All control actions are replayable from audit logs.
- Pipeline invocation path is singular through runner contracts.
- Workspace sync and preview operations produce typed, reversible job plans instead of hidden side effects.

### P2 Not To Build Yet
- No low-code "build your own workflow graph" system.
- No natural-language direct execution bypassing intent mapping.

## 5. P3 Content System
### P3 Mission
Productize content generation workflows with domain guarantees and asset traceability.

### P3 Scope
- Research pipelines with quality scoring and evidence linking.
- Long-form content pipelines with structured section plans.
- Multimodal generation with visual plan + asset outputs.
- Asset pipeline governance (metadata, provenance, storage policy).

### P3 Backlog
- `P3-RES-01` Enforce research evidence schema and confidence score contract.
- `P3-RES-02` Add retrieval provenance and citation metadata per section.
- `P3-CONT-01` Add section-level drafting lifecycle with review states.
- `P3-CONT-02` Add style/tone objectives as explicit config, not hidden prompt text.
- `P3-MM-01` Standardize multimodal bundle output (`content`, `visual_plan`, `assets`, `usage`).
- `P3-ASSET-01` Implement asset manifest with hash, source model/provider, and generation params.
- `P3-ASSET-02` Add retention and cleanup policies by tenant/project.

### P3 Dependencies
- Depends on P2 typed control and pipeline contracts.

### P3 Risks
- Prompt drift can break quality consistency.
- Asset sprawl can increase cost and operational complexity.

### P3 Exit Criteria
- All content pipelines emit validated structured outputs.
- Asset outputs are traceable to input intent, model, and execution run.
- Human review gates can block publication without blocking generation.

### P3 Not To Build Yet
- No public publishing/distribution platform.
- No speculative support for every media format.

## 6. P4 Scaling
### P4 Mission
Support sustained multi-tenant throughput with fairness and isolation.

### P4 Scope
- Queue system adoption (BullMQ or equivalent managed queue stack).
- Worker pool management with autoscaling policies.
- GPU routing (Flux) for relevant workloads.
- Priority and fairness scheduling.
- Tenant isolation for compute and storage paths.
- Separation of project-agent compute from application-sandbox compute.
- Remote workspace durability and quota enforcement as billable platform primitives.

### P4 Backlog
- `P4-QUEUE-01` Move job dispatch to durable queue backend with retry/dead-letter policies.
- `P4-QUEUE-02` Add queue observability (lag, retries, poison jobs, per-tenant throughput).
- `P4-WORKER-01` Implement worker pools by capability class and execution mode.
- `P4-WORKER-02` Add admission control and concurrency limits per tenant.
- `P4-GPU-01` Add Flux routing policy for image/multimodal workloads.
- `P4-GPU-02` Add GPU fallback strategy and cost guardrails.
- `P4-FAIR-01` Implement weighted fairness scheduler and starvation prevention.
- `P4-ISO-01` Enforce runtime and data isolation boundaries per tenant/project.
- `P4-WS-01` Add workspace storage quota enforcement, retention policy, and billing hooks per remote workspace.
- `P4-WS-02` Separate local companion execution, project-agent execution, and remote app sandbox execution into measurable capability pools.
- `P4-INFRA-01` Replace MVP manual runner growth with managed autoscaling policy on AWS while preserving the Cloud.it-era job and workspace contracts.

### P4 Dependencies
- Depends on P2 deterministic orchestration and P3 stable pipeline contracts.

### P4 Risks
- Premature custom infra can outpace ops maturity.
- Fairness algorithms can conflict with latency SLOs if not tuned.

### P4 Exit Criteria
- Queue durability and replay are verified by chaos drills.
- Tenant-heavy load does not starve small tenants.
- GPU tasks route deterministically with measurable success and fallback behavior.
- Remote workspace usage and app-sandbox usage can be measured, limited, and billed without changing the control-plane API surface.

### P4 Not To Build Yet
- No custom queue engine from scratch.
- No bespoke container scheduler unless managed options are exhausted.

## 7. P5 Platform
### P5 Mission
Open the system for extensibility without sacrificing control-plane integrity.

### P5 Scope
- Plugin system with strict sandbox and permission model.
- External integrations with typed contracts and lifecycle controls.
- Marketplace model for discoverability and governance.
- Public API exposure with auth, quotas, and tenancy controls.

### P5 Backlog
- `P5-PLUG-01` Define plugin SDK contracts (actions, events, capabilities, scopes).
- `P5-PLUG-02` Add plugin runtime isolation and policy enforcement.
- `P5-INT-01` Build first-party integration adapters (issue trackers, docs, storage, CI).
- `P5-MARKET-01` Add signed plugin manifests and review workflow.
- `P5-API-01` Publish stable external API with versioning and deprecation policy.
- `P5-API-02` Add tenant quotas, rate limits, and token scope enforcement.

### P5 Dependencies
- Depends on P4 isolation and fairness enforcement.

### P5 Risks
- Weak extension contracts can create shadow execution paths.
- Marketplace without policy controls can introduce security regressions.

### P5 Exit Criteria
- Third-party extensions run inside enforced permission boundaries.
- External API is versioned and supports backward compatibility guarantees.
- Core execution path remains singular under plugin usage.

### P5 Not To Build Yet
- No unrestricted plugin execution.
- No direct DB/data-plane access for plugins.

## 8. Cross-Phase Dependencies (Critical Path)
- `P1 -> P2`: Operability and UX coherence must stabilize before control abstraction.
- `P2 -> P3`: Typed control contracts are required before scaling content pipelines.
- `P2 + P3 -> P4`: Queue/pool scaling only after stable orchestration and payload schemas.
- `P4 -> P5`: Plugin/API platform only after isolation, fairness, and policy enforcement.
- `Cloud.it MVP -> AWS`: infrastructure migration must follow, not precede, validated workspace and runtime contracts.

## 9. Architectural Decisions (Locked)
- `ADR-RUN-01` One execution path: all runnable work becomes runner jobs.
- `ADR-API-01` API-first state changes: persistence and policy changes flow through API contracts.
- `ADR-WORKER-01` Worker executes; API controls and records.
- `ADR-PROMPT-01` Prompts are governed assets in registry with version/status/scope.
- `ADR-PIPE-01` Pipelines are domain contracts, not generic graph construction.
- `ADR-MT-01` Tenant isolation is a first-class constraint, not a post-hoc optimization.
- `ADR-WS-01` Workspace persistence is separate from compute. Workspaces store project state; agents and app sandboxes execute against them.
- `ADR-WS-02` Browser and desktop share one control-plane model. Native/local capabilities extend that model but do not fork it.
- `ADR-INFRA-01` Cloud.it is the validation substrate; AWS is the scaling substrate. Product contracts must survive the migration intact.

## 10. Global "Do Not Build Yet" List
- Generic n8n-style pipeline builder.
- Parallel execution engines outside runner.
- Runtime mock paths in production flows.
- Hidden defaults for prompts/configs that bypass governance.
- Custom infra components when managed/battle-tested options are adequate.

## 11. Operating KPIs by Phase
- Reliability: runner completion rate, failed-without-diagnosis rate, mean recovery time.
- Determinism: same-input/same-plan ratio, idempotent replay success.
- Usability: time-to-first-successful-run (CLI/UI), operator interventions per day.
- Governance: prompt provenance coverage, policy violation count, tenant isolation incidents.
- Scale: queue lag percentiles, fairness index, worker utilization.

## 12. Immediate Next 30-Day Focus (P1 Execution Plan)
- Week 1: finalize workspace and project-agent contracts, remove/flag runtime mock paths, publish diagnostics baseline.
- Week 2: ship the first local wrapper / companion slice so local folder attach and local preview can be tested end-to-end from the real UI.
- Week 3: unify control UX status model, runtime/app-target visibility, and onboarding clarity around local/remote/hybrid modes.
- Week 4: harden coding workflow gates, prompt provenance visibility, and run an operability drill that includes local wrapper + remote workspace handoff.

## 13. Parallel Delivery Tracks (Immediate)
### Track A — Product Stability
- Fix onboarding, navigation, provider configuration, and workspace clarity issues until the core project flow is boringly reliable.
- Make project setup, agent setup, and workspace setup readable enough that internal users can work without intervention.

### Track B — Local Wrapper / Companion
- Prioritize the local wrapper early because it unlocks real local development validation before the remote workspace stack is fully mature.
- Scope the first slice narrowly: machine registration, folder attach, local command execution through worker, local preview open, and explicit status reporting.
- Defer nice-to-have shell polish until the wrapper proves the product loop works on a real developer machine.

### Track C — Remote Workspace and Sandbox
- Continue the remote workspace contract in parallel so the same project can later move between machines and remote sandboxes without changing the control-plane model.
- Keep remote app sandbox work behind the same app-target and runner-job contracts used by the local wrapper path.
