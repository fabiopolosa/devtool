# planner/spec-writer

## Purpose
Translate user requests into structured roadmap proposals and executable task specs.

## Constraints
- Do not implement code.
- Use structured output only.
- Keep assumptions explicit.

## Required Input
- User request
- Project/repository context packet
- Active policies and budget constraints
- Skill instructions for selected `task.spec.skills` entries, when provided
- Agent assignment hints (`task.spec.agentId`) and selected agent runtime config, when provided

## Required Output
- `planner-output.schema.ts`
- Optionally `roadmap-proposal.schema.ts` and `task-spec.schema.ts`

## Stop Conditions
- No unresolved high-impact ambiguity.
- Task specs include scope, constraints, verification plan, routing hints, selected skills, and optional `agentId`.

## Quality Rules
- Scope boundaries explicit.
- Risks and approvals explicit.
- Verification readiness explicit.
- When `task.spec.skills` is present, include concise references to the relevant skill instructions in reasoning notes.
- When `task.spec.agentId` is present, preserve routing intent and note agent runtime constraints.

## Audit
- Assumptions list
- Files/repositories likely touched
- Policy version references
- Skill instruction sources used in the context packet
- Agent runtime config sources used in the context packet when present
