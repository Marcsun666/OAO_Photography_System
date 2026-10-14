/**
 * v4.1.1 离线测试：交付 → 活动素材库（照片素材）自动同步
 * 内存版飞书 + 假 DeepSeek。运行：node cloud-function/v411.test.js
 */
"use strict";
const assert = require("assert");
const ENV = {
  FEISHU_APP_ID: "cli_test", FEISHU_APP_SECRET: "s", BITABLE_APP_TOKEN: "app",
  TABLE_ACTIVITIES: "tbl_act", TABLE_PHOTOS: "tbl_photo", TABLE_LINKS: "tbl_link", TABLE_MEMBERS: "tbl_mem",
  TABLE_EVENTS: "tbl_ev", TABLE_APPLICATIONS: "tbl_app", TABLE_AI_USAGE: "tbl_ai",
  MEMBER_PASSCODE: "member-pass", MEMBER_TOKEN: "member-token",
  ADMIN_PASSCODE: "admin-pass", ADMIN_TOKEN: "admin-token", LLM_API_KEY: "sk-test",
};
let seq = 0;
const db = { tbl_act: [], tbl_photo: [], tbl_link: [], tbl_mem: [], tbl_ev: [], tbl_app: [], tbl_ai: [] };
const add = (t, fields) => { const r = { record_id: "rec" + (++seq).toString(36) + "Y", fields }; db[t].push(r); return r; };
const ev = add("tbl_ev", { 名称: "中国文化周Day1", 类别: "文化周", 日期: "2026-10-13", 时间: "11:50-12:20", 状态: "已结束" });
const app = add("tbl_app", { 成员姓名: "张三", 学号: "S123", 任务ID: ev.record_id, 任务名称: "中国文化周Day1", 状态: "已确认" });

let llmMode = "ok", llmCalls = 0;
global.fetch = async (url, opts = {}) => {
  const u = String(url), method = opts.method || "GET";
  const ok = (o) => ({ ok: true, status: 200, json: async () => o });
  if (u.includes("tenant_access_token")) return ok({ code: 0, tenant_access_token: "T", expire: 7200 });
  if (u.includes("api.deepseek.com")) {
    llmCalls++;
    const body = JSON.parse(opts.body);
    assert.ok(body.max_tokens <= 120, "素材库文案 max_tokens 应很小");
    assert.ok(!/S123|张三/.test(body.messages[0].content), "姓名/学号不应发给模型");
    if (llmMode === "fail") return { ok: false, status: 500, json: async () => ({ error: { message: "boom" } }) };
    return ok({ choices: [{ message: { content: '{"caption":"包含中国文化周第一天的所有活动"}' } }], usage: { prompt_tokens: 200, completion_tokens: 20 } });
  }
  const sm = u.match(/tables\/(\w+)\/records\/search$/);
  if (sm) {
    const conds = (JSON.parse(opts.body).filter || {}).conditions || [];
    return ok({ code: 0, data: { items: db[sm[1]].filter((r) => conds.every((c) => String(r.fields[c.field_name] || "") === String(c.value[0]))) } });
  }
  const m = u.match(/tables\/(\w+)\/records(?:\/(rec\w+))?(\?.*)?$/);
  if (m) {
    const t = db[m[1]];
    if (m[2]) {
      const i = t.findIndex((x) => x.record_id === m[2]);
      if (method === "GET") return ok(i >= 0 ? { code: 0, data: { record: t[i] } } : { code: 1254043, msg: "nf" });
      if (method === "PUT") { Object.assign(t[i].fields, JSON.parse(opts.body).fields); return ok({ code: 0, data: { record: t[i] } }); }
      if (method === "DELETE") { t.splice(i, 1); return ok({ code: 0, data: { deleted: true } }); }
    }
    if (method === "POST") return ok({ code: 0, data: { record: add(m[1], JSON.parse(opts.body).fields) } });
    return ok({ code: 0, data: { items: t.slice(), has_more: false } });
  }
  throw new Error("unexpected fetch " + method + " " + u);
};
const api = require("./index.js");
const call = (method, path, body, token) => api.handle({
  method, path, headers: token ? { authorization: "Bearer " + token } : {}, body: body ? JSON.stringify(body) : "", query: {},
}, ENV).then((r) => ({ status: r.statusCode, body: JSON.parse(r.body || "{}") }));

