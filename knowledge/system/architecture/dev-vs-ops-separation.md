# Dev vs Ops Separation

## Principle
Development defines reusable contracts and deterministic artifacts.
Operations executes workflows and runtime controls.

## Decision
Keep planning/prompt construction separate from runtime execution.

## Implications
- API and UI expose explicit run state and approvals.
- DAG execution remains inspectable and auditable.
- Knowledge capture stores decisions, not noisy raw output.
