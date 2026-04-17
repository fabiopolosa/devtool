# DevTools Technical Roadmap (Detailed)

## 0. Current Stage and Intent
- Stage: alpha internal operability.
- Primary objective: move from feature-rich alpha to predictable platform behavior under multi-agent load.
- Non-goal for this roadmap: maximizing feature count before control, reliability, and operating contracts are stable.

## 1. Phase Map (P0 to P5)
| Phase | Status | Primary Outcome | Exit Gate |
|---|---|---|---|
| P0 | Done | Foundation shipped for execution + research + prompt governance baseline | Core flows operational in internal env |
| P1 | Current | Operability hardening and usability coherence | Operators can run daily workflows without manual recovery |
| P2 | Planned | Deterministic control system from intent to orchestrated jobs | Chat-to-job control is explicit, auditable, and reversible |
| P3 | Planned | Content system productization | Research/content/multimodal pipelines are production-shaped |
| P4 | Planned | Scalable execution substrate | Tenant-safe queue and worker scaling with fairness |
| P5 | Planned | Platform extension model | Plugins/integrations/API can extend system without forking core |

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

### P1 Architectural Decisions
- Keep runner as canonical execution engine, not per-feature executors.
- Keep API as system-of-record and policy gate.
- Keep worker as execution runtime and telemetry emitter.
- Keep prompt resolution explicit and traceable with source metadata.

### P1 Risks
- Boundary leakage between API and execution runtime can reintroduce hidden execution paths.
- Mock/fallback behavior in runtime can mask production defects.
- UI can drift into duplicate entry points if navigation is not constrained.

### P1 Exit Criteria
- 95% of internal tasks complete without manual DB edits or service restarts.
- 100% execution actions carry routing metadata and actor attribution.
- CLI and web show the same job state and failure reasons for sampled flows.
- Prompt source (`registry` vs fallback) is visible in logs for all generation paths.

### P1 Not To Build Yet
- No plugin marketplace work.
- No custom queue infrastructure beyond current minimal needs.
- No new orchestration engines.
- No broad "universal builder" UI.

## 4. P2 Control System
### P2 Mission
Turn chat and operator intent into deterministic, typed, auditable job plans.

### P2 Scope
- Chat control layer with explicit command envelopes.
- Intent-to-job mapping with strict schema validation.
- Agent orchestration policies (selection, budget, retries, approval boundaries).
- Pipeline abstraction as typed domain contracts, not free-form graphs.

### P2 Backlog
- `P2-CHAT-01` Define canonical chat command contract with validation and versioning.
- `P2-CHAT-02` Add control-layer intent classifier with confidence and fallback handling.
- `P2-MAP-01` Build intent-to-job planner producing DAG-ready jobs with dependencies.
- `P2-MAP-02` Add dry-run mode that shows produced jobs without execution.
- `P2-ORCH-01` Add orchestration policy module for capability match, budget, and approval gates.
- `P2-ORCH-02` Add deterministic idempotency keys for repeated control requests.
- `P2-PIPE-01` Normalize pipeline contracts (research/content/visual/multimodal) into stable I/O schemas.

### P2 Dependencies
- Depends on P1 status semantics, diagnostics, and boundary hardening.

### P2 Risks
- Over-general control model can become a second orchestration path.
- Insufficient schema rigor can make intent mapping non-deterministic.

### P2 Exit Criteria
- Same intent produces same job plan under same inputs.
- All control actions are replayable from audit logs.
- Pipeline invocation path is singular through runner contracts.

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

### P4 Backlog
- `P4-QUEUE-01` Move job dispatch to durable queue backend with retry/dead-letter policies.
- `P4-QUEUE-02` Add queue observability (lag, retries, poison jobs, per-tenant throughput).
- `P4-WORKER-01` Implement worker pools by capability class and execution mode.
- `P4-WORKER-02` Add admission control and concurrency limits per tenant.
- `P4-GPU-01` Add Flux routing policy for image/multimodal workloads.
- `P4-GPU-02` Add GPU fallback strategy and cost guardrails.
- `P4-FAIR-01` Implement weighted fairness scheduler and starvation prevention.
- `P4-ISO-01` Enforce runtime and data isolation boundaries per tenant/project.

### P4 Dependencies
- Depends on P2 deterministic orchestration and P3 stable pipeline contracts.

### P4 Risks
- Premature custom infra can outpace ops maturity.
- Fairness algorithms can conflict with latency SLOs if not tuned.

### P4 Exit Criteria
- Queue durability and replay are verified by chaos drills.
- Tenant-heavy load does not starve small tenants.
- GPU tasks route deterministically with measurable success and fallback behavior.

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

## 9. Architectural Decisions (Locked)
- `ADR-RUN-01` One execution path: all runnable work becomes runner jobs.
- `ADR-API-01` API-first state changes: persistence and policy changes flow through API contracts.
- `ADR-WORKER-01` Worker executes; API controls and records.
- `ADR-PROMPT-01` Prompts are governed assets in registry with version/status/scope.
- `ADR-PIPE-01` Pipelines are domain contracts, not generic graph construction.
- `ADR-MT-01` Tenant isolation is a first-class constraint, not a post-hoc optimization.

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
- Week 1: finalize guardrails, remove/flag runtime mock paths, publish diagnostics baseline.
- Week 2: unify control UX status model and failure taxonomy.
- Week 3: harden coding workflow gates and prompt provenance visibility.
- Week 4: close CLI/API parity gaps and run operability drill with incident checklist.
