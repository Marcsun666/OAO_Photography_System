# OAO Photography Club (OAO 摄影社) website — v2

**Start here → [OAO-Photography-v2-HANDOVER.md](OAO-Photography-v2-HANDOVER.md)** (architecture, secrets list, Feishu schema, deploy and migration playbooks).

- Live (password-locked): https://oao-photography.pages.dev
- `source/` — full source (frontend, Cloudflare Pages Functions, shared backend, tests, docs, Feishu tools)
- `deploy/` — the exact folder deployed to Cloudflare Pages for v2 (rebuild with `source/tools/build-deploy.sh`)
- No secrets are stored here. Deploys are done with wrangler from local files; pushing to GitHub does not deploy.
