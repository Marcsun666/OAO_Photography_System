"""v4.1 polish: mark old 邀请拍摄 requests in 活动记录 so they leave the public timeline.

Requests submitted before v4.1 polish were stored with 状态=待选片 and no 来源. They are recognised the
same way the backend does it (a line starting with 「联系人：」 or 「CAS：」 in 描述) and updated to
来源=邀请拍摄, 状态=待处理申请. Rows that already have a 来源 are left alone. Idempotent.

  export FEISHU_APP_SECRET=...  BITABLE_APP_TOKEN=...
  python3 migrate_requests.py --dry-run
  python3 migrate_requests.py
"""
import json, os, re, sys, time
from fs import req, token, app_token

DRY = "--dry-run" in sys.argv
t = token()
A = app_token(t)
here = os.path.dirname(os.path.abspath(__file__))
tid = os.environ.get("TABLE_ACTIVITIES") or json.load(open(os.path.join(here, "feishu-tables.json")))["env"]["TABLE_ACTIVITIES"]


def text(v):
    if v is None: return ""
    if isinstance(v, str): return v
    if isinstance(v, list): return "".join((x.get("text") or x.get("name") or "") if isinstance(x, dict) else str(x) for x in v)
    if isinstance(v, dict): return v.get("text") or v.get("name") or ""
    return str(v)


rows, pt = [], None
while True:
    j = req("GET", f"/bitable/v1/apps/{A}/tables/{tid}/records?page_size=500" + (f"&page_token={pt}" if pt else ""), None, t)
    if j.get("code") != 0: sys.exit(f"list error {j.get('code')} {j.get('msg')}")
    rows += j["data"].get("items") or []
    if not j["data"].get("has_more"): break
    pt = j["data"]["page_token"]; time.sleep(0.2)

todo = []
for r in rows:
    f = r.get("fields") or {}
    if text(f.get("来源")):
        continue
    if re.search(r"(^|\n)\s*(联系人：|CAS：)", text(f.get("描述"))):
        todo.append(r["record_id"])
print(f"活动记录 rows={len(rows)}  old requests to mark={len(todo)}")
if DRY or not todo:
    sys.exit(0)
for i in range(0, len(todo), 500):
    batch = [{"record_id": rid, "fields": {"来源": "邀请拍摄", "状态": "待处理申请"}} for rid in todo[i:i + 500]]
    j = req("POST", f"/bitable/v1/apps/{A}/tables/{tid}/records/batch_update", {"records": batch}, t)
    if j.get("code") != 0: sys.exit(f"update error {j.get('code')} {j.get('msg')}")
print("marked", len(todo))
