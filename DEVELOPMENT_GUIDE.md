# Developer Guide: AI Development Control‑Plane

This guide summarizes how to work on the **devtool** control‑plane so that new contributors can get started quickly and maintain consistency.

## Overview

The control‑plane is a multi‑agent orchestration platform for software projects. It coordinates specialized agents (planner, coder, refactorer, debugger, researcher, verifier) through Ruflo, stores shared memory and retrieval context, integrates multiple AI providers via a capability registry, runs verification pipelines, and presents everything in a web‑based dashboard.

Key features:

- **Modular monorepo** (`apps/api`, `apps/web`, `apps/worker`, `packages/*`)
- **Fastify API** with REST endpoints for projects, tasks, runs, memory, providers, auth, etc.
- **React/TypeScript dashboard** with pages for projects, roadmap, runs, memory, providers, experiments, approvals and chat.
- **Provider abstraction layer** supporting OpenAI, Anthropic, Gemini, OpenRouter, Kie.ai for reasoning, coding, embeddings, image generation/editing and vision.
- **Shared memory & retrieval**: canonical memory store, vector index (pgvector), context packet builder per agent, and AutoResearch optimisation.
- **Ruflo orchestration**: workflow definitions, run state machine, escalation and budget rules.
- **Authentication/RBAC**: optional OIDC support, session management, scoped roles, audit logging and admin UI.
- **Platform ops modules**: Secrets, Database schema docs, Stack/Machines, Local Repos file manager, and Versioning snapshots/diffs.
- **Modern UI shell**: dark Matrix-style default theme with optional light mode toggle (`/settings`) and live agent mesh panel on dashboard.

## Setup

Install Node 18+, pnpm, PostgreSQL e Redis. Clona la repo, installa le dipendenze con `pnpm install`, configura `.env` partendo da `.env.example`, esegui `pnpm db:migrate` e avvia API e web con `pnpm --filter apps/api dev` e `pnpm --filter apps/web dev`.

## Workflow

Lavora su branch dedicati, esegui `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` prima di fare commit. Usa commit convenzionali (`feat:`, `fix:`, ecc.).

## Testing e verifica

I test sono in Vitest. Le dry‑run di Ruflo sono in `packages/orchestration-ruflo/__tests__`. Test UI in `apps/web/src/__tests__`. Il pipeline verifica lint, typecheck, test e build; hook smoke/visual/performance sono opzionali tramite `verifier-hooks.json`.

## Autenticazione/RBAC

Controllata da `AUTH_ENABLED`. Quando abilitata, `/auth/*` gestisce login/logout/OIDC; `/admin/*` gestisce ruoli e audit trail.

## Providers

Gli adapter sono in `packages/providers/src/adapters`. Configura le chiavi in `.env` con prefissi `env://` o `secret://`.

## Brainstorming Mode

- La modalità Brainstorming è disponibile in dashboard su `/brainstorming`.
- Il contratto piano è canonico su `BrainstormPlan.plan.*` (non usare campi legacy top-level).
- Flusso operativo:
  - avvio sessione (`POST /brainstorm`)
  - generazione piano (`status: planned`)
  - approvazione (`POST /brainstorm/plan/:planId/approve`)
  - applicazione progetto (`POST /brainstorm/plan/:planId/create-project`, stato finale `applied`)
- Il workbench mostra session state, riepilogo, subprompt selezionati e azioni approve/apply.

## Subprompt Library

- I sottoprompt sono file-driven in `configs/subprompts/`.
- API disponibili:
  - `GET /subprompts`
  - `GET /subprompts/:subpromptId`
  - `POST /subprompts/compose`
  - `POST /subprompts/sync`
- Il brainstorming salva sempre:
  - `plan.selectedSubprompts`
  - `plan.composedPrompt`

## MCP Integration (Optional)

- Integrazione opzionale tramite `@cp/mcp`, disattivata di default.
- Se non configurata, UI/API rispondono in modo tollerante con stato “MCP non configurato”.
- Endpoint principali:
  - `GET /mcp/status`
  - `GET /mcp/connections`
  - `POST /mcp/connections`
  - `POST /mcp/connections/:connectionId/healthcheck`
  - `GET /mcp/runs`
  - `POST /mcp/delegate`
- Configurazioni endpoint/token via secrets manager.

## Provider Auto-Discovery

- Discovery provider esteso con trigger manuale da pagina Providers.
- Endpoint:
  - `POST /providers/discovery/update`
  - `GET /providers/discovery/logs`
- In assenza rete o configurazione incompleta, il sistema non blocca startup/esecuzione e mantiene il set provider baseline.

## Operations UI Notes

- **Secrets** and **Stack/Machines** are privileged sections: they are visible only when auth is enabled and the current user is `admin`.
- **Local Repos** offers a read-only file inspector, git history tab, and snapshot diff tab.
- **Versioning** centralizes snapshot creation/comparison and feeds task-level diff visibility.
- Theme is controlled in **Settings** and persisted client-side.

## Documentazione

Consulta `docs/architecture.md` per l’architettura, `packages/db/migrations` per le migrazioni, `docs/adr` per le ADR e `docs/implementation-progress.md` per lo stato.
