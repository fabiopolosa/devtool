# Devtools

Devtools is the PoloSaaS AI development control plane. It coordinates projects, agents, local/remote workers, provider configuration, runner jobs, knowledge/context, audit and usage surfaces.

## Local Development

Install dependencies with `pnpm install`, configure `.env` from `.env.example`, then run the relevant services:

```bash
pnpm --filter @cp/api dev
pnpm --filter @cp/web dev
pnpm --filter @cp/worker dev
```

Useful checks:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## PoloSaaS Staging Status

Staging deployment is not ready yet. The current deploy contract is recorded in `.polosaas/deploy.json` with `deploymentStatus: "not_ready"` and `stg.enabled: false`.

Current truth:

- API package exists and exposes `/health`, `/api/v1/health`, `/api/v1/app/manifest`, `/api/v1/session/context`, `/api/v1/audit/events` and `/api/v1/usage`.
- Web, API and worker packages exist, but root `Dockerfile.web`, `Dockerfile.api` and `Dockerfile.worker` are not present yet.
- Staging PostgreSQL must use shared Coolify resource `platform-postgres-stg` on `state-stg-01`, database `polosaas_stg`, app-owned schema `devtools`.
- Runtime defaults are Postgres-backed for API state, but staging statelessness is not fully proven because artifact storage defaults to local development storage and worker health/recovery contracts need container smoke checks.
- Experience context, `shell_embed=content`, skins and template-pack support are roadmap items, not completed staging contracts.

App agents must not create, rename, move, delete or deploy Coolify resources for this app unless an app-specific staging webhook/resource boundary has already been declared and authorized by the central deploy thread.

## Required Environment

The minimum local/staging API runtime needs:

- `NODE_ENV`
- `API_PORT`
- `WEB_ORIGIN`
- `DATABASE_URL`
- `REDIS_URL`
- `SECRETS_MASTER_KEY`
- `RUNNER_INTERNAL_TOKEN`

The web runtime needs:

- `VITE_API_BASE_URL`
- `VITE_AUTH_ENABLED`
- `VITE_AUTH_OIDC_ENABLED`

Provider keys and OIDC values are optional until those integrations are enabled. Never commit real secrets.
