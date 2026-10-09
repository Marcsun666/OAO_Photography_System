/**
 * v4 离线测试：日历 / 报名 / 交付 / 管理员鉴权 / AI 预算守卫
 * 用一个内存版「飞书」+ 假 DeepSeek，不连任何真实服务。
 * 运行：node v4.test.js
 */
"use strict";
const assert = require("assert");

const ENV = {
  FEISHU_APP_ID: "cli_test", FEISHU_APP_SECRET: "s", BITABLE_APP_TOKEN: "app",
  TABLE_ACTIVITIES: "tbl_act", TABLE_PHOTOS: "tbl_photo", TABLE_LINKS: "tbl_link", TABLE_MEMBERS: "tbl_mem",
  TABLE_EVENTS: "tbl_ev", TABLE_APPLICATIONS: "tbl_app", TABLE_AI_USAGE: "tbl_ai",
  MEMBER_PASSCODE: "member-pass", MEMBER_TOKEN: "member-token",
  ADMIN_PASSCODE: "admin-pass", ADMIN_TOKEN: "admin-token",
  LLM_API_KEY: "sk-test",
};

/* —— 内存飞书 —— */
let seq = 0;
const db = { tbl_act: [], tbl_photo: [], tbl_link: [], tbl_mem: [], tbl_ev: [], tbl_app: [], tbl_ai: [] };
const add = (t, fields) => { const r = { record_id: "rec" + (++seq).toString(36) + "X", fields }; db[t].push(r); return r; };
const day = (offset) => { const d = new Date(Date.now() + 8 * 3600e3 + offset * 86400e3); return d.toISOString().slice(0, 10); };

add("tbl_act", { 活动名称: "Test", 日期: "2026.10.08 12:00", 描述: "Test\nCAS：C 1 / A 0 / S 1", 状态: "待选片" });
add("tbl_act", { 活动名称: "音乐剧公演", 日期: "2026.11.20 18:30", 描述: "公演跟拍\n联系人：王同学 · 微信 wx123" });
add("tbl_act", { 活动名称: "普通活动", 日期: "2026.06", 描述: "红墙合照" });
add("tbl_mem", { 姓名: "甲", 学号: "S001", 技能: "拍照、修图", 职位: "社员" });
add("tbl_mem", { 姓名: "乙", 学号: "S002", 技能: "拍视频、剪视频" });
const evFuture = add("tbl_ev", { 名称: "篮球 12年级ABCD小组赛", 类别: "篮球", 日期: day(3), 时间: "11:50-12:20", 状态: "开放报名", 需要人数: 2 });
const evPast = add("tbl_ev", { 名称: "测试 · 已结束", 类别: "其他", 日期: day(-2), 时间: "11:50-12:20", 状态: "开放报名" });
const evCancel = add("tbl_ev", { 名称: "已取消的", 类别: "足球", 日期: day(5), 时间: "放学", 状态: "已取消" });

let llmCalls = 0, llmReply = '{"caption":"阳光下的冲刺","tags":["#校运会"]}';
const calls = [];
global.fetch = async (url, opts = {}) => {
  const u = String(url), method = opts.method || "GET";
  calls.push(method + " " + u);
  const ok = (o) => ({ ok: true, status: 200, json: async () => o });
  if (u.includes("tenant_access_token")) return ok({ code: 0, tenant_access_token: "T", expire: 7200 });
  if (u.includes("api.deepseek.com")) {
    llmCalls++;
    const body = JSON.parse(opts.body);
    assert.ok(body.max_tokens <= 2000, "max_tokens 应受限");
    assert.ok(!/S00\d/.test(body.messages[0].content), "学号不应发给模型");
    assert.ok(!/wx123/.test(body.messages[0].content), "联系人信息不应发给模型");
    return ok({ choices: [{ message: { content: llmReply } }], usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_cache_hit_tokens: 200, prompt_cache_miss_tokens: 800 } });
  }
  const sm = u.match(/tables\/(\w+)\/records\/search$/);
  if (sm) {
    const conds = (JSON.parse(opts.body).filter || {}).conditions || [];
    const items = (db[sm[1]] || []).filter((r) => conds.every((c) => String(r.fields[c.field_name] || "") === String(c.value[0])));
    return ok({ code: 0, data: { items } });
  }
  const m = u.match(/tables\/(\w+)\/records(?:\/(rec\w+))?(\?.*)?$/);
  if (m) {
    const t = db[m[1]];
    if (!t) return ok({ code: 1254003, msg: "no table" });
    if (m[2] && method === "GET") {
      const r = t.find((x) => x.record_id === m[2]);
      return ok(r ? { code: 0, data: { record: r } } : { code: 1254043, msg: "RecordIdNotFound" });
    }
    if (m[2] && method === "PUT") {
      const r = t.find((x) => x.record_id === m[2]);
      Object.assign(r.fields, JSON.parse(opts.body).fields);
      return ok({ code: 0, data: { record: r } });
    }
    if (method === "POST") return ok({ code: 0, data: { record: add(m[1], JSON.parse(opts.body).fields) } });
    return ok({ code: 0, data: { items: t.slice(), has_more: false } });
  }
  throw new Error("unexpected fetch " + method + " " + u);
};

