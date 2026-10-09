# OAO Photography Club (OAO 摄影社) website — v4.1 (live)

**Start here → [OAO-Photography-v4-HANDOVER.md](OAO-Photography-v4-HANDOVER.md)** (architecture, secrets list, Feishu schema, deploy, migration playbooks; §17 = v4: calendar/报名/交付, hidden admin dashboard, AI budget; §18 = v4.1 (live): CAS 时间, 邀请拍摄, promotion record and rollback).

- Live (password-locked): https://oao-photography.pages.dev — running **v4.1** since 2026-10-09 (Cloudflare deployment `caccbb28-9462-42eb-8339-7f0e1f58dee5`, git `main` / tag `v4.1`): CAS 时间 on tasks, 邀请拍摄 copy; see §18 of the handover doc. Preview: https://v41.oao-photography.pages.dev.
- Rollback: v4 is Cloudflare deployment `522b752c-166e-4583-a01b-c6d5455c3f8e` (git tag `v4` / `v4.0-backup`); steps in §18.1 and §18.6. Older: v3 is deployment `0d0d5be2` (git tag `v3`, §17.8).
- The v3 handover is kept as [OAO-Photography-v3-HANDOVER.md](OAO-Photography-v3-HANDOVER.md); v2 is at tag/branch `v2`.
- `source/` — full source (frontend, Cloudflare Pages Functions, shared backend, tests, docs, Feishu tools)
- `deploy/` — the exact folder deployed to production (rebuild with `source/tools/build-deploy.sh`)
- No secrets are stored here. Deploys are done with wrangler from local files; pushing to GitHub does not deploy.
