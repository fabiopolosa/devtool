# @cp/autoresearch

Optimization-only subsystem for experiment management.

What this package owns:
- Experiment definitions and version references.
- Metrics collection abstractions.
- Variant runner abstractions.
- Deterministic winner selection and rollback suggestion.
- In-memory scaffolding for local-first development.

What this package does not own:
- API routes.
- UI concerns.
- Orchestration execution.
- Provider SDK integrations.

Primary contract boundary:
- Shared experiment entities and schemas live in `@cp/domain`.
