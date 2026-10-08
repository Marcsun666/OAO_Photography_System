/**
 * cloud-function 离线测试（不依赖真实飞书，mock 掉 fetch）
 * 运行：node test.js
 */
"use strict";
const assert = require("assert");

// 必须在 require 前设置环境变量
process.env.FEISHU_APP_ID = "cli_test";
process.env.FEISHU_APP_SECRET = "secret_test";
process.env.BITABLE_APP_TOKEN = "apptok";
process.env.TABLE_ACTIVITIES = "tbl_act";
process.env.TABLE_PHOTOS = "tbl_photo";
process.env.TABLE_LINKS = "tbl_link";
process.env.TABLE_MEMBERS = "tbl_member";
process.env.TABLE_GROUPS = "tbl_group";
process.env.MEMBER_PASSCODE = "oao2026";
process.env.MEMBER_TOKEN = "session-token-123";

const calls = [];
function jsonRes(obj) {
  return { status: 200, ok: true, json: async () => obj };
}

async function mockFetch(url, opts) {
  const u = String(url);
  const method = (opts && opts.method) || "GET";
  calls.push({ u, method, opts });

  if (u.includes("/auth/v3/tenant_access_token/internal")) {
    return jsonRes({ code: 0, tenant_access_token: "TKN", expire: 3600 });
  }
  if (u.includes("/drive/v1/medias/upload_all")) {
    return jsonRes({ code: 0, data: { file_token: "ft1" } });
  }
  if (u.includes("/drive/v1/medias/batch_get_tmp_download_url")) {
    return jsonRes({ code: 0, data: { tmp_download_urls: [{ file_token: "ft1", tmp_download_url: "https://tmp.example/f1" }] } });
  }
  if (u.includes("/records/search")) {
    // 成员表：默认查不到（走新建分支）；学号 20260999 视为已存在（走更新分支）
    if (u.includes("tbl_member")) {
      const cond = JSON.parse((opts && opts.body) || "{}");
      const val = ((cond.filter || {}).conditions || [{}])[0].value || [];
      return jsonRes({
        code: 0,
        data: { items: val[0] === "20260999" ? [{ record_id: "mem1", fields: {} }] : [] },
      });
    }
    return jsonRes({ code: 0, data: { items: [{ record_id: "act1", fields: { 照片数: 3 } }] } });
  }
  if (u.includes("/records/") && method === "PUT") {
    return jsonRes({ code: 0, data: { record: { record_id: "act1" } } });
  }
  if (u.includes("/records") && method === "POST") {
    return jsonRes({ code: 0, data: { record: { record_id: "new1", fields: {} } } });
  }
  if (u.includes("/records") && method === "GET") {
    if (u.includes("tbl_member")) {
      return jsonRes({ code: 0, data: { items: [
        { record_id: "m1", fields: { 姓名: "甲", 技能: "拍照、修图", 职位: "社员" } },
        { record_id: "m2", fields: { 姓名: "乙", 技能: "剪视频、调色" } },
        { record_id: "m3", fields: { 姓名: "丙", 技能: "拍视频" } },
        { record_id: "m4", fields: { 姓名: "丁", 技能: "灯光、收音" } },
      ] } });
    }
    return jsonRes({ code: 0, data: { items: [{ record_id: "r1", fields: { 活动名称: "排球社合照" } }] } });
  }
  throw new Error("unexpected fetch: " + method + " " + u);
}
global.fetch = mockFetch;

const { main_handler } = require("./index.js");

function ev(method, path, body, headers) {
  return { httpMethod: method, path, headers: headers || {}, body: body || "" };
}

