# PoloSaaS Alignment Marker

This repo must be checked against the current PoloSaaS baseline before unrelated feature work continues.

Protocol:

- /Users/andromeda/Desktop/app/polosaas-standards/specs/repo-alignment-protocol.md

Current roadmap alignment block:

- /Users/andromeda/devtool/docs/ROADMAP.md#polosaas-alignment-block

Agent workflow:

1. Verify repository structure, platform contract, deploy shape, DB/Redis usage, data ownership, i18n/audit/usage readiness and secret hygiene.
2. If compliant, delete this file so the next run does not repeat the full structure audit.
3. If not compliant, create or update the repo roadmap with a `## PoloSaaS Alignment Block` section.
4. Link that roadmap in this file and keep this marker until the alignment block is completed.

Required current platform decisions:

- Shell/Core deploys first, then vertical apps roll into staging gradually.
- Prod and staging are separate environments.
- Current internal beta DB layout is one Postgres per environment, one schema per app, no cross-app DB reads.
- Current Redis layout is one Redis per environment with per-app prefixes; Redis is not source of truth.
- Files/assets use object storage references, not DB blobs.
- Apps are autonomous in product, governed by Core for identity, tenants, entitlements, audit and usage.

Non-negotiable stateless rule:

- Stateless is mandatory and means multi-datacenter-ready by design: if the instance, VM, container, node or datacenter serving a user/job disappears, another healthy instance must be able to determine what happened and continue safely. See `/Users/andromeda/Desktop/app/polosaas-standards/specs/runtime-statelessness.md`.
