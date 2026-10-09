"""v4.1: set CAS-C / CAS-S on existing 拍摄任务 rows (batch_update, 500 per call).

  export FEISHU_APP_SECRET=...  BITABLE_APP_TOKEN=...
  python3 set_cas_default.py            # only rows where CAS-C or CAS-S is empty -> 1 / 1
  python3 set_cas_default.py --all      # every row -> 1 / 1 (used once on 2026-10-09 for the 29 seeded tasks)
  python3 set_cas_default.py --dry-run  # show what would change
"""
import json, os, sys
from fs import req, token, app_token

t = token()
A = app_token(t)
tid = os.environ.get("TABLE_EVENTS")
if not tid:
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "feishu-tables.json")
    tid = json.load(open(here, encoding="utf-8"))["env"]["TABLE_EVENTS"]
C, S = "CAS-C", "CAS-S"

rows, pt = [], ""
while True:
    j = req("GET", f"/bitable/v1/apps/{A}/tables/{tid}/records?page_size=500" + (f"&page_token={pt}" if pt else ""), None, t)
    if j.get("code") != 0:
        print("list error:", j.get("code"), j.get("msg")); sys.exit(1)
    rows += j["data"].get("items") or []
    if not j["data"].get("has_more"):
        break
    pt = j["data"]["page_token"]

def empty(v):
    return v is None or str(v).strip() == ""

todo = [r for r in rows if "--all" in sys.argv or empty(r["fields"].get(C)) or empty(r["fields"].get(S))]
print(f"{len(rows)} tasks, {len(todo)} to set to C=1 S=1")
if "--dry-run" in sys.argv or not todo:
    sys.exit(0)
for i in range(0, len(todo), 500):
    batch = [{"record_id": r["record_id"], "fields": {C: 1, S: 1}} for r in todo[i:i + 500]]
    j = req("POST", f"/bitable/v1/apps/{A}/tables/{tid}/records/batch_update", {"records": batch}, t)
    if j.get("code") != 0:
        print("batch_update error:", j.get("code"), j.get("msg")); sys.exit(1)
    print("updated", len(j["data"].get("records") or []))
