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

// v4.1 CAS 时间：「C 1 · S 1」，0.5 显示成 1.5，飞书字符串也认，缺值按 1，没有 A
assert.strictEqual(cal.casText({ casC: 1, casS: 1 }), "C 1 · S 1");
assert.strictEqual(cal.casText({ casC: "1.5", casS: 2 }), "C 1.5 · S 2");
assert.strictEqual(cal.casText({ casC: 0.5, casS: "5.0" }), "C 0.5 · S 5");
assert.strictEqual(cal.casText({}), "C 1 · S 1");
assert.ok(!/A/.test(cal.casText({ casC: 2, casS: 3 })));
const casSeed = seed.map((e, i) => Object.assign({}, e, i === 0 ? { casC: "1.5", casS: "2" } : { casC: 1, casS: 1 }));
const agCas = cal.renderAgendaHTML(2026, 10, casSeed, "2026-10-09", {});
assert.strictEqual((agCas.match(/class="ag-cas"/g) || []).length, 27, "手机议程每个任务都有 CAS 时间行");
assert.ok(agCas.includes("<b>CAS 时间</b>C 1.5 · S 2"), "议程显示飞书里改过的值");
const octCas = cal.renderMonthHTML(2026, 10, casSeed, "2026-10-09", {});
assert.strictEqual((octCas.match(/CAS 时间 C /g) || []).length, 48, "桌面格子：每个任务的悬停提示 + 读屏文字都带 CAS 时间");
assert.ok(octCas.includes("CAS 时间 C 1.5 · S 2"), "格子提示显示飞书里改过的值");
assert.strictEqual((octCas.match(/class="cal-ev /g) || []).length, 24, "加 CAS 不改变格子数量");

/* v4.1 polish：空周 / 状态颜色 / 已结束 */
{
  const one = [{ id: "a", title: "唯一任务", date: "2026-10-28", time: "15:30", category: "其他", status: "开放报名" }];
  const ag = cal.renderAgendaHTML(2026, 10, one, "2026-10-14", {});
  assert.ok(!ag.includes("10月1日 –") && !ag.includes("10月5日 –"), "已经过去的空周不显示");
  assert.ok(ag.includes("本周暂无任务"), "本周 / 以后的空周显示「本周暂无任务」");
  assert.ok(ag.includes("唯一任务"));
  assert.ok(!cal.renderAgendaHTML(2026, 9, one, "2026-10-14", {}).includes("本周暂无任务"), "过去的月份不出现空周提示");
  const pc = cal.pillClass;
  assert.strictEqual(pc("已取消"), "p-cancel"); assert.strictEqual(pc("待处理申请"), "p-request");
  assert.strictEqual(pc("已结束"), "p-muted"); assert.notStrictEqual(pc("已验收"), pc("已交付"));
  assert.strictEqual(pc("已安排"), pc("已确认"), "同为绿色");
  const now = Date.parse("2026-10-14T08:00:00Z"); // 北京 16:00
  assert.strictEqual(cal.isEnded({ end: now + 864e5, status: "已结束" }, now), true, "标记已结束即视为结束");
  assert.strictEqual(cal.isEnded({ end: now + 864e5, status: "开放报名" }, now), false);
  assert.strictEqual(cal.isEnded({ end: now - 1, status: "开放报名" }, now), true, "时间已过");
}
console.log("✅ v4 日历渲染测试通过（29 个任务、期中考试标注、议程、转义、v4.1 CAS 时间、空周、状态色）");
