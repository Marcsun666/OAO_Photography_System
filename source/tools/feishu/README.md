# tools/feishu — create & verify the Feishu Base used by the backend

Stdlib-only Python 3. Secrets come from env vars only.

```bash
export FEISHU_APP_ID=cli_aa4dacab62f81bef
export FEISHU_APP_SECRET='<from Feishu developer console>'
export BITABLE_APP_TOKEN=ENpjbWJVzaNUtEsGlMecJLvFnef   # or WIKI_NODE_TOKEN=<token from /wiki/ URL>
python3 verify.py          # check schema, print env lines, write feishu-tables.json
python3 setup_tables.py    # create/repair tables (idempotent), then runs verify.py
```

- `schema.py`  expected tables/fields/options (must match `const F` in cloud-function/index.js)
- `fs.py`      request + tenant-token helpers
- `feishu-tables.json`  last verified table ids (no secrets)
