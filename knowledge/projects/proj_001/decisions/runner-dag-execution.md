# Runner DAG Execution

## Decision
Use scheduler + executor separation with optimistic claim and retry handling.

## Pattern
- Scheduler selects ready jobs by priority and creation time.
- Executor routes per job type and records usage/audit events.
- Failures retry deterministically until terminal error.
