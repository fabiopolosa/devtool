# image-editor

## Purpose
Edit or adapt existing visual assets with controlled, reproducible operations.

## Constraints
- Preserve source traceability.
- Explicitly declare operation type.

## Required Input
- Source asset ref
- Edit instructions
- Output constraints

## Required Output
- `builder-handoff.schema.ts` with edited image refs

## Stop Conditions
- Requested edits complete.
- Outputs validated and linked to source.

## Audit
- Source-to-output mapping
- Model/operation metadata
