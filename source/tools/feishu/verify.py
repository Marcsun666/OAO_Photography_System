"""Check the Base against schema.py, print backend env lines, write feishu-tables.json.

  export FEISHU_APP_SECRET=...  BITABLE_APP_TOKEN=...   (or WIKI_NODE_TOKEN=...)
  python3 verify.py [output.json]     # default output: ./feishu-tables.json
Exit code 1 if any expected table/field/option is missing.
"""
import json, os, sys
from fs import req, token, app_token
from schema import SPEC, ENV_VAR

TYPES = {1: "text", 2: "number", 3: "single_select", 15: "url", 17: "attachment"}
t = token()
A = app_token(t)
out_path = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].endswith(".json") else \
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "feishu-tables.json")

tabs = req("GET", f"/bitable/v1/apps/{A}/tables?page_size=100", None, t)["data"].get("items") or []
by_name = {x["name"]: x["table_id"] for x in tabs}
out = {"app_token": A, "env": {"BITABLE_APP_TOKEN": A, "BITABLE_UPLOAD_PARENT_NODE": A}, "tables": {}}
problems = []
for name, spec in SPEC.items():
    tid = by_name.get(name)
    if not tid:
        problems.append(f"missing table {name}"); continue
    fs_ = req("GET", f"/bitable/v1/apps/{A}/tables/{tid}/fields?page_size=100", None, t)["data"]["items"]
    rc = req("GET", f"/bitable/v1/apps/{A}/tables/{tid}/records?page_size=1", None, t)["data"].get("total")
    got = {f["field_name"]: f for f in fs_}
    for f in spec:
        g = got.get(f["field_name"])
        if not g:
            problems.append(f"{name}: missing field {f['field_name']}")
        elif g["type"] != f["type"]:
            problems.append(f"{name}.{f['field_name']}: type {g['type']} != expected {f['type']}")
        elif f["type"] == 3:
            have = {o["name"] for o in g["property"]["options"]}
            miss = [o["name"] for o in f["property"]["options"] if o["name"] not in have]
            if miss:
                problems.append(f"{name}.{f['field_name']}: missing options {miss}")
    out["env"][ENV_VAR[name]] = tid
    out["tables"][name] = {
        "env_var": ENV_VAR[name], "table_id": tid,
        "fields": [{"name": f["field_name"], "type": TYPES.get(f["type"], f["type"]), "primary": f.get("is_primary", False),
                    **({"options": [o["name"] for o in f["property"]["options"]]} if f["type"] == 3 else {})} for f in fs_]}
    print(f"{name:6} {tid}  fields={len(fs_)}  records={rc}")

with open(out_path, "w", encoding="utf-8") as fh:
    json.dump(out, fh, ensure_ascii=False, indent=2)
print("\n# backend env (non-secret ids):")
for k, v in out["env"].items():
    print(f"{k}={v}")
print("\nwrote", out_path)
if problems:
    print("\nPROBLEMS:"); [print(" -", p) for p in problems]; sys.exit(1)
print("schema OK")
