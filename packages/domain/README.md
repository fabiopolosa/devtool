# @cp/domain

Shared domain contracts for the AI development control-plane.

## What is locked

These contracts are the canonical source of truth for v1 and should not be reinterpreted by package-local implementations:

- Task and TaskRun lifecycle states
- RoadmapItem and Approval lifecycle states
- Core entities for projects, repositories, memory, providers, verification, and orchestration
- Structured handoff schemas for planner, builder, refactor, debugger, researcher, verifier, and retrieval flows
- Provider capability interfaces
- Memory, retrieval, and verification interfaces

## Usage

Import from the package root whenever possible:

```ts
import type { TaskSpec } from "@cp/domain";
import { taskSpecSchema } from "@cp/domain";
```

If you need a specific contract, prefer the exported root barrel rather than reaching into a file path.

## Rules

- Do not change entity semantics without an explicit architecture change.
- Do not add vendor-specific behavior here.
- Keep shared types stable and schema-driven.
- Use these contracts to validate data at package boundaries.