const api = require("./index.js");
const call = (method, path, body, token, query) => api.handle({
  method, path, headers: token ? { authorization: "Bearer " + token } : {}, body: body ? JSON.stringify(body) : "", query: query || {},
}, ENV).then((r) => ({ status: r.statusCode, body: JSON.parse(r.body || "{}") }));

(async () => {
  /* 1) 登录：同一个口令框，管理员口令拿到管理员 token */
  let r = await call("POST", "/api/auth", { passcode: "admin-pass" });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.role, "admin"); assert.strictEqual(r.body.token, "admin-token");
  r = await call("POST", "/api/auth", { passcode: "member-pass" });
  assert.strictEqual(r.body.role, "member"); assert.strictEqual(r.body.token, "member-token");
  r = await call("POST", "/api/auth", { passcode: "admin-pas" });
  assert.strictEqual(r.status, 401, "差一个字也不行");
  // 没配 ADMIN_TOKEN 时，管理员口令无效（不会发空 token）
  const noAdmin = await api.handle({ method: "POST", path: "/api/auth", headers: {}, body: JSON.stringify({ passcode: "admin-pass" }) }, { ...ENV, ADMIN_TOKEN: "" });
  assert.strictEqual(noAdmin.statusCode, 401);

  /* 2) 管理员接口：无 token 401、成员 403、伪造 token 401/403 */
  for (const p of ["/api/admin/overview"]) {
    assert.strictEqual((await call("GET", p)).status, 401);
    assert.strictEqual((await call("GET", p, null, "member-token")).status, 403);
    assert.strictEqual((await call("GET", p, null, "admin-token-x")).status, 401);
  }
  for (const [m, p] of [["POST", "/api/admin/events"], ["PUT", "/api/admin/events/" + evFuture.record_id], ["PUT", "/api/admin/applications/recX"],
    ["POST", "/api/admin/ai/weekly"], ["POST", "/api/admin/ai/staffing"], ["POST", "/api/admin/requests/recX/convert"]]) {
    assert.strictEqual((await call(m, p, {})).status, 401, p + " 无 token 应 401");
    assert.strictEqual((await call(m, p, {}, "member-token")).status, 403, p + " 成员应 403");
  }
  assert.strictEqual(llmCalls, 0, "被拒绝的请求不应调用模型");

  /* 3) 日历只读：不需要成员登录，不含名单 */
  r = await call("GET", "/api/events");
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.items.length, 3);
  assert.ok(!JSON.stringify(r.body).includes("S001"));

  /* 4) 报名：需要成员；校验；幂等 */
  const applyPath = "/api/events/" + evFuture.record_id + "/apply";
  assert.strictEqual((await call("POST", applyPath, { name: "甲", studentId: "S001" })).status, 401);
  assert.strictEqual((await call("POST", applyPath, { name: "甲", studentId: "bad id!" }, "member-token")).status, 400);
  r = await call("POST", applyPath, { name: "甲", studentId: "S001" }, "member-token");
  assert.strictEqual(r.status, 200); const app1 = r.body.item; assert.strictEqual(app1.status, "已报名");
  r = await call("POST", applyPath, { name: "甲", studentId: "S001" }, "member-token");
  assert.strictEqual(r.body.already, true, "重复报名不产生新记录");
  assert.strictEqual(db.tbl_app.length, 1);
  assert.strictEqual((await call("POST", "/api/events/" + evCancel.record_id + "/apply", { name: "甲", studentId: "S001" }, "member-token")).status, 409, "已取消的任务不能报名");
  r = await call("GET", "/api/events");
  assert.strictEqual(r.body.counts[evFuture.record_id].applied, 1);

  /* 5) 交付：任务没结束不能交；链接必须是百度网盘；学号要对上 */
  r = await call("POST", "/api/applications/" + app1.id + "/deliver", { studentId: "S001", link: "https://pan.baidu.com/s/1abcDEF", code: "ab12", desc: "x" }, "member-token");
  assert.strictEqual(r.status, 409, "未结束不能交付");
  r = await call("POST", "/api/events/" + evPast.record_id + "/apply", { name: "乙", studentId: "S002" }, "member-token");
  assert.strictEqual(r.status, 409, "已结束的任务不能报名");
  // 管理员指派乙到已结束任务（模拟赛前确认）
  r = await call("POST", "/api/admin/applications", { eventId: evPast.record_id, name: "乙", studentId: "S002" }, "admin-token");
  assert.strictEqual(r.status, 200); const app2 = r.body.item; assert.strictEqual(app2.status, "已确认");
  const dpath = "/api/applications/" + app2.id + "/deliver";
  assert.strictEqual((await call("POST", dpath, { studentId: "S001", link: "https://pan.baidu.com/s/1abcDEF", desc: "x" }, "member-token")).status, 403, "学号不匹配");
  assert.strictEqual((await call("POST", dpath, { studentId: "S002", link: "https://evil.com/s/1abcDEF", desc: "x" }, "member-token")).status, 400, "非百度链接");
  assert.strictEqual((await call("POST", dpath, { studentId: "S002", link: "https://pan.baidu.com.evil.com/s/1abcDEF", desc: "x" }, "member-token")).status, 400, "伪装域名");
  assert.strictEqual((await call("POST", dpath, { studentId: "S002", link: "https://pan.baidu.com/s/1abcDEF", code: "toolong", desc: "x" }, "member-token")).status, 400, "提取码");
  r = await call("POST", dpath, { studentId: "S002", link: "https://pan.baidu.com/s/1abcDEF?pwd=ab12", code: "ab12", desc: "冲刺瞬间", caption: "阳光" }, "member-token");
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.item.status, "已交付");
  /* 6) 验收：只有交付后能验收 */
  assert.strictEqual((await call("PUT", "/api/admin/applications/" + app1.id, { status: "已验收" }, "admin-token")).status, 409);
  r = await call("PUT", "/api/admin/applications/" + app2.id, { status: "已验收" }, "admin-token");
  assert.strictEqual(r.body.item.status, "已验收");
  /* 我的任务 */
  r = await call("GET", "/api/my", null, "member-token", { sid: "S002" });
  assert.strictEqual(r.body.items.length, 1); assert.strictEqual(r.body.items[0].event.title, "测试 · 已结束");
  /* 取消 */
  r = await call("POST", "/api/applications/" + app1.id + "/cancel", { studentId: "S001" }, "member-token");
  assert.strictEqual(r.body.item.status, "已取消");

  /* 7) 管理员：建任务 / 校验 / 改 / 取消 / 转申请 */
  assert.strictEqual((await call("POST", "/api/admin/events", { title: "x", category: "冰球", date: "2026-10-30" }, "admin-token")).status, 400);
  r = await call("POST", "/api/admin/events", { title: "排球赛", category: "其他", date: "2026.10.30", time: "放学", need: 3 }, "admin-token");
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.item.date, "2026-10-30");
  r = await call("PUT", "/api/admin/events/" + r.body.item.id, { status: "已取消" }, "admin-token");
  assert.strictEqual(r.body.item.status, "已取消");
  r = await call("GET", "/api/admin/overview", null, "admin-token");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.requests.length, 2, "应认出两条拍摄申请");
  assert.strictEqual(r.body.stats.members, 2);
  assert.ok(r.body.contributions.find((p) => p.name === "乙").accepted === 1);
  const reqId = r.body.requests.find((x) => x.name === "音乐剧公演").id;
  r = await call("POST", "/api/admin/requests/" + reqId + "/convert", { category: "其他" }, "admin-token");
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.item.date, "2026-11-20"); assert.strictEqual(r.body.item.time, "18:30");
  assert.ok(!r.body.item.note.includes("wx123"), "转任务时去掉联系人");
  assert.strictEqual((await call("POST", "/api/admin/requests/" + reqId + "/convert", {}, "admin-token")).status, 409, "不重复转换");
  assert.strictEqual(db.tbl_act.find((x) => x.record_id === reqId).fields.状态, undefined, "不改申请本身");

  /* 7b) v4.1 CAS 时间（字段 CAS-C / CAS-S）：日历和后台都带；飞书返回字符串也认；新建默认 1/1；0.5–5、0.5 一档 */
  {
    const evCas = add("tbl_ev", { 名称: "飞书里直接改过", 类别: "篮球", 日期: day(4), 时间: "放学", 状态: "开放报名", "CAS-C": "1.5", "CAS-S": "2" });
    r = await call("GET", "/api/events");
    const byId = {}; r.body.items.forEach((e) => (byId[e.id] = e));
    assert.strictEqual(byId[evCas.record_id].casC, 1.5, "飞书字符串 \"1.5\" → 1.5");
    assert.strictEqual(byId[evCas.record_id].casS, 2);
    assert.strictEqual(byId[evFuture.record_id].casC, 1, "空格子按默认 1");
    assert.strictEqual(byId[evFuture.record_id].casS, 1);
    r = await call("GET", "/api/admin/overview", null, "admin-token");
    const ov = r.body.events.find((e) => e.id === evCas.record_id);
    assert.strictEqual(ov.casC, 1.5); assert.strictEqual(ov.casS, 2, "后台数据也带 CAS");
    // 新建：不填 → 写入 1 / 1（数字）
    r = await call("POST", "/api/admin/events", { title: "CAS 默认", category: "其他", date: "2026-10-31" }, "admin-token");
    assert.strictEqual(r.status, 200);
    const created = db.tbl_ev.find((x) => x.record_id === r.body.item.id);
    assert.strictEqual(created.fields["CAS-C"], 1); assert.strictEqual(created.fields["CAS-S"], 1);
    assert.strictEqual(r.body.item.casC, 1); assert.strictEqual(r.body.item.casS, 1);
    // 新建：给值（字符串也行）
    r = await call("POST", "/api/admin/events", { title: "CAS 给值", category: "其他", date: "2026-10-31", casC: "2.5", casS: 0.5 }, "admin-token");
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.item.casC, 2.5); assert.strictEqual(r.body.item.casS, 0.5);
    // 校验：范围 / 步长 / 非数字
    for (const bad of [0, 0.25, 1.2, 5.5, -1, "abc", true, 6]) {
      const x = await call("POST", "/api/admin/events", { title: "坏 CAS", category: "其他", date: "2026-10-31", casC: bad }, "admin-token");
      assert.strictEqual(x.status, 400, "CAS C=" + JSON.stringify(bad) + " 应 400"); assert.ok(x.body.msg.includes("CAS C"));
    }
    assert.strictEqual((await call("PUT", "/api/admin/events/" + evCas.record_id, { casS: 7 }, "admin-token")).status, 400);
    assert.strictEqual(db.tbl_ev.filter((x) => x.fields.名称 === "坏 CAS").length, 0, "校验失败不落库");
    // 编辑：只改传了的那个；不传 CAS 时不覆盖飞书里的值
    r = await call("PUT", "/api/admin/events/" + evCas.record_id, { casS: 3.5 }, "admin-token");
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.item.casC, 1.5); assert.strictEqual(r.body.item.casS, 3.5);
    r = await call("PUT", "/api/admin/events/" + evCas.record_id, { status: "已安排" }, "admin-token");
    assert.strictEqual(evCas.fields["CAS-C"], "1.5", "改状态不动 CAS"); assert.strictEqual(r.body.item.casS, 3.5);
    r = await call("PUT", "/api/admin/events/" + evCas.record_id, { casC: 5, casS: "1" }, "admin-token");
    assert.strictEqual(r.body.item.casC, 5); assert.strictEqual(r.body.item.casS, 1);
    // 飞书 update 只回传改动的字段时，响应仍是完整任务
    const realFetch = global.fetch;
    global.fetch = async (u, o = {}) => {
      const res = await realFetch(u, o);
      if ((o.method || "GET") !== "PUT") return res;
      const j = await res.json();
      return { ok: true, status: 200, json: async () => ({ code: 0, data: { record: { record_id: j.data.record.record_id, fields: JSON.parse(o.body).fields } } }) };
    };
    r = await call("PUT", "/api/admin/events/" + evCas.record_id, { casC: 4.5 }, "admin-token");
    global.fetch = realFetch;
    assert.strictEqual(r.body.item.casC, 4.5); assert.strictEqual(r.body.item.casS, 1); assert.strictEqual(r.body.item.title, "飞书里直接改过", "部分回传也返回完整任务");
    // 申请转任务：默认 1 / 1；也可以在编辑器里给值
    const req2 = add("tbl_act", { 活动名称: "合唱团音乐会", 日期: "2026.12.01 18:00", 描述: "合唱\n联系人：李老师" });
    r = await call("POST", "/api/admin/requests/" + req2.record_id + "/convert", { casC: 2 }, "admin-token");
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.item.casC, 2); assert.strictEqual(r.body.item.casS, 1);
    const req3 = add("tbl_act", { 活动名称: "美术展开幕", 日期: "2026.12.02", 描述: "展览\n联系人：张同学" });
    r = await call("POST", "/api/admin/requests/" + req3.record_id + "/convert", {}, "admin-token");
    assert.strictEqual(r.body.item.casC, 1); assert.strictEqual(r.body.item.casS, 1, "转任务默认 1/1");
    assert.strictEqual((await call("POST", "/api/admin/requests/" + req3.record_id + "/convert", { force: true, casC: 9 }, "admin-token")).status, 400);
    // 成员不能改 CAS
    assert.strictEqual((await call("PUT", "/api/admin/events/" + evCas.record_id, { casC: 2 }, "member-token")).status, 403);
  }

  /* 7c) v4.1 polish */
  {
    const P = api._v4;
    // —— 邀请拍摄：服务端统一标记，不信任前端的状态；不上公开时间线；在后台列表里 —— //
    r = await call("POST", "/api/request", { name: "【测试】话剧社公演", date: "2026.12.05 18:30", desc: "舞台跟拍", contact: "陈老师 · 微信 cx-777", casC: 2, casA: 1, casS: 7, status: "已归档" });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const rq = db.tbl_act.find((x) => x.fields.活动名称 === "【测试】话剧社公演");
    assert.strictEqual(rq.fields.来源, "邀请拍摄"); assert.strictEqual(rq.fields.状态, "待处理申请", "不信任前端传来的状态");
    assert.ok(rq.fields.描述.includes("联系人：陈老师") && rq.fields.描述.includes("CAS：C 2 / A 1 / S 7"));
    assert.strictEqual((await call("POST", "/api/request", { name: "" })).status, 400, "活动名称必填");
    r = await call("GET", "/api/activities");
    const pub = r.body.items.map((x) => x.fields.活动名称);
    assert.ok(pub.includes("普通活动"), "普通活动在公开时间线");
    assert.ok(!pub.includes("【测试】话剧社公演") && !pub.includes("音乐剧公演") && !pub.includes("Test"), "申请（新标记 + 旧格式）都不在公开时间线");
    assert.ok(!JSON.stringify(r.body).includes("cx-777") && !JSON.stringify(r.body).includes("wx123"), "公开接口不泄露联系方式");
    r = await call("GET", "/api/admin/overview", null, "admin-token");
    const ar = r.body.requests.find((x) => x.name === "【测试】话剧社公演");
    assert.ok(ar, "后台拍摄申请列表里有新申请");
    assert.strictEqual(ar.cas.taskC, 2); assert.strictEqual(ar.cas.taskS, 5, "S 7 夹到 5"); assert.strictEqual(ar.cas.a, 1);
    assert.ok(!ar.note.includes("cx-777") && !ar.note.includes("CAS"), "预填备注去掉联系人和 CAS 行");
    assert.strictEqual(r.body.stats.activities, db.tbl_act.filter((x) => !P.isShootRequest(x)).length, "后台「活动记录」数不含申请");
    // 转任务：备注干净，CAS 来自申请（C 2 → 2，S 7 → 5）
    r = await call("POST", "/api/admin/requests/" + rq.record_id + "/convert", { category: "其他", time: "18:30-20:00" }, "admin-token");
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.item.casC, 2); assert.strictEqual(r.body.item.casS, 5);
    assert.ok(!/cx-777|联系人|CAS/.test(r.body.item.note), "任务备注里没有联系方式 / CAS 行：" + r.body.item.note);
    assert.strictEqual(r.body.item.note, "舞台跟拍");
    // 编辑器传来的备注里如果还有联系人行，也会被去掉
    const rq2 = add("tbl_act", { 活动名称: "旧格式申请", 日期: "2026.12.06", 描述: "合影\n联系人：赵同学 13800000000\nCAS：C 0.3 / A 0 / S 0" });
    r = await call("POST", "/api/admin/requests/" + rq2.record_id + "/convert", { note: "合影\n联系人：赵同学 13800000000" }, "admin-token");
    assert.strictEqual(r.body.item.note, "合影"); assert.strictEqual(r.body.item.casC, 0.5, "C 0.3 → 0.5"); assert.strictEqual(r.body.item.casS, 1, "S 0 → 默认 1");
    // 纯函数
    assert.strictEqual(P.casFromRequest(1.26), 1.5); assert.strictEqual(P.casFromRequest(null), 1); assert.strictEqual(P.casFromRequest("abc"), 1);
    assert.strictEqual(P.casFromRequest(9), 5); assert.strictEqual(P.casFromRequest(0.1), 0.5);
    assert.deepStrictEqual(P.parseRequestCas("x\nCAS：C 1.5 / A 2 / S 0"), { c: 1.5, a: 2, s: 0 });
    assert.strictEqual(P.stripContact("a\n联系人：x\nCAS：C 1 / A 0 / S 1\nb"), "a\nb");
    global.__polishReq = rq.record_id;

    // —— 交付：任务时间没到，但管理员标了「已结束」→ 可以交付 —— //
    const evEarly = add("tbl_ev", { 名称: "【测试】提前结束", 类别: "其他", 日期: day(2), 时间: "15:30", 状态: "开放报名" });
    r = await call("POST", "/api/admin/applications", { eventId: evEarly.record_id, name: "甲", studentId: "TEST9999" }, "admin-token");
    const appE = r.body.item;
    const dl = { studentId: "TEST9999", link: "https://pan.baidu.com/s/1abcDEF", code: "ab12", desc: "提前结束的素材" };
    assert.strictEqual((await call("POST", "/api/applications/" + appE.id + "/deliver", dl, "member-token")).status, 409, "没结束不能交付");
    r = await call("GET", "/api/events");
    assert.strictEqual(r.body.items.find((e) => e.id === evEarly.record_id).ended, false);
    await call("PUT", "/api/admin/events/" + evEarly.record_id, { status: "已结束" }, "admin-token");
    r = await call("GET", "/api/events");
    assert.strictEqual(r.body.items.find((e) => e.id === evEarly.record_id).ended, true, "已结束 = ended");
    r = await call("POST", "/api/applications/" + appE.id + "/deliver", dl, "member-token");
    assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.strictEqual(r.body.item.status, "已交付");
    // 单个时间「15:30」= 1 小时
    const w1 = P.eventWindow("2026-10-21", "15:30");
    assert.strictEqual(w1.end - w1.start, 3600e3);
    assert.strictEqual(P.isEnded("开放报名", w1.end, w1.end - 1), false); assert.strictEqual(P.isEnded("开放报名", w1.end, w1.end), true);
    assert.strictEqual(P.isEnded("已结束", w1.end, 0), true);

    // —— 验收可以撤销（回到已交付），已取消的报名可以恢复为已确认 —— //
    r = await call("PUT", "/api/admin/applications/" + appE.id, { status: "已验收" }, "admin-token");
    assert.strictEqual(r.body.item.status, "已验收");
    r = await call("PUT", "/api/admin/applications/" + appE.id, { status: "已交付" }, "admin-token");
    assert.strictEqual(r.body.item.status, "已交付", "撤销验收");
    r = await call("GET", "/api/admin/overview", null, "admin-token");
    const cancelled = r.body.events.find((e) => e.id === evFuture.record_id).applicants.find((a) => a.status === "已取消");
    assert.ok(cancelled, "后台数据里保留已取消的报名（前端在「已取消」里展示）");
    r = await call("PUT", "/api/admin/applications/" + cancelled.id, { status: "已确认" }, "admin-token");
    assert.strictEqual(r.body.item.status, "已确认", "恢复为已确认");

    // —— 上传到新活动名：自动新建活动，照片数 = 1；再传一次 +1；同名申请不算活动 —— //
    r = await call("POST", "/api/photos", { activity: "【测试】新活动", link: "https://pan.baidu.com/s/1abcDEF" }, "member-token");
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.activityCreated, true);
    let act = db.tbl_act.filter((x) => x.fields.活动名称 === "【测试】新活动");
    assert.strictEqual(act.length, 1); assert.strictEqual(act[0].fields.照片数, 1); assert.strictEqual(act[0].fields.来源, "成员录入");
    r = await call("POST", "/api/photos", { activity: "【测试】新活动", link: "https://pan.baidu.com/s/1abcDEG" }, "member-token");
    assert.strictEqual(r.body.activityCreated, false); assert.strictEqual(act[0].fields.照片数, 2);
    r = await call("POST", "/api/photos", { activity: "【测试】话剧社公演", link: "https://pan.baidu.com/s/1abcDEH" }, "member-token");
    assert.strictEqual(r.body.activityCreated, true, "同名的邀请拍摄申请不被当成活动");
    assert.strictEqual(rq.fields.照片数, undefined, "申请本身不被改动");
    r = await call("GET", "/api/activities");
    assert.ok(r.body.items.some((x) => x.fields.活动名称 === "【测试】话剧社公演" && x.fields.来源 === "成员录入"));

    // —— AI 分组只给管理员 —— //
    r = await call("POST", "/api/group", { groupCount: 2 }, "member-token");
    assert.strictEqual(r.status, 403); assert.strictEqual(r.body.code, "ADMIN_ONLY");
    assert.strictEqual((await call("POST", "/api/group", { groupCount: 2 })).status, 401);
  }

  /* 8) AI：成员可润色；记账；预算/次数守卫 */
  r = await call("POST", "/api/ai/caption", { desc: "冲刺瞬间，阳光很好" });
  assert.strictEqual(r.status, 401);
  r = await call("POST", "/api/ai/caption", { desc: "冲刺瞬间，阳光很好", eventTitle: "运动会" }, "member-token");
  assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.strictEqual(r.body.caption, "阳光下的冲刺");
  // 1000 输入（200 命中 + 800 未命中）+ 100 输出，高峰价：200*0.04 + 800*2 + 100*8 = 2408 / 1e6 元
  assert.ok(Math.abs(r.body.cost - 0.002408) < 1e-9, "按高峰价计费: " + r.body.cost);
  assert.strictEqual(db.tbl_ai.length, 1); assert.strictEqual(db.tbl_ai[0].fields.调用次数, 1);
  // 冷却：4 秒内同功能再点被拒
  r = await call("POST", "/api/ai/caption", { desc: "再来一次试试看" }, "member-token");
  assert.strictEqual(r.status, 429); assert.strictEqual(r.body.code, "AI_RATE");
  // 预算：把本月花费改到 17.999 → 超过 18 元停用线，拒绝且不调模型
  const before = llmCalls;
  db.tbl_ai[0].fields.费用元 = 17.999;
  llmReply = '{"summary":"s","highlights":[],"risks":[],"next":[]}';
  r = await call("POST", "/api/admin/ai/weekly", {}, "admin-token");
  assert.strictEqual(r.status, 429); assert.strictEqual(r.body.code, "AI_BUDGET"); assert.ok(r.body.msg.includes("额度"));
  assert.strictEqual(llmCalls, before, "超预算不调模型");
  // 停用线不能高于上限：AI_STOP_AT_CNY=25 时按上限 20 算
  db.tbl_ai[0].fields.费用元 = 19.995;
  const low = await api.handle({ method: "POST", path: "/api/group", headers: { authorization: "Bearer admin-token" }, body: JSON.stringify({ groupCount: 2 }) }, { ...ENV, AI_MONTHLY_CAP_CNY: "20", AI_STOP_AT_CNY: "25" });
  assert.strictEqual(low.statusCode, 429, "停用线不能高于上限");
  db.tbl_ai[0].fields.费用元 = 0.01;
  r = await call("POST", "/api/admin/ai/weekly", {}, "admin-token");
  assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.ok(r.body.report);
  // 每日次数上限
  db.tbl_ai.find((x) => x.fields.功能 === "weekly").fields.当日次数 = 10;
  await new Promise((res) => setTimeout(res, 10));
  const { _v4 } = api;
  r = await call("POST", "/api/admin/ai/weekly", {}, "admin-token");
  assert.strictEqual(r.status, 429); assert.ok(r.body.msg.includes("每日上限"));
  // 用量表没配 → 所有 AI 拒绝
  const noTbl = await api.handle({ method: "POST", path: "/api/ai/caption", headers: { authorization: "Bearer member-token" }, body: JSON.stringify({ desc: "一二三四五" }) }, { ...ENV, TABLE_AI_USAGE: "" });
  assert.strictEqual(noTbl.statusCode, 429);
  // 排班建议：名单外的人被过滤
  llmReply = '{"picks":[{"name":"甲","reason":"会拍照"},{"name":"路人","reason":"x"}],"note":"ok"}';
  r = await call("POST", "/api/admin/ai/staffing", { eventId: evFuture.record_id }, "admin-token");
  assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.strictEqual(r.body.picks.length, 1); assert.ok(r.body.warnings.length === 1);
  // 申请整理：类别不合法回落「其他」
  llmReply = '{"title":"音乐剧公演跟拍","category":"冰球","date":"2026-11-20","time":"18:30-20:30","need":3,"note":"舞台"}';
  r = await call("POST", "/api/admin/ai/draft", { requestId: reqId }, "admin-token");
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.draft.category, "其他"); assert.strictEqual(r.body.draft.need, 3);
  assert.strictEqual(r.body.draft.casC, 1); assert.strictEqual(r.body.draft.casS, 1, "AI 草稿的 CAS 默认 1/1");
  // v4.1 polish：申请里填了 C / S 时，AI 草稿的 CAS 用申请的值（S 7 夹到 5）
  await new Promise((res) => setTimeout(res, 4100)); // 同功能 4 秒冷却
  r = await call("POST", "/api/admin/ai/draft", { requestId: global.__polishReq }, "admin-token");
  assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.strictEqual(r.body.draft.casC, 2); assert.strictEqual(r.body.draft.casS, 5);

  /* 9) 纯函数 */
  assert.ok(_v4.validBaiduLink("https://pan.baidu.com/s/1AbC-dEf_12"));
  assert.ok(_v4.validBaiduLink("https://pan.baidu.com/share/init?surl=AbCd12"));
  assert.ok(!_v4.validBaiduLink("http://pan.baidu.com/s/1AbCdEf"));
  assert.ok(!_v4.validBaiduLink("https://pan.baidu.com/s/1Ab\"><script>"));
  const w = _v4.eventWindow("2026-10-21", "放学");
  assert.strictEqual(new Date(w.start).toISOString(), "2026-10-21T07:30:00.000Z");
  assert.strictEqual(new Date(_v4.eventWindow("2026-10-12", "11:50-12:20").end).toISOString(), "2026-10-12T04:20:00.000Z");
  assert.strictEqual(_v4.normDate("2026.10.8"), "2026-10-08");
  assert.strictEqual(_v4.stopAt(), 18);

  console.log("✅ v4 测试通过（日历 / 报名 / 交付 / 管理员鉴权 / AI 预算，模型调用 " + llmCalls + " 次）");
})().catch((e) => { console.error("❌ v4 测试失败:", e && e.stack || e); process.exit(1); });
