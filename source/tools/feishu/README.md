# tools/feishu — create & verify the Feishu Base used by the backend

Stdlib-only Python 3. Secrets come from env vars only.

```bash
export FEISHU_APP_ID=cli_aa4dacab62f81bef
export FEISHU_APP_SECRET='<from Feishu developer console>'
export BITABLE_APP_TOKEN=ENpjbWJVzaNUtEsGlMecJLvFnef   # or WIKI_NODE_TOKEN=<token from /wiki/ URL>
python3 verify.py          # check schema, print env lines, write feishu-tables.json
python3 setup_tables.py    # create/repair tables (idempotent), then runs verify.py
python3 seed_events.py --dry-run   # v4: preview the 29 班赛/文化周 shooting tasks
python3 seed_events.py             # v4: create them in 拍摄任务 (idempotent via 种子键; re-runs create 0)
python3 set_cas_default.py --dry-run   # v4.1: 拍摄任务 rows with empty CAS-C / CAS-S
python3 set_cas_default.py            # v4.1: fill empty ones with C=1, S=1 (--all = every row)
```

- `schema.py`  expected tables/fields/options (must match `const F` in cloud-function/index.js)
- `fs.py`      request + tenant-token helpers
- `seed_events.py`  v4 seed of the 2026 autumn 班赛 / 中国文化周 schedule (needs TABLE_EVENTS in feishu-tables.json or env); 11/2–11/6 期中考试 is a calendar annotation only and is never seeded
- v4 tables: `拍摄任务` (TABLE_EVENTS), `报名与交付` (TABLE_APPLICATIONS), `AI用量` (TABLE_AI_USAGE)
- `feishu-tables.json`  last verified table ids (no secrets)
