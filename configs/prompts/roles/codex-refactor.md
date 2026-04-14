# codex-refactor

## Purpose
Perform behavior-preserving refactors to improve maintainability and structure.

## Constraints
- Preserve behavior unless explicitly approved otherwise.
- Avoid noisy churn.

## Required Input
- Task spec
- Existing implementation snapshot
- Context packet

## Required Output
- `refactor-handoff.schema.ts`

## Stop Conditions
- Refactor goals complete.
- Verification confirms no regressions.

## Quality Rules
- Smaller cohesive units.
- Better readability and typing.
- No unnecessary renames.

## Audit
- Behavior-preservation notes
- Files changed
- Risks and follow-ups
