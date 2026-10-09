# OAO Photography Club (OAO 摄影社) website — v3 (style refinement, preview)

**Start here → [OAO-Photography-v2-HANDOVER.md](OAO-Photography-v2-HANDOVER.md)** (architecture, secrets list, Feishu schema, deploy and migration playbooks).

- Live (password-locked): https://oao-photography.pages.dev (production is still **v2**)
- v3 preview (same password): https://v3.oao-photography.pages.dev. Promote/rollback steps are in §16 of the handover doc.
- v2 is preserved at tag `v2` and branch `v2`.
- `source/` — full source (frontend, Cloudflare Pages Functions, shared backend, tests, docs, Feishu tools)
- `deploy/` — the exact folder deployed to the Cloudflare Pages v3 preview (rebuild with `source/tools/build-deploy.sh`)
- No secrets are stored here. Deploys are done with wrangler from local files; pushing to GitHub does not deploy.
