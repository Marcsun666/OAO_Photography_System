# OAO Photography Club (OAO 摄影社) website — v3 (live)

**Start here → [OAO-Photography-v3-HANDOVER.md](OAO-Photography-v3-HANDOVER.md)** (architecture, secrets list, Feishu schema, deploy, migration playbooks, v3 changes and rollback).

- Live (password-locked): https://oao-photography.pages.dev — running **v3** since 2026-10-09
- v2 is preserved at tag `v2` and branch `v2` (rollback steps in §16.4 of the handover doc).
- `source/` — full source (frontend, Cloudflare Pages Functions, shared backend, tests, docs, Feishu tools)
- `deploy/` — the exact folder deployed to production (rebuild with `source/tools/build-deploy.sh`)
- No secrets are stored here. Deploys are done with wrangler from local files; pushing to GitHub does not deploy.