(async () => {
  const dpath = "/api/applications/" + app.record_id + "/deliver";
  const dl = { studentId: "S123", link: "https://pan.baidu.com/s/1abcDEF?pwd=nb9o", code: "nb9o", desc: "今天中国文化周第一天，拍了开幕式、书法、舞狮等全部活动～" };

  // 1) 交付 → 新建素材卡
  let r = await call("POST", dpath, dl, "member-token");
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.library && r.body.library.ok && r.body.library.ai, "应同步并用 AI");
  assert.strictEqual(db.tbl_photo.length, 1);
  let f = db.tbl_photo[0].fields;
  assert.strictEqual(f.活动, "中国文化周Day1 10.13");
  assert.strictEqual(f.网盘链接, dl.link); assert.strictEqual(f.提取码, "nb9o");
  assert.strictEqual(f.分类, "素材"); assert.strictEqual(f.说明, "包含中国文化周第一天的所有活动");
  assert.strictEqual(f.来源申请ID, app.record_id);
  assert.ok(!JSON.stringify(f).match(/S123|张三/), "素材卡不含姓名/学号");
  assert.ok(db.tbl_ai.some((x) => x.fields.功能 === "libcap"), "AI 用量按 libcap 记账");

  // 公开读接口能看到这张卡
  r = await call("GET", "/api/photos");
  assert.strictEqual(r.body.items.length, 1);

  // 2) 重新交付 → 更新同一张卡（不重复），AI 失败 → 回退原描述（并且没有 4 秒冷却阻挡）
  llmMode = "fail";
  r = await call("POST", dpath, { ...dl, code: "ab12", desc: "补充：\n加了闭幕合照" }, "member-token");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(db.tbl_photo.length, 1, "重复交付不应重复建卡");
  f = db.tbl_photo[0].fields;
  assert.strictEqual(f.提取码, "ab12"); assert.strictEqual(f.说明, "补充： 加了闭幕合照");
  assert.strictEqual(r.body.library.ai, false);

  // 3) 管理员退回 → 下架
  r = await call("PUT", "/api/admin/applications/" + app.record_id, { status: "已退回", adminNote: "链接失效" }, "admin-token");
  assert.strictEqual(r.status, 200); assert.strictEqual(db.tbl_photo.length, 0, "退回后素材卡下架");

  // 4) 恢复为已交付 → 补回（不调 AI）
  const before = llmCalls;
  r = await call("PUT", "/api/admin/applications/" + app.record_id, { status: "已交付" }, "admin-token");
  assert.strictEqual(r.status, 200); assert.strictEqual(db.tbl_photo.length, 1); assert.strictEqual(llmCalls, before);
  assert.strictEqual(db.tbl_photo[0].fields.活动, "中国文化周Day1 10.13");

  // 5) 验收不重复建卡；取消 → 下架
  await call("PUT", "/api/admin/applications/" + app.record_id, { status: "已验收" }, "admin-token");
  assert.strictEqual(db.tbl_photo.length, 1);
  await call("PUT", "/api/admin/applications/" + app.record_id, { status: "已取消" }, "admin-token");
  assert.strictEqual(db.tbl_photo.length, 0);

  // 6) 其他素材（成员手动贴的）不受影响
  add("tbl_photo", { 活动: "手动", 网盘链接: "https://pan.baidu.com/s/x", 分类: "campus" });
  await call("PUT", "/api/admin/applications/" + app.record_id, { status: "已退回" }, "admin-token");
  assert.strictEqual(db.tbl_photo.length, 1);

  console.log("✅ v4.1.1 交付→素材库测试通过");
})().catch((e) => { console.error("❌ v4.1.1 测试失败:", e); process.exit(1); });
