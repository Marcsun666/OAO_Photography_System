"""Seed the 29 班赛 / 文化周 events of autumn 2026 into 拍摄任务. Idempotent: safe to re-run.

  export FEISHU_APP_SECRET=...  BITABLE_APP_TOKEN=...   (never commit secrets)
  python3 seed_events.py            # creates only the events whose 种子键 is not in the table yet
  python3 seed_events.py --dry-run  # print what would be created

Every seeded row carries 种子键 = "2026-MM-DD|<名称>", so a re-run finds it and skips it.
Edits made later in Feishu or the admin dashboard (time, place, status…) are never overwritten.
The mid-term exam week (11/2–11/6) is only an annotation in the calendar UI; it is NOT an event.
"""
import sys
from fs import req, token, app_token

YEAR = 2026
NOON = "11:50-12:20"
# (month, day, 类别, 名称, 时间)
EVENTS = [
    (10, 12, "篮球", "篮球 12年级ABCD小组赛", NOON),
    (10, 13, "文化周", "中国文化周", NOON),
    (10, 14, "文化周", "中国文化周", NOON),
    (10, 15, "文化周", "中国文化周", NOON),
    (10, 16, "文化周", "中国文化周", NOON),
    (10, 19, "篮球", "篮球 10年级ABCD小组赛", NOON),
    (10, 19, "匹克球", "匹克球 12年级第一天", NOON),
    (10, 20, "篮球", "篮球 12年级AB胜者赛", NOON),
    (10, 20, "篮球", "篮球 12年级CD胜者赛", NOON),
    (10, 20, "篮球", "篮球 10年级AB胜者赛", NOON),
    (10, 20, "篮球", "篮球 10年级CD胜者赛", NOON),
    (10, 20, "匹克球", "匹克球 11年级第一天", NOON),
    (10, 21, "篮球", "篮球 11年级决赛", NOON),
    (10, 21, "篮球", "篮球 12年级铜牌", NOON),
    (10, 21, "足球", "足球资格赛", "放学"),
    (10, 21, "匹克球", "匹克球 10年级第一天", NOON),
    (10, 22, "篮球", "篮球 12年级决赛", NOON),
    (10, 22, "篮球", "篮球 10年级铜牌", NOON),
    (10, 22, "匹克球", "匹克球 11年级第二天", NOON),
    (10, 23, "篮球", "篮球 10年级决赛", NOON),
    (10, 23, "篮球", "篮球 11年级铜牌", NOON),
    (10, 23, "匹克球", "匹克球 12年级第二天", NOON),
    (10, 26, "匹克球", "匹克球 10年级第二天", NOON),
    (10, 27, "乒乓球", "乒乓球 第一天", NOON),
    (10, 28, "乒乓球", "乒乓球 第二天", NOON),
    (10, 29, "足球", "足球 第一天", NOON),
    (10, 30, "足球", "足球 第二天", NOON),
    (11, 9, "足球", "足球 第三天", NOON),
    (11, 10, "长绳", "长绳 全年级(4+4)×3赛", NOON),
]
assert len(EVENTS) == 29


def main():
    dry = "--dry-run" in sys.argv
    t = token()
    A = app_token(t)
    tabs = req("GET", f"/bitable/v1/apps/{A}/tables?page_size=100", None, t)["data"]["items"]
    tid = {x["name"]: x["table_id"] for x in tabs}.get("拍摄任务")
    if not tid:
        print("table 拍摄任务 not found: run setup_tables.py first"); sys.exit(1)
    have, page = set(), ""
    while True:
        j = req("GET", f"/bitable/v1/apps/{A}/tables/{tid}/records?page_size=500" + (f"&page_token={page}" if page else ""), None, t)
        for r in j["data"].get("items") or []:
            k = (r.get("fields") or {}).get("种子键")
            if isinstance(k, list):
                k = "".join(x.get("text", "") for x in k)
            if k:
                have.add(k)
        if not j["data"].get("has_more"):
            break
        page = j["data"]["page_token"]
    todo = []
    for m, d, cat, name, time in EVENTS:
        date = f"{YEAR}-{m:02d}-{d:02d}"
        key = f"{date}|{name}"
        if key in have:
            continue
        todo.append({"fields": {"名称": name, "类别": cat, "日期": date, "时间": time, "状态": "开放报名", "种子键": key}})
    print(f"{len(EVENTS)} seed events, {len(EVENTS) - len(todo)} already present, {len(todo)} to create")
    if dry or not todo:
        return
    for i in range(0, len(todo), 100):
        j = req("POST", f"/bitable/v1/apps/{A}/tables/{tid}/records/batch_create", {"records": todo[i:i + 100]}, t)
        if j.get("code") != 0:
            print("ERR", j.get("code"), j.get("msg")); sys.exit(1)
        print("created", len(j["data"]["records"]))


if __name__ == "__main__":
    main()
