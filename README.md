# OAO Photography Club (OAO 摄影社) website — v4 (live)

**Start here → [OAO-Photography-v4-HANDOVER.md](OAO-Photography-v4-HANDOVER.md)** (architecture, secrets list, Feishu schema, deploy, migration playbooks; §17 = v4: calendar/报名/交付, hidden admin dashboard, AI budget, promote and rollback).

- Live (password-locked): https://oao-photography.pages.dev — running **v4** since 2026-10-09 (Cloudflare deployment `522b752c`, git `main` / tag `v4`).
- Rollback: v3 is Cloudflare deployment `0d0d5be2` (git tag `v3`); steps in §17.8 of the handover doc.
- The v3 handover is kept as [OAO-Photography-v3-HANDOVER.md](OAO-Photography-v3-HANDOVER.md); v2 is at tag/branch `v2`.
- `source/` — full source (frontend, Cloudflare Pages Functions, shared backend, tests, docs, Feishu tools)
- `deploy/` — the exact folder deployed to production (rebuild with `source/tools/build-deploy.sh`)
- No secrets are stored here. Deploys are done with wrangler from local files; pushing to GitHub does not deploy.
