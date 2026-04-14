# @cp/orchestration-ruflo

Explicit orchestration adapter for the control-plane.

## What lives here
- Workflow definition schemas and loaders for `configs/workflows/*.json`.
- Deterministic task and task-run state machine helpers.
- Run event logging port and in-memory reference implementation.
- Budget enforcement and escalation hooks.
- A small orchestration service facade that keeps run transitions explicit.

## Dependency rule
This package only depends on shared contracts from `@cp/domain` plus `zod` for schema validation.

## Notes
The package is intentionally a control-plane abstraction, not a hidden workflow engine. Each transition is surfaced as a typed event or explicit state-machine call.
