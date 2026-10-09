"""Create / repair the 8 OAO tables in a Feishu Base. Idempotent: safe to re-run.

  export FEISHU_APP_ID=cli_xxx FEISHU_APP_SECRET=...      # never commit these
  export BITABLE_APP_TOKEN=xxxx      # or: export WIKI_NODE_TOKEN=xxxx (Base inside a wiki)
  python3 setup_tables.py

- A brand-new Base has one default table with a single primary column and a few EMPTY rows.
  If that is the only table and it holds no data, it is reused as 活动记录 (empty rows deleted,
  table + primary field renamed). Tables with real data are never modified destructively.
- Missing tables are created; missing fields are added; existing fields are left alone.
- Finally prints the env lines for the backend and writes feishu-tables.json (via verify.py).
"""
import json, sys
from fs import req, token, app_token
from schema import SPEC

t = token()
A = app_token(t)


def ok(j, what):
    if j.get("code") != 0:
        print("ERR", what, j.get("code"), j.get("msg")); sys.exit(1)
    return j


def tables():
    return ok(req("GET", f"/bitable/v1/apps/{A}/tables?page_size=100", None, t), "list tables")["data"].get("items") or []


tabs = tables()
names = {x["name"]: x["table_id"] for x in tabs}

# Reuse the default table of a fresh Base as 活动记录
if len(tabs) == 1 and tabs[0]["name"] not in SPEC:
    d = tabs[0]["table_id"]
    recs = ok(req("GET", f"/bitable/v1/apps/{A}/tables/{d}/records?page_size=100", None, t), "records")["data"].get("items") or []
    fields = ok(req("GET", f"/bitable/v1/apps/{A}/tables/{d}/fields?page_size=100", None, t), "fields")["data"]["items"]
    if all(not r.get("fields") for r in recs) and len(fields) <= 1:
        if recs:
            ok(req("POST", f"/bitable/v1/apps/{A}/tables/{d}/records/batch_delete",
                   {"records": [r["record_id"] for r in recs]}, t), "delete empty rows")
        ok(req("PATCH", f"/bitable/v1/apps/{A}/tables/{d}", {"name": "活动记录"}, t), "rename table")
        names = {"活动记录": d}
        print("reused default table as 活动记录:", d)
    else:
        print("default table has data/columns; leaving it and creating new tables")

for name, fields in SPEC.items():
    if name not in names:
        j = ok(req("POST", f"/bitable/v1/apps/{A}/tables",
                   {"table": {"name": name, "default_view_name": "表格", "fields": fields}}, t), "create " + name)
        names[name] = j["data"]["table_id"]
        print("created", name, names[name])
    tid = names[name]
    cur = ok(req("GET", f"/bitable/v1/apps/{A}/tables/{tid}/fields?page_size=100", None, t), "fields")["data"]["items"]
    prim = [f for f in cur if f.get("is_primary")][0]
    if prim["field_name"] != fields[0]["field_name"]:
        ok(req("PUT", f"/bitable/v1/apps/{A}/tables/{tid}/fields/{prim['field_id']}", fields[0], t), "rename primary")
        print(name, "primary field renamed", prim["field_name"], "->", fields[0]["field_name"])
    have = {f["field_name"] for f in cur} | {fields[0]["field_name"]}
    for f in fields[1:]:
        if f["field_name"] not in have:
            ok(req("POST", f"/bitable/v1/apps/{A}/tables/{tid}/fields", f, t), "add field " + f["field_name"])
            print(name, "added field", f["field_name"])
    # v4.1 polish: add missing options to existing single-select fields (existing options and their ids are kept)
    by_name = {f["field_name"]: f for f in cur}
    for f in fields:
        g = by_name.get(f["field_name"])
        if f["type"] != 3 or not g or g["type"] != 3:
            continue
        opts = (g.get("property") or {}).get("options") or []
        names_have = {o["name"] for o in opts}
        missing = [o for o in f["property"]["options"] if o["name"] not in names_have]
        if missing:
            body = {"field_name": g["field_name"], "type": 3, "property": {"options": opts + missing}}
            ok(req("PUT", f"/bitable/v1/apps/{A}/tables/{tid}/fields/{g['field_id']}", body, t), "add options " + g["field_name"])
            print(name, g["field_name"], "added options", [o["name"] for o in missing])

import verify  # noqa: E402  (prints the schema check + env lines, writes feishu-tables.json)