(async () => {
  // health
  let r = await main_handler(ev("GET", "/api/health"), {});
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(JSON.parse(r.body).ok, true);

  // auth：错误口令
  r = await main_handler(ev("POST", "/api/auth", JSON.stringify({ passcode: "wrong" })), {});
  assert.strictEqual(r.statusCode, 401);

  // auth：正确口令
  r = await main_handler(ev("POST", "/api/auth", JSON.stringify({ passcode: "oao2026" })), {});
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(JSON.parse(r.body).token, "session-token-123");

  // 只读：活动列表
  r = await main_handler(ev("GET", "/api/activities"), {});
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(JSON.parse(r.body).items.length, 1);

  // 公开：申请拍摄（无需登录）
  r = await main_handler(ev("POST", "/api/request", JSON.stringify({ name: "运动会", date: "2026.09", desc: "x" })), {});
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(JSON.parse(r.body).ok, true);

  // 写操作未登录 → 401
  r = await main_handler(ev("POST", "/api/photos", JSON.stringify({ activity: "x" })), {});
  assert.strictEqual(r.statusCode, 401);

  const auth = { authorization: "Bearer session-token-123" };

  // 贴网盘链接（登录）
  r = await main_handler(ev("POST", "/api/photos", JSON.stringify({ activity: "运动会", link: "https://pan.baidu.com/s/x", code: "abc" }), auth), {});
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(JSON.parse(r.body).ok, true);

  // 直接上传（登录）
  const b64 = Buffer.from("fakeimage").toString("base64");
  r = await main_handler(ev("POST", "/api/upload", JSON.stringify({ activity: "运动会", fileName: "a.jpg", mime: "image/jpeg", base64: b64, category: "sports" }), auth), {});
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(JSON.parse(r.body).fileToken, "ft1");

  // 校验 upload_all 走的是 FormData（multipart），且参数正确
  const up = calls.find((c) => c.u.includes("upload_all"));
  assert.ok(up, "upload_all 应被调用");
  const formBody = up.opts.body;
  assert.ok(formBody && typeof formBody.get === "function", "上传 body 应为 FormData");
  assert.strictEqual(formBody.get("parent_type"), "bitable_file", "parent_type 应为 bitable_file");
  assert.strictEqual(formBody.get("parent_node"), "apptok", "parent_node 默认应为 app_token");

  // 附件中转 → 302
  r = await main_handler(ev("GET", "/api/file/ft1"), {});
  assert.strictEqual(r.statusCode, 302);
  assert.strictEqual(r.headers.Location, "https://tmp.example/f1");

  // 成员名册含个人信息：未登录读也要 401（与其他只读接口不同）
  r = await main_handler(ev("GET", "/api/members"), {});
  assert.strictEqual(r.statusCode, 401, "未登录读成员名册应被拒绝");

  // 登录后可读
  r = await main_handler(ev("GET", "/api/members", "", auth), {});
  assert.strictEqual(r.statusCode, 200);

  // 未登录写成员资料 → 401
  r = await main_handler(ev("POST", "/api/members", JSON.stringify({ studentId: "20260101" })), {});
  assert.strictEqual(r.statusCode, 401, "未登录写成员资料应被拒绝");

  // 缺学号 → 400
  r = await main_handler(ev("POST", "/api/members", JSON.stringify({ name: "无学号" }), auth), {});
  assert.strictEqual(r.statusCode, 400, "缺学号应返回 400");

  // 新学号 → 新建
  r = await main_handler(ev("POST", "/api/members", JSON.stringify({
    name: "甲同学", klass: "G11-3", studentId: "20260101",
    gender: "无性别", role: "社员", skills: "拍照、调色",
  }), auth), {});
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(JSON.parse(r.body).updated, false, "新学号应走新建");

  // 已存在的学号 → 更新（upsert，不产生重复记录）
  r = await main_handler(ev("POST", "/api/members", JSON.stringify({
    name: "乙同学", studentId: "20260999", skills: "剪视频",
  }), auth), {});
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(JSON.parse(r.body).updated, true, "已有学号应走更新");

  /* ---- AI 自动分组：接口已预留，模型调用未实现 ---- */

  // 未登录 → 401
  r = await main_handler(ev("POST", "/api/group", JSON.stringify({ groupCount: 2 })), {});
  assert.strictEqual(r.statusCode, 401, "未登录分组应被拒绝");

  // groupCount 非法 → 400
  r = await main_handler(ev("POST", "/api/group", JSON.stringify({ groupCount: 1 }), auth), {});
  assert.strictEqual(r.statusCode, 400, "groupCount=1 应被拒绝");
  r = await main_handler(ev("POST", "/api/group", JSON.stringify({ groupCount: 99 }), auth), {});
  assert.strictEqual(r.statusCode, 400, "groupCount=99 应被拒绝");

  // 人数不够分 → 400（mock 里只有 4 个成员）
  r = await main_handler(ev("POST", "/api/group", JSON.stringify({ groupCount: 12 }), auth), {});
  assert.strictEqual(r.statusCode, 400, "人数不够应返回 400");
  assert.ok(JSON.parse(r.body).msg.includes("不够"), "应说明人数不够");

  // 参数合法但模型没接 → 501，且带机器可读的 code
  r = await main_handler(ev("POST", "/api/group", JSON.stringify({ groupCount: 2 }), auth), {});
  assert.strictEqual(r.statusCode, 501, "模型未配置应返回 501");
  const g = JSON.parse(r.body);
  assert.ok(g.code === "LLM_NOT_CONFIGURED" || g.code === "LLM_NOT_IMPLEMENTED",
    "501 应带 code，便于前端区分「还没接模型」和「真出错」");

  /* ---- 不信任模型输出：解析与约束校验 ---- */
  const { _parseGroupJson, _checkGroups } = require("./index.js");

  // 裹了 ```json 代码块也要能解析
  assert.strictEqual(
    _parseGroupJson('```json\n{"groups":[{"name":"第 1 组","members":["甲"]}]}\n```').length, 1,
    "应能剥掉代码块标记");
  // 前后带解释文字也要能解析
  assert.strictEqual(
    _parseGroupJson('好的，结果如下：{"groups":[{"name":"A","members":["甲"]}]} 希望有帮助').length, 1,
    "应能从解释文字里抠出 JSON");
  // 没有 groups 数组要报错
  assert.throws(() => _parseGroupJson('{"foo":1}'), /groups/, "缺 groups 应抛错");

  const roster = [
    { name: "甲", skills: ["拍照"] }, { name: "乙", skills: ["剪视频"] },
    { name: "丙", skills: ["调色"] }, { name: "丁", skills: ["灯光"] },
  ];
  // 合法结果 → 无警告
  assert.strictEqual(_checkGroups(
    [{ name: "A", members: ["甲", "乙"] }, { name: "B", members: ["丙", "丁"] }],
    roster, 2).length, 0, "合法分组不应有警告");
  // 漏人 / 重复 / 组数不对 / 人数不均，都要被抓出来
  let w = _checkGroups([{ name: "A", members: ["甲", "乙", "丙"] }, { name: "B", members: ["甲"] }], roster, 2);
  assert.ok(w.some((x) => x.includes("没被分到组")), "应抓出漏掉的人");
  assert.ok(w.some((x) => x.includes("多个组")), "应抓出重复分组的人");
  assert.ok(w.some((x) => x.includes("不均衡")), "应抓出人数不均");
  w = _checkGroups([{ name: "A", members: ["甲", "乙", "丙", "丁"] }], roster, 2);
  assert.ok(w.some((x) => x.includes("要求是 2 组")), "应抓出组数不对");
  w = _checkGroups([{ name: "A", members: ["甲", "乙"] }, { name: "B", members: ["丙", "戊"] }], roster, 2);
  assert.ok(w.some((x) => x.includes("名册上没有的人")), "应抓出模型编造的人名");

  // 分组留档表已配置：saveGroups 的写入格式（模型未接通，直接验字段映射）
  {
    const before = calls.length;
    const gs = [
      { name: "第 1 组", members: ["甲", "乙"], skills: ["拍照"], reason: "互补" },
      { name: "第 2 组", members: ["丙"], skills: ["调色"], reason: "" },
    ];
    const out = await require("./index.js")._saveGroups(gs);
    assert.strictEqual(out.saved, true, "配了 TABLE_GROUPS 就应该落库");
    assert.ok(out.batch, "应生成批次号");
    const writes = calls.slice(before).filter((c) => c.u.includes("tbl_group") && c.method === "POST");
    assert.strictEqual(writes.length, 2, "两个组应写两行");
    const f = JSON.parse(writes[0].opts.body).fields;
    assert.strictEqual(f["组名"], "第 1 组");
    assert.strictEqual(f["成员"], "甲、乙", "成员应顿号分隔");
    assert.strictEqual(f["技能覆盖"], "拍照");
    assert.strictEqual(f["批次"], out.batch, "同一批次号应串起所有行");
  }

  // 未知路由 → 404
  r = await main_handler(ev("GET", "/api/nope"), {});
  assert.strictEqual(r.statusCode, 404);

  // Cloudflare 入口：handle(req, env) 用传入的 env（而不是 process.env）
  {
    const { handle } = require("./index.js");
    const h = await handle({ method: "GET", path: "/api/health", headers: {}, body: "" }, {});
    assert.strictEqual(JSON.parse(h.body).mode, "missing-env", "传入空 env 时应报 missing-env");
    const a = await handle(
      { method: "POST", path: "/api/auth", headers: {}, body: JSON.stringify({ passcode: "cf-pass" }) },
      { MEMBER_PASSCODE: "cf-pass", MEMBER_TOKEN: "cf-token", FEISHU_APP_ID: "x", BITABLE_APP_TOKEN: "y" }
    );
    assert.strictEqual(JSON.parse(a.body).token, "cf-token", "应使用 handle 传入的 env");
    // 恢复测试用 env，避免影响后续断言
    await handle({ method: "GET", path: "/api/health", headers: {}, body: "" }, process.env);
  }

  // Workers 兼容性：index.js 不能 require Node 内置模块，也不能无保护地用 Buffer / process
  {
    const src = require("fs").readFileSync(__dirname + "/index.js", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(!/\brequire\(/.test(src), "index.js 不应 require 任何模块（Cloudflare 打包会失败）");
    const bufUses = src.split("\n").filter((l) => /\bBuffer\b/.test(l));
    assert.ok(bufUses.every((l) => /typeof Buffer|Buffer\.from\(clean/.test(l)), "Buffer 只能在 typeof 判断后使用");
  }

  console.log("✅ cloud-function 离线测试全部通过（共 " + calls.length + " 次 fetch 调用）");
})().catch((e) => {
  console.error("❌ 测试失败:", e && e.message);
  process.exit(1);
});
