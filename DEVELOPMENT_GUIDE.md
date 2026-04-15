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
All prompt composition MUST go through `packages/prompt-builder`; any deviation is blocked by ESLint custom guardrails.

## Testing e verifica

I test sono in Vitest. Le dry‑run di Ruflo sono in `packages/orchestration-ruflo/__tests__`. Test UI in `apps/web/src/__tests__`. Il pipeline verifica lint, typecheck, test e build; hook smoke/visual/performance sono opzionali tramite `verifier-hooks.json`.

## Autenticazione/RBAC

Controllata da `AUTH_ENABLED`. Quando abilitata, `/auth/*` gestisce login/logout/OIDC; `/admin/*` gestisce ruoli e audit trail.

## Providers

Gli adapter sono in `packages/providers/src/adapters`. Configura le chiavi in `.env` con prefissi `env://` o `secret://`.

- `POST/PATCH /providers/config` esegue validazione live del provider e salva:
  - `validationStatus` (`valid|invalid|unknown`)
  - `lastValidatedAt`
  - `validationError`
- Le API non restituiscono mai chiavi in chiaro: solo `apiKeyMasked`.
- Il discovery endpoint `/models` espone:
  - `source: "live" | "mock"`
  - `models: [...]`
  - alias retrocompatibili (`items`, `meta`).
- Con `MODELS_STRICT=1`, la UI Providers mostra un banner esplicito quando il source è `mock`.
- Rate limit per provider:
  - configurabile via provider config (`rpm/tpm` o `requestsPerMinute/tokensPerMinute`)
  - enforcement lato runner prima delle chiamate ai provider.

## Brainstorming Mode

- La modalità Brainstorming è disponibile in dashboard su `/brainstorming`.
- Il contratto piano è canonico su `BrainstormPlan.plan.*` (campi legacy top-level non supportati).
- Flusso operativo:
  - avvio sessione (`POST /brainstorm`)
  - generazione piano (`status: planned`)
  - approvazione (`POST /brainstorm/plan/:planId/approve`)
  - applicazione progetto (`POST /brainstorm/plan/:planId/create-project`, stato finale `applied`)
- Il workbench mostra session state, riepilogo, subprompt selezionati e azioni approve/apply.
- Composizione prompt unificata:
  - `@cp/prompt-builder` espone `buildPrompt({ role, subprompts, plan, context })`
  - il brainstorming usa prompt-builder per valorizzare `plan.composedPrompt`.

## Knowledge System (LLMWIKI)

- Knowledge tree su filesystem:
  - `knowledge/system/`
  - `knowledge/tenants/{tenantId}/`
  - `knowledge/projects/{projectId}/`
- Ogni file markdown deve catturare decisioni/pattern/insight riusabili (non log grezzi).
- API principali:
  - `GET /knowledge`
  - `GET /knowledge/:knowledgeNodeId`
  - `POST /knowledge`
  - `PATCH /knowledge/:knowledgeNodeId`
  - `DELETE /knowledge/:knowledgeNodeId`
  - `POST /knowledge/sync` (sync markdown -> DB)
  - `GET /knowledge/context/search` (contesto compatto per agenti/pipeline)
- Runner integration:
  - i job `generation` includono contesto knowledge in input quando disponibile;
  - persistenza insight opzionale con `payload.captureKnowledge=true`.

## Knowledge Configuration Layer

- Policy API:
  - `GET /knowledge/config`
  - `POST /knowledge/config`
  - `PATCH /knowledge/config`
- Modello policy:
  - `autoCapture`
  - `captureModes`
  - `requireApproval`
  - `maxNodes`
  - `relevanceThreshold`
  - `versioning`
  - `requireReview`
  - `scope` (`system|tenant|project`)
- Precedenza risoluzione:
  - `project -> tenant -> system -> default`.
- Integrazione runtime:
  - retrieval usa `maxNodes` + `relevanceThreshold` effettivi;
  - capture runner è bloccata se `requireApproval` o `requireReview` sono attivi.
- UI platform:
  - pagina `/settings/knowledge` (owner/admin) per gestire capture/retrieval/mutation settings.

## Routing Context Model

La UI usa un modello contestuale rigoroso:

- **global**: `/` e `/projects`
- **project**: tutte le viste operative sotto `/project/:projectId/*`
- **platform**: tutte le viste owner/platform sotto `/settings/*`

Le route legacy non scoped sono state rimosse. Le viste project/platform devono sempre usare route scoped.

Regola di sviluppo:

- **Do not introduce unscoped routes for project-level or platform-level views.**
- Ogni nuova vista deve appartenere a uno e un solo livello: `global`, `project`, `platform`.

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

## Prompt Registry (Governed Prompt Lifecycle)

- Prompt governance routes:
  - `GET /prompts`
  - `GET /prompts/:promptId`
  - `POST /prompts`
  - `PATCH /prompts/:promptId`
  - `POST /prompts/:promptId/activate`
  - `POST /prompts/:promptId/deprecate`
- Scope precedence is `project -> tenant -> system`.
- Brainstorming/planner prompt composition resolves active registry entries before file fallback.
- Prompt editing should happen through registry APIs/UI (`/settings/prompts`), not by mutating runtime prompt strings.

## Coding Workflow (HITL)

- Project route: `/project/:projectId/coding`
- API: `/coding-workflow` (create/list/detail + approve/reject/revise/finalize transitions).
- Intended flow:
  - request
  - plan
  - human approval/revision
  - task generation/execution
  - finalization + optional knowledge update

## Schemas + Context (Project Modules)

- Schemas graph route: `/project/:projectId/schemas`
  - includes Data Model, API Contracts, System Structure in node-based view.
- Context route: `/project/:projectId/context`
  - markdown notes for strategy/decisions/problems, project-scoped CRUD via `/context`.

## Documentazione

Consulta `docs/architecture.md` per l’architettura, `packages/db/migrations` per le migrazioni, `docs/adr` per le ADR e `docs/implementation-progress.md` per lo stato.
