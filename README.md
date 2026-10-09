# OAO Photography Club (OAO 摄影社) website — v4.1 polish (live)

**What changed:** see [CHANGELOG.md](CHANGELOG.md). **Tutorials (社员 / 管理员):** [docs/tutorials/](docs/tutorials/).

**Start here → [OAO-Photography-v4-HANDOVER.md](OAO-Photography-v4-HANDOVER.md)** (architecture, secrets list, Feishu schema, deploy, migration playbooks; §17 = v4: calendar/报名/交付, hidden admin dashboard, AI budget; §18 = v4.1 (live): CAS 时间, 邀请拍摄, promotion record and rollback; §18.7 = v4.1 polish).

- Live (password-locked): https://oao-photography.pages.dev — running **v4.1 polish** since 2026-10-09 (Cloudflare deployment `7d104a88-1116-4c69-a858-375ded02409d`, git `main` / tag `v4.1`); see §18.7 of the handover doc. Preview: https://v41.oao-photography.pages.dev.
- Rollback: the pre-polish v4.1 is Cloudflare deployment `caccbb28-9462-42eb-8339-7f0e1f58dee5` (git tag `v4.1-backup`; §18.7). Before that, v4 is deployment `522b752c-166e-4583-a01b-c6d5455c3f8e` (git tag `v4` / `v4.0-backup`); steps in §18.1 and §18.6. Older: v3 is deployment `0d0d5be2` (git tag `v3`, §17.8).
- The v3 handover is kept as [OAO-Photography-v3-HANDOVER.md](OAO-Photography-v3-HANDOVER.md); v2 is at tag/branch `v2`.
- `source/` — full source (frontend, Cloudflare Pages Functions, shared backend, tests, docs, Feishu tools)
- `deploy/` — the exact folder deployed to production (rebuild with `source/tools/build-deploy.sh`)
- No secrets are stored here. Deploys are done with wrangler from local files; pushing to GitHub does not deploy.
