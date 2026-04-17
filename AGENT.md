# AGENT.md

## Purpose
This file defines mandatory engineering guardrails for all agents working in this repository.

If a requested change conflicts with these rules, stop and propose a compliant alternative.

## 1) Core Principles
- One execution path: all executable work must flow through runner jobs.
- No duplicate logic: extend existing modules before creating new ones.
- No hidden state: system behavior must be derivable from stored state and explicit inputs.
- No runtime mocks: production/runtime flows must not rely on mock data paths.
- API-first: business state mutations happen through explicit API/service contracts.

## 2) Architecture Rules
- CLI is a client only. It can request execution, inspect status, and bridge to worker control, but it is not a control plane.
- Worker is executor only. It executes claimed work, reports telemetry, and does not become a policy authority.
- Cloud/API is control plane. It validates intent, applies policy, persists state, and routes jobs.
- No direct database access outside approved API/data services and execution store contracts.
- No new execution paths. Do not add alternate run loops that bypass runner job lifecycle.

## 3) Development Rules
- Extend existing systems before introducing new modules.
- Do not rewrite core modules unless explicitly requested and scoped.
- Do not introduce parallel logic that duplicates current behavior under a second path.
- Do not add abstractions without a concrete, current need tied to a shipped use case.
- Prefer additive, reversible changes with clear migration and rollback points.
- Keep contracts typed and versioned when crossing package/app boundaries.

## 4) Pipelines Rule
- Pipelines are domain-specific operational flows.
- Pipelines are not generic workflow builders.
- Do not implement n8n-style arbitrary graph builders.
- New pipeline work must define explicit domain input/output schemas.

## 5) Prompt Rules
- All prompts must be resolved through the prompt registry lifecycle.
- No hardcoded prompts in runtime execution paths.
- No hidden prompt defaults that silently bypass registry governance.
- Prompt source (`registry`, fallback, version, scope) must be observable in logs/metadata.

## 6) Knowledge Rules
- No uncontrolled capture.
- Do not dump raw outputs into knowledge stores.
- Persist only meaningful, compact, reviewable insights.
- Knowledge writes must respect tenant/project scope and policy gates.

## 7) UI Rules
- No duplicated navigation for the same capability.
- No multiple entry points that trigger the same operational action with divergent behavior.
- Follow the interaction model: `launcher -> operations -> workspace`.
- Keep state/status semantics consistent across UI and CLI.

## 8) Scaling Rules
- Do not build custom infrastructure when battle-tested solutions are sufficient.
- Prefer proven queue, scheduling, and observability components.
- Isolation is mandatory per project/runtime/tenant where applicable.
- Fairness and priority policies must be explicit and testable.

## 9) Local vs Remote Execution Rules
- Local execution is performed via worker only.
- Cloud does not directly execute local actions.
- CLI is the bridge between operator intent and worker/runtime operations.
- Remote and local paths must converge on the same runner job model and audit trail.

## 10) Explicit Anti-Patterns (Forbidden)
- Adding mock execution/data paths in runtime.
- Duplicating existing features under new names/modules.
- Creating parallel execution systems outside runner.
- Building generic pipeline builders.
- Overengineering abstractions before operational need is proven.
- Introducing hidden defaults that alter behavior without explicit configuration.

## Agent Delivery Checklist (Every Change)
- Confirm the change uses the existing runner/API/worker boundaries.
- Confirm no duplicate code path was introduced.
- Confirm no runtime mock path was added.
- Confirm prompts and knowledge handling follow governance rules.
- Confirm UI/CLI behavior remains consistent for the same operation.
