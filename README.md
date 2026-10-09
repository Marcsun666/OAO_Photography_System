# OAO Photography Club (OAO 摄影社) website — v4 (branch `v4`, PREVIEW)

**Start here → [OAO-Photography-v4-HANDOVER.md](OAO-Photography-v4-HANDOVER.md)** (architecture, secrets list, Feishu schema, deploy, migration playbooks; §17 = v4: calendar/报名/交付, hidden admin dashboard, AI budget, promote and rollback).

- This branch is the **v4 preview**: https://v4.oao-photography.pages.dev (password-locked). Production is still **v3** (`main`, tag `v3`, Cloudflare deployment `0d0d5be2`) until the owner approves.
- The v3 handover is kept as [OAO-Photography-v3-HANDOVER.md](OAO-Photography-v3-HANDOVER.md); v2 is at tag/branch `v2`.
- `source/` — full source (frontend, Cloudflare Pages Functions, shared backend, tests, docs, Feishu tools)
- `deploy/` — the exact folder deployed to the v4 preview (rebuild with `source/tools/build-deploy.sh`)
- No secrets are stored here. Deploys are done with wrangler from local files; pushing to GitHub does not deploy.
