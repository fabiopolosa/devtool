# AGENTS.md

Follow the repository rules in [AGENT.md](/Users/andromeda/devtool/AGENT.md).

Additional clarification:
- After any frontend code change, restart the web dev server and verify it is serving the latest source before validating behavior or closing the task.

## PoloSaaS Alignment Rules

- Repos with `POLOSAAS_ALIGNMENT.md` must follow `/Users/andromeda/Desktop/app/polosaas-standards/specs/repo-alignment-protocol.md` before unrelated feature work.
- Stateless is mandatory and means multi-datacenter-ready by design: if the instance, VM, container, node or datacenter serving a user/job disappears, another healthy instance must be able to determine what happened and continue safely. See `/Users/andromeda/Desktop/app/polosaas-standards/specs/runtime-statelessness.md`.

## Staging Deploy Rules

- `.polosaas/deploy.json` is the app-local source of truth for Coolify staging readiness.
- Current staging state is `not_ready`; app agents must not trigger a deploy until a central thread declares app-specific Coolify resources or a webhook boundary.
- Staging PostgreSQL must use `platform-postgres-stg` on `state-stg-01`, database `polosaas_stg`, schema `devtools`; do not create `devtools-db-stg`.
- Root `Dockerfile.web`, `Dockerfile.api` and `Dockerfile.worker` are required before this app can be marked staging-ready.
- If runtime storage, worker health, artifact storage, shell embedding or experience context are incomplete, record the gap honestly in `.polosaas/deploy.json` and `docs/ROADMAP.md`.

## PoloSaaS Experience Standard

All new UI, app manifest, embedding and template-related work must conform to the canonical PoloSaaS experience contract:

- /Users/andromeda/Desktop/app/polosaas-standards/specs/experience-theming-template-system.md
- /Users/andromeda/Desktop/app/polosaas-standards/specs/product-experience.md
- /Users/andromeda/Desktop/app/polosaas-standards/schemas/experience-context.schema.json
- /Users/andromeda/Desktop/app/polosaas-standards/schemas/experience-skin.schema.json
- /Users/andromeda/Desktop/app/polosaas-standards/schemas/template-pack.schema.json

Required behavior:

- Support the effective Platform Core experience context: theme mode, density, direction, skin tokens and template packs.
- Consume shared CSS variables such as `--polo-bg`, `--polo-surface`, `--polo-text`, `--polo-primary`, `--polo-accent`, `--polo-radius-md` and `--polo-density` instead of hardcoded app-only palettes where practical.
- Apps embedded inside Shell must support `shell_embed=content`: hide app-global header/sidebar/login chrome, keep only the app work area/navigation that belongs to the vertical, and avoid nesting Shell or Owner Console inside itself.
- App manifests must accurately declare `experience.theming`, `experience.skins`, `experience.templates` and accessibility support.
- Tenant skins and custom branding are validated data, not arbitrary tenant CSS or JavaScript.
- Template-bearing domains must use versioned, tenant/edition scoped template packs and audit create/update/activate/archive operations.
- Generated business artifacts must record the template id and version used at render time.
- If the repo is not compliant yet, do not pretend it is: add or update the relevant roadmap/alignment block before closing the cycle.
