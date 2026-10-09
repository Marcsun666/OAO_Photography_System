/**
 * v4 日历渲染测试（纯函数，不需要浏览器）：月历格子、颜色类别、期中考试标注、手机议程、29 个种子任务
 * 运行：node events.test.js
 */
"use strict";
const assert = require("assert");
const cal = require("./events.js");

// 与 tools/feishu/seed_events.py 相同的 29 个任务
const seed = [
  [10, 12, "篮球", "篮球 12年级ABCD小组赛"], [10, 13, "文化周", "中国文化周"], [10, 14, "文化周", "中国文化周"],
  [10, 15, "文化周", "中国文化周"], [10, 16, "文化周", "中国文化周"], [10, 19, "篮球", "篮球 10年级ABCD小组赛"],
  [10, 19, "匹克球", "匹克球 12年级第一天"], [10, 20, "篮球", "篮球 12年级AB胜者赛"], [10, 20, "篮球", "篮球 12年级CD胜者赛"],
  [10, 20, "篮球", "篮球 10年级AB胜者赛"], [10, 20, "篮球", "篮球 10年级CD胜者赛"], [10, 20, "匹克球", "匹克球 11年级第一天"],
  [10, 21, "篮球", "篮球 11年级决赛"], [10, 21, "篮球", "篮球 12年级铜牌"], [10, 21, "足球", "足球资格赛"],
  [10, 21, "匹克球", "匹克球 10年级第一天"], [10, 22, "篮球", "篮球 12年级决赛"], [10, 22, "篮球", "篮球 10年级铜牌"],
  [10, 22, "匹克球", "匹克球 11年级第二天"], [10, 23, "篮球", "篮球 10年级决赛"], [10, 23, "篮球", "篮球 11年级铜牌"],
  [10, 23, "匹克球", "匹克球 12年级第二天"], [10, 26, "匹克球", "匹克球 10年级第二天"], [10, 27, "乒乓球", "乒乓球 第一天"],
  [10, 28, "乒乓球", "乒乓球 第二天"], [10, 29, "足球", "足球 第一天"], [10, 30, "足球", "足球 第二天"],
  [11, 9, "足球", "足球 第三天"], [11, 10, "长绳", "长绳 全年级(4+4)×3赛"],
].map((x, i) => ({ id: "rec" + i, title: x[3], category: x[2], date: `2026-${String(x[0]).padStart(2, "0")}-${String(x[1]).padStart(2, "0")}`,
  time: x[3] === "足球资格赛" ? "放学" : "11:50-12:20", status: "开放报名", need: 0, ended: false }));
assert.strictEqual(seed.length, 29);

// 2026 年 10 月：1 号是周四 → 前面补 3 天；共 5 周
const cells = cal.monthCells(2026, 10);
assert.strictEqual(cells.length, 35);
assert.strictEqual(cells[0].day, "2026-09-28");
assert.strictEqual(cells[3].day, "2026-10-01");
assert.strictEqual(cal.monthCells(2026, 11).length, 42, "11 月 1 号是周日 → 6 周");

const oct = cal.renderMonthHTML(2026, 10, seed, "2026-10-09", {});
assert.strictEqual((oct.match(/class="cal-ev /g) || []).length, 24, "10 月格子显示 24 个（10/20 五个、10/21 四个，各只显示 3 个）");
assert.ok(oct.includes("还有 1 项"));
assert.ok(oct.includes("还有 2 项"), "超出 3 个折叠");
assert.ok(oct.includes('aria-current="date"'), "今天高亮");
assert.ok(/c-bb/.test(oct) && /c-cw/.test(oct) && /c-pk/.test(oct) && /c-tt/.test(oct) && /c-fb/.test(oct), "颜色按类别");
assert.ok(oct.includes(">12年级ABCD小组赛<"), "格子里去掉类别前缀");
const nov = cal.renderMonthHTML(2026, 11, seed, "2026-10-09", {});
assert.strictEqual((nov.match(/cal-exam/g) || []).length, 5, "11/2–11/6 标注期中考试");
assert.ok(nov.includes("c-jr"), "长绳");
assert.strictEqual((nov.match(/class="cal-ev /g) || []).length, 7, "11 月视图：前面补的 10/26–10/30 五个 + 11 月两个");

const agOct = cal.renderAgendaHTML(2026, 10, seed, "2026-10-09", {});
assert.strictEqual((agOct.match(/class="ag-ev /g) || []).length, 27, "手机议程列出 10 月全部 27 个");
assert.ok(agOct.includes("放学"));
const agNov = cal.renderAgendaHTML(2026, 11, seed, "2026-10-09", {});
assert.ok(agNov.includes("期中考试") && agNov.includes("没有拍摄任务"));
assert.ok(cal.renderAgendaHTML(2026, 12, seed, "x", {}).includes("还没有拍摄任务"));

// XSS：标题里的 HTML 必须被转义
const bad = cal.renderMonthHTML(2026, 10, [{ id: "r", title: "<img src=x onerror=alert(1)>", category: "其他", date: "2026-10-05", time: "", status: "开放报名" }], "", {});
assert.ok(!bad.includes("<img src=x"), "标题要转义");
assert.strictEqual(cal.catKey("不存在"), "ot");

console.log("✅ v4 日历渲染测试通过（29 个任务、期中考试标注、议程、转义）");
