/**
 * OAO 摄影社 · 腾讯云函数代理
 * ------------------------------------------------------------------
 * 作用：作为前端与飞书多维表格之间的薄代理，保存密钥、签发会话 token、
 *       转发读写请求。绝不把 App Secret 暴露到浏览器。
 *
 * 运行环境（同一份代码两处可用）：
 *   - Cloudflare Pages Functions（当前线上）：functions/api/[[path]].js 引入本文件，
 *     调用 handle(req, context.env)。只用 fetch / FormData / Blob / atob 等 Web 标准 API，
 *     不依赖任何 Node 内置模块，无需 nodejs_compat。
 *   - 腾讯云函数 SCF（可选备用）：Node.js 18+，入口 index.main_handler，环境变量走 process.env。
 * 本地调试：`node dev-server.js`（监听 9000，可配合前端 config.js 指向 http://localhost:9000）。
 *
 * 依赖环境变量（腾讯云函数“环境变量”里配置）：
 *   FEISHU_APP_ID        飞书应用 App ID
 *   FEISHU_APP_SECRET    飞书应用 App Secret
 *   BITABLE_APP_TOKEN    多维表格 app_token
 *   TABLE_ACTIVITIES     活动记录表的 table_id
 *   TABLE_PHOTOS         照片素材表的 table_id
 *   TABLE_LINKS          外链表的 table_id
 *   TABLE_MEMBERS        成员表 table_id
 *   TABLE_GROUPS         （可选）分组结果留档表 table_id；不配则分组结果不落库
 *   LLM_API_URL          （可选）大模型接口地址，默认 https://api.deepseek.com/chat/completions
 *   LLM_API_KEY          （可选）大模型 API Key，未配置时 /api/group 返回 501 —— 只放这里，绝不进前端
 *   LLM_MODEL            （可选）模型名，默认 deepseek-chat
 *   MEMBER_PASSCODE      成员统一访问口令（明文，仅存服务端）
 *   MEMBER_TOKEN         登录成功后签发的会话 token（随机长字符串，仅存服务端）
 *   ALLOWED_ORIGIN       CORS 允许来源，默认 "*"（生产可收紧为站点域名）
 *   —— v4 新增 ——
 *   TABLE_EVENTS         拍摄任务/赛程表 table_id（日历 + 报名）
 *   TABLE_APPLICATIONS   报名与交付表 table_id
 *   TABLE_AI_USAGE       AI用量表 table_id（每月 AI 花费计数；不配则所有 AI 功能拒绝调用，宁可不用也不超支）
 *   ADMIN_PASSCODE       管理员口令（在同一个「成员登录」框里输入即进入管理模式；明文，仅存服务端）
 *   ADMIN_TOKEN          管理员会话 token（随机长字符串，仅存服务端）
 *   AI_MONTHLY_CAP_CNY   （可选）AI 每月预算上限，默认 20（元）
 *   AI_STOP_AT_CNY       （可选）实际停用线，默认上限的 90%（即 18 元），留安全余量
 * ------------------------------------------------------------------
 */

"use strict";

const FEISHU = "https://open.feishu.cn/open-apis";

/* 环境变量：SCF 用 process.env；Cloudflare 每次请求把 context.env 传进 handle() 再刷新。
   同一部署内 env 不变，所以并发请求共用这个模块级对象是安全的。 */
function buildEnv(src) {
  src = src || {};
  const s = (k) => (src[k] == null ? "" : String(src[k]));
  return {
    appId: s("FEISHU_APP_ID"),
    appSecret: s("FEISHU_APP_SECRET"),
    appToken: s("BITABLE_APP_TOKEN"),
    // upload_all 的 parent_node：多数情况填多维表格 app_token；
    // 若上传报错，可改用表 table_id（通过环境变量 BITABLE_UPLOAD_PARENT_NODE 覆盖）。
    uploadParentNode: s("BITABLE_UPLOAD_PARENT_NODE") || s("BITABLE_APP_TOKEN"),
    tableActivities: s("TABLE_ACTIVITIES"),
    tablePhotos: s("TABLE_PHOTOS"),
    tableLinks: s("TABLE_LINKS"),
    tableMembers: s("TABLE_MEMBERS"),
    // 分组结果留档表。不配则分组照常可用，只是结果不落库。
    tableGroups: s("TABLE_GROUPS"),
    // AI 分组用。LLM_API_KEY 留空时 /api/group 会返回 501，其余接口不受影响。
    llmApiUrl: s("LLM_API_URL"),
    llmApiKey: s("LLM_API_KEY"),
    llmModel: s("LLM_MODEL"),
    passcode: s("MEMBER_PASSCODE"),
    token: s("MEMBER_TOKEN"),
    origin: s("ALLOWED_ORIGIN") || "*",
    // v4
    tableEvents: s("TABLE_EVENTS"),
    tableApplications: s("TABLE_APPLICATIONS"),
    tableAiUsage: s("TABLE_AI_USAGE"),
    adminPasscode: s("ADMIN_PASSCODE"),
    adminToken: s("ADMIN_TOKEN"),
    aiCap: Number(s("AI_MONTHLY_CAP_CNY")) > 0 ? Number(s("AI_MONTHLY_CAP_CNY")) : 20,
    aiStopAt: Number(s("AI_STOP_AT_CNY")) > 0 ? Number(s("AI_STOP_AT_CNY")) : 0,
  };
}
let ENV = buildEnv(typeof process !== "undefined" && process.env ? process.env : {});

/* ------------------------------------------------------------------ *
 * 字段名（必须与 SETUP.md 建表时一致；如你改了列名，改这里即可）
 * ------------------------------------------------------------------ */
const F = {
  activity: {
    name: "活动名称",
    date: "日期",
    unit: "组别",
    status: "状态",
    type: "类型",
    photoCount: "照片数",
    videoCount: "视频数",
    desc: "描述",
    cover: "封面",
    link: "网盘链接",
    code: "提取码",
  },
  photo: {
    activity: "活动",
    file: "文件",
    link: "网盘链接",
    code: "提取码",
    category: "分类",
    note: "说明",
  },
  link: {
    platform: "平台",
    title: "标题",
    url: "链接",
    note: "备注",
  },
  group: {
    batch: "批次",
    name: "组名",
    members: "成员",
    skills: "技能覆盖",
    reason: "说明",
  },
  member: {
    name: "姓名",
    klass: "班级",
    studentId: "学号",
    gender: "性别",
    role: "职位",
    skills: "技能",
    note: "备注",
  },
};
/* v4 新表的字段名（前端 events.js 不直接读飞书字段，只有后端用；与 tools/feishu/schema.py 保持一致） */
Object.assign(F, {
  // v4：拍摄任务 / 赛程（日历上的每一格）
  event: {
    title: "名称",
    category: "类别",
    date: "日期",
    time: "时间",
    place: "地点",
    need: "需要人数",
    status: "状态",
    note: "备注",
    seedKey: "种子键",
    source: "来源申请",
    casC: "CAS-C", // v4.1：CAS 时间（小时），0.5 一档
    casS: "CAS-S",
  },
  // v4：报名与交付（一人报一个任务 = 一行）
  app: {
    name: "成员姓名",
    studentId: "学号",
    eventId: "任务ID",
    eventTitle: "任务名称",
    status: "状态",
    link: "百度网盘链接",
    code: "提取码",
    desc: "描述",
    caption: "AI文案",
    appliedAt: "报名时间",
    submittedAt: "提交时间",
    adminNote: "管理备注",
  },
  // v4：AI 用量（每月 × 每个功能一行）
  usage: {
    key: "键",
    month: "月份",
    feature: "功能",
    calls: "调用次数",
    inTokens: "输入tokens",
    outTokens: "输出tokens",
    cost: "费用元",
    day: "当日",
    dayCalls: "当日次数",
  },
});

/* ------------------------------------------------------------------ *
 * 飞书 access_token 缓存（云函数实例可能热缓存，避免每次换 token）
 * ------------------------------------------------------------------ */
// Cloudflare 上每个 isolate 各自缓存一份（isolate 之间不共享，冷启动时会重新换一次，属正常）
let tokenCache = { value: "", expireAt: 0, appId: "" };

async function getTenantToken() {
  if (tokenCache.value && tokenCache.appId === ENV.appId && Date.now() < tokenCache.expireAt - 60 * 1000) {
    return tokenCache.value;
  }
  const res = await fetch(`${FEISHU}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: ENV.appId, app_secret: ENV.appSecret }),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`获取 tenant_access_token 失败: ${json.msg}`);
  tokenCache = { value: json.tenant_access_token, expireAt: Date.now() + json.expire * 1000, appId: ENV.appId };
  return tokenCache.value;
}

async function feishu(path, opts = {}) {
  const token = await getTenantToken();
  const res = await fetch(`${FEISHU}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  let json;
  try {
    json = await res.json();
  } catch (e) {
    json = { code: res.status, msg: `响应解析失败 (HTTP ${res.status})` };
  }
  if (json.code !== 0) {
    throw new Error(`飞书接口错误 [${json.code}] ${json.msg || JSON.stringify(json)}`);
  }
  return json;
}

function bitableRecordsUrl(table) {
  return `/bitable/v1/apps/${ENV.appToken}/tables/${table}/records`;
}

/* ------------------------------------------------------------------ *
 * 把飞书记录列表转成前端友好的精简结构
 * ------------------------------------------------------------------ */
function recordToItem(record) {
  const fields = record.fields || {};
  return { id: record.record_id, fields };
}

function attachmentTokens(field) {
  if (!Array.isArray(field)) return [];
  return field.map((a) => a.file_token).filter(Boolean);
}

async function listRecords(table) {
  const url = `${bitableRecordsUrl(table)}?page_size=100`;
  const json = await feishu(url);
  const items = (json.data.items || []).map(recordToItem);
  // MVP 只取前 100 条；数据量增大后可在前端分页拉取。
  return items;
}

async function searchActivitiesByName(name) {
  const json = await feishu(`${bitableRecordsUrl(ENV.tableActivities)}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      filter: {
        conjunction: "and",
        conditions: [{ field_name: F.activity.name, operator: "is", value: [name] }],
      },
    }),
  });
  return (json.data.items || []).map(recordToItem);
}

async function searchMemberByStudentId(studentId) {
  const json = await feishu(`${bitableRecordsUrl(ENV.tableMembers)}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      filter: {
        conjunction: "and",
        conditions: [{ field_name: F.member.studentId, operator: "is", value: [studentId] }],
      },
    }),
  });
  return (json.data.items || []).map(recordToItem);
}

async function createRecord(table, fields) {
  const json = await feishu(bitableRecordsUrl(table), {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ fields }),
  });
  return json.data.record;
}

async function updateRecord(table, recordId, fields) {
  const json = await feishu(`${bitableRecordsUrl(table)}/${recordId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ fields }),
  });
  return json.data.record;
}

/* ------------------------------------------------------------------ *
 * 上传文件到多维表格附件字段，返回 file_token
 * 前端把文件转 base64 后 POST /api/upload，这里还原成二进制再走飞书 upload_all。
 * ------------------------------------------------------------------ */
/* base64 → 字节。Node（SCF）用 Buffer；Workers 优先用原生 Uint8Array.fromBase64，退回 atob。 */
function base64ToBytes(b64) {
  // 前端发来的是标准 base64（FileReader.readAsDataURL），不做逐字符清洗，省 CPU
  const clean = String(b64 || "").trim();
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(clean, "base64"));
  if (typeof Uint8Array.fromBase64 === "function") return Uint8Array.fromBase64(clean);
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64ToUtf8(b64) {
  return new TextDecoder().decode(base64ToBytes(b64));
}

// 飞书 upload_all 单文件上限 20MB
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

async function uploadMedia(fileName, mime, base64) {
  const buf = base64ToBytes(base64);
  if (!buf.length) throw new Error("文件内容为空");
  if (buf.length > MAX_UPLOAD_BYTES) throw new Error("单个文件不能超过 20MB（飞书限制），大文件请走网盘链接");
  const token = await getTenantToken();
  const form = new FormData();
  form.append("file_name", fileName);
  form.append("parent_type", "bitable_file");
  form.append("parent_node", ENV.uploadParentNode);
  form.append("size", String(buf.length));
  form.append("file", new Blob([buf], { type: mime || "application/octet-stream" }), fileName);

  const res = await fetch(`${FEISHU}/drive/v1/medias/upload_all`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`文件上传失败 [${json.code}] ${json.msg}`);
  return json.data.file_token;
}

/* ------------------------------------------------------------------ *
 * 附件下载中转：返回 302 到飞书临时下载地址，token 不落前端。
 * ------------------------------------------------------------------ */
// 临时下载地址有效期约 24 小时；按 isolate 缓存 30 分钟，减少飞书接口调用（相册一次会加载很多图）
const downloadCache = new Map();
const DOWNLOAD_TTL = 30 * 60 * 1000;

async function mediaDownload(fileToken) {
  const hitCache = downloadCache.get(fileToken);
  if (hitCache && hitCache.expireAt > Date.now()) return hitCache.url;
  const url = await fetchTmpDownloadUrl(fileToken);
  if (downloadCache.size > 500) downloadCache.clear();
  downloadCache.set(fileToken, { url, expireAt: Date.now() + DOWNLOAD_TTL });
  return url;
}

async function fetchTmpDownloadUrl(fileToken) {
  // 注意：/medias/:token/download 直接返回文件二进制（不是 JSON），
  // 要拿临时下载地址得用 batch_get_tmp_download_url（有效期约 24 小时）。
  const json = await feishu(
    `/drive/v1/medias/batch_get_tmp_download_url?file_tokens=${encodeURIComponent(fileToken)}`
  );
  const hit = ((json.data && json.data.tmp_download_urls) || [])[0];
  if (!hit || !hit.tmp_download_url) throw new Error("未找到该附件的下载地址");
  return hit.tmp_download_url;
}

/* ------------------------------------------------------------------ *
 * 响应工具（腾讯云 API 网关要求返回 {statusCode, headers, body}）
 * ------------------------------------------------------------------ */
function corsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": ENV.origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
}

function respond(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    isBase64Encoded: false,
    headers: { ...corsHeaders(), ...extraHeaders },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

/* ------------------------------------------------------------------ *
 * 解析腾讯云 API 网关事件为统一请求对象
 * ------------------------------------------------------------------ */
function parseRequest(event) {
  const rc = event.requestContext || {};
  const http = rc.http || {};
  const method = (event.httpMethod || http.method || rc.httpMethod || "GET").toUpperCase();
  const path = event.path || event.rawPath || http.path || "/";
  const headers = event.headers || {};
  let body = event.body || "";
  if (event.isBase64Encoded) body = base64ToUtf8(body);
  const query = event.queryString || event.queryStringParameters || {};
  return { method, path, headers, body, query };
}

function bearer(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  return auth.replace(/^Bearer\s+/i, "");
}
/* 定长比较，避免按字符提前返回泄露信息（Workers / Node 通用，不依赖 crypto） */
function sameStr(a, b) {
  a = String(a || ""); b = String(b || "");
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0 && a.length > 0;
}
/* v4：管理员。只认服务端的 ADMIN_TOKEN；没配就永远不是管理员。 */
function isAdmin(req) {
  const t = bearer(req);
  return !!(ENV.adminToken && t && sameStr(t, ENV.adminToken));
}
/* 成员：成员 token 或管理员 token 都算（管理员同时拥有成员权限） */
function isAuthed(req) {
  const t = bearer(req);
  return !!(t && ((ENV.token && sameStr(t, ENV.token)) || isAdmin(req)));
}

/* ------------------------------------------------------------------ *
 * 路由
 * ------------------------------------------------------------------ */
async function route(req) {
  const { method, path, body } = req;

  // 健康检查
  if (path === "/" || path === "/api/health") {
    return respond(200, {
      ok: true,
      mode: ENV.appId && ENV.appToken ? "connected" : "missing-env",
      time: new Date().toISOString(),
    });
  }

  // 登录：口令换会话 token
  if (path === "/api/auth" && method === "POST") {
    let passcode = "";
    try {
      passcode = (JSON.parse(body || "{}").passcode || "").toString();
    } catch (e) {
      passcode = "";
    }
    // v4：管理员口令输在同一个框里。界面上没有单独的管理员入口。
    if (ENV.adminPasscode && ENV.adminToken && sameStr(passcode, ENV.adminPasscode)) {
      return respond(200, { ok: true, token: ENV.adminToken, role: "admin" });
    }
    if (ENV.passcode && sameStr(passcode, ENV.passcode)) {
      return respond(200, { ok: true, token: ENV.token, role: "member" });
    }
    return respond(401, { ok: false, msg: "口令不正确" });
  }

  // 只读接口
  if (path === "/api/activities" && method === "GET") {
    const items = await listRecords(ENV.tableActivities);
    return respond(200, { ok: true, items });
  }
  if (path === "/api/photos" && method === "GET") {
    const items = await listRecords(ENV.tablePhotos);
    return respond(200, { ok: true, items });
  }
  // 成员名册：含学号/姓名/班级，属于个人信息，读也要求登录（与其他只读接口不同）
  if (path === "/api/members" && method === "GET") {
    if (!isAuthed(req)) {
      return respond(401, { ok: false, msg: "需要成员登录" });
    }
    const items = await listRecords(ENV.tableMembers);
    return respond(200, { ok: true, items });
  }

  if (path === "/api/links" && method === "GET") {
    const items = await listRecords(ENV.tableLinks);
    return respond(200, { ok: true, items });
  }

  // 附件中转：/api/file/:file_token
  const fileMatch = path.match(/^\/api\/file\/([^/]+)$/);
  if (fileMatch && method === "GET") {
    const url = await mediaDownload(fileMatch[1]);
    return respond(302, "", {
      Location: url,
      "Content-Type": "text/plain; charset=utf-8",
      // 浏览器私有缓存 25 分钟（短于临时地址有效期），同一张图不必反复问飞书
      "Cache-Control": "private, max-age=1500",
    });
  }

  // 公开的“申请拍摄”表单：无需登录，写入活动记录表，状态默认待选片。
  // 定位是“给其他社团/活动负责人提交拍摄申请”，成员再在飞书里整理。
  if (path === "/api/request" && method === "POST") {
    const d = JSON.parse(body || "{}");
    const fields = {};
    if (d.name) fields[F.activity.name] = d.name;
    if (d.date) fields[F.activity.date] = d.date;
    if (d.desc) fields[F.activity.desc] = d.desc;
    fields[F.activity.status] = d.status || "待选片";
    fields[F.activity.unit] = d.unit || "照片组";
    fields[F.activity.type] = d.type || "其他";
    const record = await createRecord(ENV.tableActivities, fields);
    return respond(200, { ok: true, record: recordToItem(record) });
  }

  // v4：日历 / 报名 / 交付 / 管理后台 / AI（见 routeV4）
  const v4 = await routeV4(req);
  if (v4) return v4;

  // 已知写接口（其余路径一律 404，避免向未登录者泄露“需登录”信息）
  const isWrite =
    (path === "/api/activities" && method === "POST") ||
    (path === "/api/photos" && method === "POST") ||
    (path === "/api/upload" && method === "POST") ||
    (path === "/api/links" && method === "POST") ||
    (path === "/api/members" && method === "POST") ||
    (path === "/api/group" && method === "POST");

  if (!isWrite) {
    return respond(404, { ok: false, msg: `未知接口 ${method} ${path}` });
  }

  // 写操作都需要登录
  if (!isAuthed(req)) {
    return respond(401, { ok: false, msg: "需要成员登录" });
  }

  // 新增活动记录（成员端，需登录）
  if (path === "/api/activities" && method === "POST") {
    const d = JSON.parse(body || "{}");
    const fields = {};
    if (d.name) fields[F.activity.name] = d.name;
    if (d.date) fields[F.activity.date] = d.date;
    if (d.unit) fields[F.activity.unit] = d.unit;
    if (d.status) fields[F.activity.status] = d.status;
    if (d.type) fields[F.activity.type] = d.type;
    if (d.desc) fields[F.activity.desc] = d.desc;
    if (d.link) fields[F.activity.link] = d.link;
    if (d.code) fields[F.activity.code] = d.code;
    if (d.photoCount != null) fields[F.activity.photoCount] = Number(d.photoCount) || 0;
    if (d.videoCount != null) fields[F.activity.videoCount] = Number(d.videoCount) || 0;
    const record = await createRecord(ENV.tableActivities, fields);
    return respond(200, { ok: true, record: recordToItem(record) });
  }

  // 新增照片记录（贴网盘链接，或已有 file_token）
  if (path === "/api/photos" && method === "POST") {
    const d = JSON.parse(body || "{}");
    const fields = {};
    if (d.activity) fields[F.photo.activity] = d.activity;
    if (d.link) fields[F.photo.link] = d.link;
    if (d.code) fields[F.photo.code] = d.code;
    if (d.category) fields[F.photo.category] = d.category;
    if (d.note) fields[F.photo.note] = d.note;
    if (d.fileToken) fields[F.photo.file] = [{ file_token: d.fileToken }];
    const record = await createRecord(ENV.tablePhotos, fields);

    // 同步：该活动照片数 +1（尽力而为，找不到同名活动也不报错）
    if (d.activity && !d.photoAlreadyCounted) {
      try {
        await incrementActivityPhotoCount(d.activity);
      } catch (e) {
        /* 忽略同步失败，不阻断主流程 */
      }
    }
    return respond(200, { ok: true, record: recordToItem(record) });
  }

  // 上传文件并入库（前端读 base64 → 这里传飞书 → 建照片记录）
  if (path === "/api/upload" && method === "POST") {
    const d = JSON.parse(body || "{}");
    if (!d.base64 || !d.fileName) {
      return respond(400, { ok: false, msg: "缺少文件内容" });
    }
    const fileToken = await uploadMedia(d.fileName, d.mime, d.base64);
    const fields = {};
    if (d.activity) fields[F.photo.activity] = d.activity;
    if (d.category) fields[F.photo.category] = d.category;
    if (d.note) fields[F.photo.note] = d.note;
    fields[F.photo.file] = [{ file_token: fileToken }];
    const record = await createRecord(ENV.tablePhotos, fields);

    if (d.activity) {
      try {
        await incrementActivityPhotoCount(d.activity);
      } catch (e) {
        /* 忽略同步失败 */
      }
    }
    return respond(200, { ok: true, record: recordToItem(record), fileToken });
  }

  // 新增外链
  if (path === "/api/links" && method === "POST") {
    const d = JSON.parse(body || "{}");
    const fields = {};
    if (d.platform) fields[F.link.platform] = d.platform;
    if (d.title) fields[F.link.title] = d.title;
    if (d.url) fields[F.link.url] = d.url;
    if (d.note) fields[F.link.note] = d.note;
    const record = await createRecord(ENV.tableLinks, fields);
    return respond(200, { ok: true, record: recordToItem(record) });
  }

  // 成员资料：按学号 upsert —— 同一个学号重复提交视为更新，不产生重复记录
  if (path === "/api/members" && method === "POST") {
    const d = JSON.parse(body || "{}");
    const studentId = (d.studentId || "").toString().trim();
    if (!studentId) {
      return respond(400, { ok: false, msg: "缺少学号" });
    }
    const fields = {};
    if (d.name) fields[F.member.name] = d.name;
    if (d.klass) fields[F.member.klass] = d.klass;
    fields[F.member.studentId] = studentId;
    if (d.gender) fields[F.member.gender] = d.gender;
    if (d.role) fields[F.member.role] = d.role;
    if (d.skills) fields[F.member.skills] = d.skills;
    if (d.note) fields[F.member.note] = d.note;

    const existing = await searchMemberByStudentId(studentId);
    const record = existing.length
      ? await updateRecord(ENV.tableMembers, existing[0].id, fields)
      : await createRecord(ENV.tableMembers, fields);
    return respond(200, { ok: true, updated: existing.length > 0, record: recordToItem(record) });
  }

  /*
   * AI 自动分组（需登录）。
   * 结果目前只返回给前端，不落库 —— 「分组结果存哪」还没定（见 HANDOVER.md 第十一节）。
   * 要留档的话，在这里加一次 createRecord 写进「分组」表即可，其余逻辑不用动。
   */
  if (path === "/api/group" && method === "POST") {
    const d = JSON.parse(body || "{}");
    const groupCount = Math.floor(Number(d.groupCount));
    if (!groupCount || groupCount < 2 || groupCount > 20) {
      return respond(400, { ok: false, msg: "groupCount 需要是 2–20 之间的整数" });
    }

    const members = membersForPrompt(await listRecords(ENV.tableMembers));
    if (members.length < groupCount) {
      return respond(400, {
        ok: false,
        msg: `只有 ${members.length} 人登记了资料，不够分成 ${groupCount} 组`,
      });
    }

    const prompt = buildGroupPrompt(members, groupCount, (d.note || "").toString().trim());

    let raw;
    try {
      raw = (await aiCall("group", prompt, 2000)).text;
    } catch (e) {
      if (e.code === "AI_BUDGET" || e.code === "AI_RATE") return respond(429, { ok: false, code: e.code, msg: e.message });
      // 未配置 / 未实现都返回 501，让前端能明确区分「还没接模型」和「真出错了」
      if (e.code === "LLM_NOT_CONFIGURED" || e.code === "LLM_NOT_IMPLEMENTED") {
        return respond(501, { ok: false, code: e.code, msg: e.message });
      }
      return respond(502, { ok: false, msg: "模型调用失败：" + e.message });
    }

    let groups;
    try {
      groups = parseGroupJson(raw);
    } catch (e) {
      return respond(502, { ok: false, msg: "模型返回的不是合法 JSON：" + e.message });
    }

    const warnings = checkGroups(groups, members, groupCount);

    let saved = { saved: false, batch: "" };
    try {
      saved = await saveGroups(groups);
    } catch (e) {
      warnings.push("分组算出来了，但写入留档表失败：" + e.message);
    }

    return respond(200, {
      ok: true, groups, warnings, model: ENV.llmModel, source: "llm",
      saved: saved.saved, batch: saved.batch,
    });
  }

  return respond(404, { ok: false, msg: `未知接口 ${method} ${path}` });
}

/* ------------------------------------------------------------------ *
 * AI 自动分组
 *
 * 这一段除了 callModel() 之外全部实现好了：读成员、拼 Prompt、解析结果、
 * 校验硬约束。要接模型只需要把 callModel() 填上 —— 见函数上方注释。
 * ------------------------------------------------------------------ */

/* 把成员记录压成给模型看的紧凑结构，只带分组需要的字段。
   学号是个人信息，分组用不到，不发给模型。 */
function membersForPrompt(items) {
  return items.map((m) => {
    const f = m.fields || {};
    return {
      name: String(f[F.member.name] || "").trim(),
      role: String(f[F.member.role] || "").trim(),
      skills: String(f[F.member.skills] || "")
        .split(/[、,，]/).map((t) => t.trim()).filter(Boolean),
    };
  }).filter((m) => m.name);
}

function buildGroupPrompt(members, groupCount, note) {
  const roster = members
    .map((m, i) => `${i + 1}. ${m.name}${m.role ? `（${m.role}）` : ""} — 技能：${m.skills.join("、") || "未填"}`)
    .join("\n");

  return [
    "你在给一个学生摄影社团分组。请把下面的成员分成技能互补的小组。",
    "",
    `成员共 ${members.length} 人：`,
    roster,
    "",
    "硬性要求：",
    `1. 恰好分成 ${groupCount} 组；`,
    "2. 每个人只能出现在一个组里，且所有人都必须被分到组；",
    "3. 各组人数尽量均衡，相差不超过 1 人；",
    "4. 每组尽量同时具备拍摄类和后期类技能，不要把同一种技能的人堆在一组。",
    note ? `5. 额外要求：${note}` : "",
    "",
    "只输出 JSON，不要输出任何解释文字或代码块标记，格式：",
    '{"groups":[{"name":"第 1 组","members":["姓名A","姓名B"],"reason":"一句话说明为什么这么组"}]}',
  ].filter(Boolean).join("\n");
}

/*
 * ⚠️ 唯一没实现的地方 —— 接手的同学在这里填。
 *
 * 入参是拼好的 Prompt 字符串，要求返回模型输出的**纯文本**（后面会 JSON.parse）。
 * 两家的请求格式不一样，按你们最后选的那家写：
 *
 *  DeepSeek（OpenAI 兼容）：
 *    POST ${ENV.llmApiUrl}                       例：https://api.deepseek.com/chat/completions
 *    headers: { Authorization: `Bearer ${ENV.llmApiKey}`, "Content-Type": "application/json" }
 *    body:    { model: ENV.llmModel, messages: [{ role: "user", content: prompt }],
 *               response_format: { type: "json_object" } }
 *    取值:    json.choices[0].message.content
 *
 *  Claude（Anthropic Messages API）：
 *    POST https://api.anthropic.com/v1/messages
 *    headers: { "x-api-key": ENV.llmApiKey, "anthropic-version": "2023-06-01",
 *               "Content-Type": "application/json" }
 *    body:    { model: ENV.llmModel, max_tokens: 4096,
 *               messages: [{ role: "user", content: prompt }] }
 *    取值:    json.content[0].text
 *
 * 密钥只读 ENV，永远不要把它传回前端。
 */
async function callModel(prompt, maxTokens) {
  // 只有 Key 是必填；地址和模型默认用 DeepSeek 最便宜的 deepseek-chat
  // （2026-10 起 deepseek-chat 由 DeepSeek-V4.1-Flash 的非思考模式提供服务，按 Flash 价计费）
  const url = ENV.llmApiUrl || "https://api.deepseek.com/chat/completions";
  const model = ENV.llmModel || "deepseek-chat";
  if (!ENV.llmApiKey) {
    const err = new Error("尚未配置大模型：请在云函数环境变量里设置 LLM_API_KEY");
    err.code = "LLM_NOT_CONFIGURED";
    throw err;
  }

  // 省钱设置：不重试（失败直接报错，避免重复扣费）、限制输出长度、低温度
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${ENV.llmApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: maxTokens || 2000,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "模型响应超时（45 秒）" : "无法连接模型接口");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // 错误信息里绝不带 Key
    const hints = { 401: "API Key 无效", 402: "DeepSeek 账户余额不足，请充值", 429: "请求太频繁，请稍后再试" };
    throw new Error(hints[res.status] || `模型接口返回 ${res.status}`);
  }
  const json = await res.json();
  const text = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  const usage = (json && json.usage) || {};
  if (!text) {
    const err = new Error("模型返回为空");
    err.usage = usage;
    throw err;
  }
  return { text, usage };
}

/* 模型可能裹上 ```json 代码块，或在 JSON 前后带解释文字，这里都兜住 */
function parseGroupJson(text) {
  let t = String(text || "").trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  const parsed = JSON.parse(t);
  if (!parsed || !Array.isArray(parsed.groups)) {
    throw new Error("模型返回的 JSON 里没有 groups 数组");
  }
  return parsed.groups;
}

/* 硬约束校验。模型给的结果不一定守规矩，这里挑出问题交给人看，而不是照单全收。 */
function checkGroups(groups, members, groupCount) {
  const warnings = [];
  const all = members.map((m) => m.name);
  const seen = [];
  groups.forEach((g) => (g.members || []).forEach((n) => seen.push(n)));

  if (groups.length !== groupCount) {
    warnings.push(`模型分出了 ${groups.length} 组，要求是 ${groupCount} 组`);
  }
  const missing = all.filter((n) => seen.indexOf(n) < 0);
  if (missing.length) warnings.push(`有人没被分到组：${missing.join("、")}`);

  const dup = seen.filter((n, i) => seen.indexOf(n) !== i);
  if (dup.length) warnings.push(`有人被分进多个组：${[...new Set(dup)].join("、")}`);

  const unknown = seen.filter((n) => all.indexOf(n) < 0);
  if (unknown.length) warnings.push(`出现了名册上没有的人：${[...new Set(unknown)].join("、")}`);

  const sizes = groups.map((g) => (g.members || []).length);
  if (sizes.length && Math.max(...sizes) - Math.min(...sizes) > 1) {
    warnings.push(`各组人数不均衡：${sizes.join(" / ")}`);
  }

  const skillOf = {};
  members.forEach((m) => (skillOf[m.name] = m.skills));
  groups.forEach((g) => {
    const s = [];
    (g.members || []).forEach((n) => (skillOf[n] || []).forEach((k) => s.push(k)));
    g.skills = [...new Set(s)];
    if (!g.skills.length) warnings.push(`${g.name || "某组"}没有任何已登记的技能`);
  });

  return warnings;
}

/*
 * 把一次分组的结果写进「分组」表，每组一行，用同一个批次号串起来。
 * 留档是附加动作：没配 TABLE_GROUPS 就跳过，写失败也只回一条警告，
 * 不能让「存不下来」把「算出来了」这件事一起搞砸。
 */
async function saveGroups(groups) {
  if (!ENV.tableGroups) return { saved: false, batch: "" };
  const batch = new Date().toISOString().replace("T", " ").slice(0, 19);
  for (const g of groups) {
    await createRecord(ENV.tableGroups, {
      [F.group.batch]: batch,
      [F.group.name]: String(g.name || ""),
      [F.group.members]: (g.members || []).join("、"),
      [F.group.skills]: (g.skills || []).join("、"),
      [F.group.reason]: String(g.reason || ""),
    });
  }
  return { saved: true, batch };
}

async function incrementActivityPhotoCount(activityName) {
  const matches = await searchActivitiesByName(activityName);
  if (!matches.length) return;
  const rec = matches[0];
  const cur = Number((rec.fields && rec.fields[F.activity.photoCount]) || 0);
  await updateRecord(ENV.tableActivities, rec.id, { [F.activity.photoCount]: cur + 1 });
}

/* ================================================================== *
 * v4：拍摄日历 · 报名 · 交付 · 管理后台 · AI（带每月预算）
 * ------------------------------------------------------------------
 * 数据放在三张新表里（不碰 v3 的五张表）：
 *   拍摄任务 TABLE_EVENTS / 报名与交付 TABLE_APPLICATIONS / AI用量 TABLE_AI_USAGE
 * 权限：
 *   GET /api/events                     站点密码即可（日历只读，只给人数不给名单）
 *   成员（MEMBER_TOKEN 或 ADMIN_TOKEN）  报名 / 我的任务 / 交付 / 取消 / AI 润色文案
 *   管理员（只认 ADMIN_TOKEN）           /api/admin/*：统计、全流程、排任务、确认、验收、转申请、AI
 * 时间一律按北京时间（UTC+8）算。
 * ================================================================== */
const EVENT_CATEGORIES = ["篮球", "足球", "匹克球", "乒乓球", "长绳", "文化周", "其他"];
const EVENT_STATUS = ["开放报名", "已安排", "已结束", "已取消"];
const APP_STATUS = ["已报名", "已确认", "已交付", "已验收", "已退回", "已取消"];
const CN_OFFSET = 8 * 3600 * 1000;

function parseBody(body) {
  try { const d = JSON.parse(body || "{}"); return d && typeof d === "object" ? d : {}; } catch (e) { return {}; }
}
function clip(v, n) { return String(v == null ? "" : v).trim().slice(0, n); }
function fstr(fields, key) {
  const v = fields ? fields[key] : undefined;
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" ? x.text || x.name || "" : String(x))).join("");
  if (typeof v === "object") return v.text || v.name || "";
  return String(v);
}
function fnum(fields, key) {
  const n = Number(fields ? fields[key] : NaN);
  return isFinite(n) ? n : 0;
}
/* v4.1 CAS 时间：0.5–5，0.5 一档；新任务默认 C 1 / S 1。
 * 飞书列表接口把数字返回成字符串（"1.5"），手动在飞书里改的值也照样显示；空格子按默认 1 显示。 */
const CAS_DEFAULT = 1, CAS_MIN = 0.5, CAS_MAX = 5;
function casRead(fields, key) {
  const v = fields ? fields[key] : null;
  if (v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length)) return CAS_DEFAULT;
  const n = Number(Array.isArray(v) ? fstr(fields, key) : typeof v === "object" ? (v.text || v.value) : v);
  return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : CAS_DEFAULT;
}
function casValid(v) {
  if (typeof v === "boolean" || v == null || (typeof v === "string" && !v.trim())) return null;
  const n = Number(v);
  if (!isFinite(n) || n < CAS_MIN || n > CAS_MAX || Math.abs(n * 2 - Math.round(n * 2)) > 1e-9) return null;
  return Math.round(n * 2) / 2;
}

async function listAll(table) {
  let out = [], pageToken = "";
  for (let i = 0; i < 20; i++) {
    const url = `${bitableRecordsUrl(table)}?page_size=500${pageToken ? "&page_token=" + encodeURIComponent(pageToken) : ""}`;
    const json = await feishu(url);
    out = out.concat((json.data.items || []).map(recordToItem));
    if (!json.data.has_more || !json.data.page_token) break;
    pageToken = json.data.page_token;
  }
  return out;
}
async function getRecord(table, id) {
  if (!/^rec[A-Za-z0-9]+$/.test(String(id || ""))) return null;
  try {
    const json = await feishu(`${bitableRecordsUrl(table)}/${id}`);
    return json.data && json.data.record ? recordToItem(json.data.record) : null;
  } catch (e) {
    return null;
  }
}

/* —— 时间（北京时间）—— */
function cnParts(ms) {
  const d = new Date((ms == null ? Date.now() : ms) + CN_OFFSET);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() };
}
const pad2 = (n) => String(n).padStart(2, "0");
function cnToday(ms) { const p = cnParts(ms); return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`; }
function cnMonth(ms) { const p = cnParts(ms); return `${p.y}-${pad2(p.m)}`; }
function cnStamp(ms) { const p = cnParts(ms); return `${p.y}-${pad2(p.m)}-${pad2(p.d)} ${pad2(p.h)}:${pad2(p.min)}`; }
function addDays(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}
/* 日期统一成 YYYY-MM-DD：接受 2026-10-12 / 2026.10.12 / 2026/10/12 / 飞书日期字段（毫秒） */
function normDate(v) {
  if (typeof v === "number" && v > 1e11) return cnToday(v);
  const m = String(v || "").trim().match(/^(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})/);
  if (!m) return "";
  return `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`;
}
/* 「11:50-12:20」→ 起止时间戳；「放学」按 15:30–17:30；没写时间按全天 */
function eventWindow(date, time) {
  const ymd = normDate(date);
  if (!ymd) return { start: 0, end: 0 };
  const [y, m, d] = ymd.split("-").map(Number);
  const at = (h, mi) => Date.UTC(y, m - 1, d, h, mi) - CN_OFFSET;
  const t = String(time || "");
  const mm = t.match(/(\d{1,2})[:：](\d{2})\s*[-–~至]\s*(\d{1,2})[:：](\d{2})/);
  if (mm) return { start: at(+mm[1], +mm[2]), end: at(+mm[3], +mm[4]) };
  const one = t.match(/(\d{1,2})[:：](\d{2})/);
  if (one) return { start: at(+one[1], +one[2]), end: at(+one[1] + 1, +one[2]) };
  if (/放学/.test(t)) return { start: at(15, 30), end: at(17, 30) };
  return { start: at(0, 0), end: at(23, 59) };
}

function eventView(rec) {
  const f = rec.fields || {};
  const date = normDate(f[F.event.date]);
  const time = fstr(f, F.event.time);
  const w = eventWindow(date, time);
  return {
    id: rec.id,
    title: fstr(f, F.event.title),
    category: fstr(f, F.event.category) || "其他",
    date, time,
    place: fstr(f, F.event.place),
    need: fnum(f, F.event.need) || 0,
    status: fstr(f, F.event.status) || "开放报名",
    note: fstr(f, F.event.note),
    source: fstr(f, F.event.source),
    casC: casRead(f, F.event.casC),
    casS: casRead(f, F.event.casS),
    start: w.start, end: w.end,
    ended: !!w.end && Date.now() >= w.end,
  };
}
function appView(rec) {
  const f = rec.fields || {};
  return {
    id: rec.id,
    name: fstr(f, F.app.name),
    studentId: fstr(f, F.app.studentId),
    eventId: fstr(f, F.app.eventId),
    eventTitle: fstr(f, F.app.eventTitle),
    status: fstr(f, F.app.status) || "已报名",
    link: fstr(f, F.app.link),
    code: fstr(f, F.app.code),
    desc: fstr(f, F.app.desc),
    caption: fstr(f, F.app.caption),
    appliedAt: fstr(f, F.app.appliedAt),
    submittedAt: fstr(f, F.app.submittedAt),
    adminNote: fstr(f, F.app.adminNote),
  };
}

/* —— 校验 —— */
const SID_RE = /^[A-Za-z0-9_-]{2,32}$/;
function validBaiduLink(u) {
  u = String(u || "").trim();
  if (u.length > 300) return false;
  return /^https:\/\/pan\.baidu\.com\/(s\/[A-Za-z0-9_-]{6,}|share\/init\?surl=[A-Za-z0-9_-]{4,})([?&#][^\s<>"']*)?$/.test(u);
}
function validCode(c) { return !c || /^[A-Za-z0-9]{4}$/.test(c); }

function eventFieldsFrom(d, partial) {
  const fields = {};
  const errs = [];
  if (!partial || d.title != null) {
    const t = clip(d.title, 60);
    if (!t) errs.push("任务名称不能为空"); else fields[F.event.title] = t;
  }
  if (!partial || d.category != null) {
    const c = clip(d.category, 10) || "其他";
    if (EVENT_CATEGORIES.indexOf(c) < 0) errs.push("类别只能是：" + EVENT_CATEGORIES.join(" / ")); else fields[F.event.category] = c;
  }
  if (!partial || d.date != null) {
    const dt = normDate(d.date);
    if (!dt) errs.push("日期格式应为 YYYY-MM-DD"); else fields[F.event.date] = dt;
  }
  if (d.time != null) fields[F.event.time] = clip(d.time, 20);
  if (d.place != null) fields[F.event.place] = clip(d.place, 40);
  if (d.need != null && d.need !== "") {
    const n = Math.floor(Number(d.need));
    if (!(n >= 0 && n <= 50)) errs.push("需要人数应为 0–50"); else fields[F.event.need] = n;
  }
  if (!partial || d.status != null) {
    const st = clip(d.status, 10) || "开放报名";
    if (EVENT_STATUS.indexOf(st) < 0) errs.push("状态只能是：" + EVENT_STATUS.join(" / ")); else fields[F.event.status] = st;
  }
  if (d.note != null) fields[F.event.note] = clip(d.note, 500);
  // v4.1 CAS 时间：新建（含申请转任务）不填就是 1；编辑时只改传了的
  [["casC", F.event.casC, "C"], ["casS", F.event.casS, "S"]].forEach(([k, col, label]) => {
    const given = d[k] != null && d[k] !== "";
    if (!given) { if (!partial) fields[col] = CAS_DEFAULT; return; }
    const n = casValid(d[k]);
    if (n == null) errs.push(`CAS ${label} 应为 ${CAS_MIN}–${CAS_MAX} 小时，0.5 一档`); else fields[col] = n;
  });
  return { fields, errs };
}

/* 「申请拍摄」表单写进活动记录表时会带「联系人：」或「CAS：」，据此认出申请 */
function isShootRequest(a) {
  const desc = fstr(a.fields, F.activity.desc);
  return /联系人：|CAS：/.test(desc);
}
function stripContact(text) {
  return String(text || "").split("\n").filter((l) => !/^联系人：/.test(l.trim())).join("\n");
}

function needTables() {
  if (!ENV.tableEvents || !ENV.tableApplications) {
    return respond(501, { ok: false, code: "EVENTS_NOT_CONFIGURED", msg: "日历功能还没配置（缺 TABLE_EVENTS / TABLE_APPLICATIONS）" });
  }
  return null;
}

async function loadEventsAndApps() {
  const [evs, apps] = await Promise.all([listAll(ENV.tableEvents), listAll(ENV.tableApplications)]);
  const events = evs.map(eventView).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return { events, apps: apps.map(appView) };
}
function countsByEvent(apps) {
  const c = {};
  apps.forEach((a) => {
    if (a.status === "已取消") return;
    const x = c[a.eventId] || (c[a.eventId] = { applied: 0, confirmed: 0, delivered: 0, accepted: 0 });
    x.applied++;
    if (a.status === "已确认") x.confirmed++;
    if (a.status === "已交付") { x.confirmed++; x.delivered++; }
    if (a.status === "已验收") { x.confirmed++; x.delivered++; x.accepted++; }
  });
  return c;
}

async function routeV4(req) {
  const { method, path } = req;
  if (!/^\/api\/(events|my|applications|admin|ai)(\/|$)/.test(path)) return null;

  // —— 管理后台：先验身份，再谈其他 —— //
  if (path === "/api/admin" || path.startsWith("/api/admin/")) {
    if (!bearer(req) || !isAuthed(req)) return respond(401, { ok: false, msg: "需要登录" });
    if (!isAdmin(req)) return respond(403, { ok: false, msg: "需要管理员权限" });
    return routeAdmin(req);
  }

  // —— 日历（只读，站点密码即可；只返回人数，不返回名单）—— //
  if (path === "/api/events" && method === "GET") {
    if (!ENV.tableEvents || !ENV.tableApplications) return respond(200, { ok: true, items: [], counts: {}, configured: false });
    const { events, apps } = await loadEventsAndApps();
    return respond(200, { ok: true, items: events, counts: countsByEvent(apps), now: Date.now(), today: cnToday() });
  }

  const known =
    (/^\/api\/events\/rec[A-Za-z0-9]+\/apply$/.test(path) && method === "POST") ||
    (path === "/api/my" && method === "GET") ||
    (/^\/api\/applications\/rec[A-Za-z0-9]+\/(deliver|cancel)$/.test(path) && method === "POST") ||
    (path === "/api/ai/caption" && method === "POST");
  if (!known) return respond(404, { ok: false, msg: `未知接口 ${method} ${path}` });
  if (!isAuthed(req)) return respond(401, { ok: false, msg: "需要成员登录" });

  if (path === "/api/ai/caption") return aiCaption(req);

  const nt = needTables();
  if (nt) return nt;
  const d = parseBody(req.body);

  // 报名
  let m = path.match(/^\/api\/events\/(rec[A-Za-z0-9]+)\/apply$/);
  if (m) {
    const name = clip(d.name, 30), sid = clip(d.studentId, 32);
    if (!name) return respond(400, { ok: false, msg: "请填写姓名" });
    if (!SID_RE.test(sid)) return respond(400, { ok: false, msg: "学号格式不对（2–32 位字母或数字）" });
    const rec = await getRecord(ENV.tableEvents, m[1]);
    if (!rec) return respond(404, { ok: false, msg: "任务不存在" });
    const ev = eventView(rec);
    if (ev.status !== "开放报名") return respond(409, { ok: false, msg: `这个任务目前「${ev.status}」，不接受报名` });
    if (ev.ended) return respond(409, { ok: false, msg: "任务已经结束，不能再报名" });
    const mine = (await listAll(ENV.tableApplications)).map(appView)
      .filter((a) => a.eventId === ev.id && a.studentId === sid);
    if (mine.length) {
      const a = mine[0];
      if (a.status !== "已取消") return respond(200, { ok: true, already: true, item: a });
      const upd = await updateRecord(ENV.tableApplications, a.id, {
        [F.app.status]: "已报名", [F.app.name]: name, [F.app.appliedAt]: cnStamp(),
      });
      return respond(200, { ok: true, item: appView(recordToItem(upd)) });
    }
    const created = await createRecord(ENV.tableApplications, {
      [F.app.name]: name, [F.app.studentId]: sid, [F.app.eventId]: ev.id,
      [F.app.eventTitle]: ev.title, [F.app.status]: "已报名", [F.app.appliedAt]: cnStamp(),
    });
    return respond(200, { ok: true, item: appView(recordToItem(created)) });
  }

  // 我的任务（按学号）
  if (path === "/api/my") {
    const sid = clip(req.query && req.query.sid, 32);
    if (!SID_RE.test(sid)) return respond(400, { ok: false, msg: "学号格式不对" });
    const { events, apps } = await loadEventsAndApps();
    const byId = {};
    events.forEach((e) => (byId[e.id] = e));
    const items = apps.filter((a) => a.studentId === sid).map((a) => ({ ...a, event: byId[a.eventId] || null }))
      .sort((a, b) => ((a.event && a.event.date) || "").localeCompare((b.event && b.event.date) || ""));
    return respond(200, { ok: true, items });
  }

  // 交付 / 取消
  m = path.match(/^\/api\/applications\/(rec[A-Za-z0-9]+)\/(deliver|cancel)$/);
  if (m) {
    const sid = clip(d.studentId, 32);
    const rec = await getRecord(ENV.tableApplications, m[1]);
    if (!rec) return respond(404, { ok: false, msg: "报名记录不存在" });
    const a = appView(rec);
    if (!sid || !sameStr(sid, a.studentId)) return respond(403, { ok: false, msg: "只能操作自己的报名（学号不匹配）" });
    const evRec = await getRecord(ENV.tableEvents, a.eventId);
    const ev = evRec ? eventView(evRec) : null;

    if (m[2] === "cancel") {
      if (["已报名", "已确认"].indexOf(a.status) < 0) return respond(409, { ok: false, msg: `当前状态「${a.status}」不能取消` });
      if (ev && ev.ended) return respond(409, { ok: false, msg: "任务已经结束，不能取消报名" });
      const upd = await updateRecord(ENV.tableApplications, a.id, { [F.app.status]: "已取消" });
      return respond(200, { ok: true, item: appView(recordToItem(upd)) });
    }

    if (["已报名", "已确认", "已退回", "已交付"].indexOf(a.status) < 0) {
      return respond(409, { ok: false, msg: `当前状态「${a.status}」不能交付` });
    }
    if (!ev) return respond(404, { ok: false, msg: "对应的任务不存在了" });
    if (!ev.ended) return respond(409, { ok: false, msg: "任务结束后才能交付素材" });
    const link = clip(d.link, 300), code = clip(d.code, 8), desc = clip(d.desc, 1000), caption = clip(d.caption, 300);
    if (!validBaiduLink(link)) return respond(400, { ok: false, msg: "请填写百度网盘分享链接（https://pan.baidu.com/s/…）" });
    if (!validCode(code)) return respond(400, { ok: false, msg: "提取码应为 4 位字母或数字" });
    if (!desc) return respond(400, { ok: false, msg: "请写一句素材描述" });
    const fields = {
      [F.app.link]: link, [F.app.code]: code, [F.app.desc]: desc,
      [F.app.status]: "已交付", [F.app.submittedAt]: cnStamp(),
    };
    if (caption) fields[F.app.caption] = caption;
    const upd = await updateRecord(ENV.tableApplications, a.id, fields);
    return respond(200, { ok: true, item: appView(recordToItem(upd)) });
  }
  return respond(404, { ok: false, msg: `未知接口 ${method} ${path}` });
}

async function routeAdmin(req) {
  const { method, path } = req;
  const d = parseBody(req.body);

  if (path === "/api/admin/overview" && method === "GET") return adminOverview();
  if (path === "/api/admin/ai/weekly" && method === "POST") return aiWeekly();
  if (path === "/api/admin/ai/staffing" && method === "POST") return aiStaffing(d);
  if (path === "/api/admin/ai/draft" && method === "POST") return aiDraft(d);

  const nt = needTables();
  if (nt) return nt;

  if (path === "/api/admin/events" && method === "POST") {
    const { fields, errs } = eventFieldsFrom(d, false);
    if (errs.length) return respond(400, { ok: false, msg: errs.join("；") });
    const rec = await createRecord(ENV.tableEvents, fields);
    return respond(200, { ok: true, item: eventView(recordToItem(rec)) });
  }
  let m = path.match(/^\/api\/admin\/events\/(rec[A-Za-z0-9]+)$/);
  if (m && method === "PUT") {
    const cur = await getRecord(ENV.tableEvents, m[1]);
    if (!cur) return respond(404, { ok: false, msg: "任务不存在" });
    const { fields, errs } = eventFieldsFrom(d, true);
    if (errs.length) return respond(400, { ok: false, msg: errs.join("；") });
    const rec = await updateRecord(ENV.tableEvents, m[1], fields);
    // 任务改名时，报名表里冗余的「任务名称」跟着改（只为飞书里看着方便）
    if (fields[F.event.title]) {
      const apps = (await listAll(ENV.tableApplications)).map(appView).filter((a) => a.eventId === m[1]);
      for (const a of apps) await updateRecord(ENV.tableApplications, a.id, { [F.app.eventTitle]: fields[F.event.title] });
    }
    // 飞书 update 接口只回传改动的字段；和原记录合并，返回完整任务（v4.1：CAS 往返才看得准）
    const upd = recordToItem(rec);
    return respond(200, { ok: true, item: eventView({ ...upd, id: upd.id || m[1], fields: { ...(cur.fields || {}), ...(upd.fields || {}) } }) });
  }
  // 管理员直接指派（= 替成员报名并确认）
  if (path === "/api/admin/applications" && method === "POST") {
    const name = clip(d.name, 30), sid = clip(d.studentId, 32);
    if (!name) return respond(400, { ok: false, msg: "缺少成员姓名" });
    if (!SID_RE.test(sid)) return respond(400, { ok: false, msg: "学号格式不对" });
    const st = APP_STATUS.indexOf(d.status) >= 0 ? d.status : "已确认";
    const ev = await getRecord(ENV.tableEvents, d.eventId);
    if (!ev) return respond(404, { ok: false, msg: "任务不存在" });
    const existing = (await listAll(ENV.tableApplications)).map(appView).find((a) => a.eventId === ev.id && a.studentId === sid);
    const rec = existing
      ? await updateRecord(ENV.tableApplications, existing.id, { [F.app.status]: st, [F.app.name]: name })
      : await createRecord(ENV.tableApplications, {
        [F.app.name]: name, [F.app.studentId]: sid, [F.app.eventId]: ev.id,
        [F.app.eventTitle]: fstr(ev.fields, F.event.title), [F.app.status]: st, [F.app.appliedAt]: cnStamp(),
        [F.app.adminNote]: "管理员指派",
      });
    return respond(200, { ok: true, item: appView(recordToItem(rec)) });
  }
  m = path.match(/^\/api\/admin\/applications\/(rec[A-Za-z0-9]+)$/);
  if (m && method === "PUT") {
    const fields = {};
    if (d.status != null) {
      if (APP_STATUS.indexOf(d.status) < 0) return respond(400, { ok: false, msg: "状态只能是：" + APP_STATUS.join(" / ") });
      fields[F.app.status] = d.status;
    }
    if (d.adminNote != null) fields[F.app.adminNote] = clip(d.adminNote, 300);
    if (!Object.keys(fields).length) return respond(400, { ok: false, msg: "没有要修改的内容" });
    const cur = await getRecord(ENV.tableApplications, m[1]);
    if (!cur) return respond(404, { ok: false, msg: "报名记录不存在" });
    if (fields[F.app.status] === "已验收" && ["已交付", "已验收"].indexOf(appView(cur).status) < 0) {
      return respond(409, { ok: false, msg: "还没交付，不能验收" });
    }
    const rec = await updateRecord(ENV.tableApplications, m[1], fields);
    return respond(200, { ok: true, item: appView(recordToItem(rec)) });
  }
  // 拍摄申请 → 任务（只新建任务，不改申请本身；用「来源申请」记住来源，避免重复转换）
  m = path.match(/^\/api\/admin\/requests\/(rec[A-Za-z0-9]+)\/convert$/);
  if (m && method === "POST") {
    const reqRec = await getRecord(ENV.tableActivities, m[1]);
    if (!reqRec) return respond(404, { ok: false, msg: "申请不存在" });
    const evs = (await listAll(ENV.tableEvents)).map(eventView);
    const dup = evs.find((e) => e.source === m[1]);
    if (dup && !d.force) return respond(409, { ok: false, msg: `这条申请已经转成任务「${dup.title}」`, item: dup });
    const f = reqRec.fields || {};
    const input = {
      title: d.title || fstr(f, F.activity.name),
      category: d.category || "其他",
      date: d.date || normDate(fstr(f, F.activity.date)),
      time: d.time != null ? d.time : ((fstr(f, F.activity.date).match(/\d{1,2}[:：]\d{2}/) || [""])[0]),
      place: d.place, need: d.need, status: d.status || "开放报名",
      casC: d.casC, casS: d.casS,
      note: d.note != null ? d.note : stripContact(fstr(f, F.activity.desc)).slice(0, 500),
    };
    const { fields, errs } = eventFieldsFrom(input, false);
    if (errs.length) return respond(400, { ok: false, msg: errs.join("；") });
    fields[F.event.source] = m[1];
    const rec = await createRecord(ENV.tableEvents, fields);
    return respond(200, { ok: true, item: eventView(recordToItem(rec)) });
  }
  return respond(404, { ok: false, msg: `未知接口 ${method} ${path}` });
}

async function adminOverview() {
  const safe = (p) => p.catch(() => []);
  const [acts, photos, links, members, ea, usage] = await Promise.all([
    safe(listAll(ENV.tableActivities)), safe(listAll(ENV.tablePhotos)), safe(listAll(ENV.tableLinks)),
    safe(listAll(ENV.tableMembers)),
    ENV.tableEvents && ENV.tableApplications ? loadEventsAndApps() : Promise.resolve({ events: [], apps: [] }),
    aiUsageSummary().catch((e) => ({ error: e.message })),
  ]);
  const { events, apps } = ea;
  const today = cnToday(), weekEnd = addDays(today, 7), now = Date.now();
  const byEvent = {};
  events.forEach((e) => (byEvent[e.id] = e));

  const pipeline = { events: {}, applications: {} };
  EVENT_STATUS.forEach((s) => (pipeline.events[s] = 0));
  APP_STATUS.forEach((s) => (pipeline.applications[s] = 0));
  events.forEach((e) => (pipeline.events[e.status] = (pipeline.events[e.status] || 0) + 1));
  apps.forEach((a) => (pipeline.applications[a.status] = (pipeline.applications[a.status] || 0) + 1));

  const people = {};
  const roster = members.map((m) => ({
    name: fstr(m.fields, F.member.name), studentId: fstr(m.fields, F.member.studentId),
    klass: fstr(m.fields, F.member.klass), role: fstr(m.fields, F.member.role), skills: fstr(m.fields, F.member.skills),
  })).filter((m) => m.name);
  roster.forEach((m) => (people[m.studentId || m.name] = { name: m.name, studentId: m.studentId, role: m.role, applied: 0, confirmed: 0, delivered: 0, accepted: 0, registered: true }));
  apps.forEach((a) => {
    if (a.status === "已取消") return;
    const k = a.studentId || a.name;
    const p = people[k] || (people[k] = { name: a.name, studentId: a.studentId, role: "", applied: 0, confirmed: 0, delivered: 0, accepted: 0, registered: false });
    p.applied++;
    if (["已确认", "已交付", "已验收"].indexOf(a.status) >= 0) p.confirmed++;
    if (["已交付", "已验收"].indexOf(a.status) >= 0) p.delivered++;
    if (a.status === "已验收") p.accepted++;
  });

  const overdue = apps.filter((a) => {
    const e = byEvent[a.eventId];
    return e && e.status !== "已取消" && ["已报名", "已确认", "已退回"].indexOf(a.status) >= 0 && e.end && now - e.end > 24 * 3600 * 1000;
  }).map((a) => ({ ...a, event: byEvent[a.eventId] }));

  const requests = acts.filter(isShootRequest).map((a) => ({
    id: a.id, name: fstr(a.fields, F.activity.name), date: fstr(a.fields, F.activity.date),
    desc: fstr(a.fields, F.activity.desc), status: fstr(a.fields, F.activity.status),
    convertedTo: (events.find((e) => e.source === a.id) || {}).id || "",
  }));

  return respond(200, {
    ok: true,
    now, today,
    stats: {
      activities: acts.length, photos: photos.length, links: links.length, members: members.length,
      requests: requests.length, events: events.length, applications: apps.filter((a) => a.status !== "已取消").length,
    },
    pipeline,
    events: events.map((e) => ({ ...e, applicants: apps.filter((a) => a.eventId === e.id) })),
    upcoming: events.filter((e) => e.date >= today && e.date <= weekEnd && e.status !== "已取消"),
    overdue,
    contributions: Object.values(people).sort((a, b) => b.confirmed - a.confirmed || b.applied - a.applied),
    roster,
    requests,
    ai: usage,
    options: { categories: EVENT_CATEGORIES, eventStatus: EVENT_STATUS, appStatus: APP_STATUS },
  });
}

/* ================================================================== *
 * AI 预算守卫（硬上限，默认每月 20 元、到 18 元就停）
 * ------------------------------------------------------------------
 * 计价依据：DeepSeek 官方「模型 & 价格」页
 *   https://api-docs.deepseek.com/zh-cn/quick_start/pricing（2026-10-09 查询）
 *   deepseek-chat 现由 DeepSeek-V4.1-Flash（非思考模式）提供服务，按 Flash 价计费，单位：元 / 百万 tokens
 *     输入（缓存命中）  空闲 0.02 / 高峰 0.04
 *     输入（缓存未命中）空闲 1    / 高峰 2
 *     输出              空闲 4    / 高峰 8
 *   这里一律按「高峰价」估算 —— 宁可多算，不会少算。价格变了只改 PRICE。
 * 用量来自接口返回的 usage（prompt_cache_hit_tokens / prompt_cache_miss_tokens / completion_tokens），
 * 写进「AI用量」表（每月 × 每功能一行）。调用前先查本月累计：
 *   累计 + 本次最坏花费 ≥ 停用线 → 直接拒绝（不调模型）；每个功能还有每日次数上限和 4 秒冷却。
 * 用量表没配置时，所有 AI 功能一律拒绝。
 * ================================================================== */
const PRICE = { hit: 0.04, miss: 2, out: 8 }; // 元 / 1M tokens（高峰价）
const AI_FEATURES = {
  group:    { label: "AI 分组",       perDay: 20, maxTokens: 2000 },
  staffing: { label: "AI 排班建议",   perDay: 40, maxTokens: 500 },
  weekly:   { label: "AI 周报",       perDay: 10, maxTokens: 600 },
  draft:    { label: "AI 整理申请",   perDay: 30, maxTokens: 300 },
  caption:  { label: "AI 润色文案",   perDay: 60, maxTokens: 200 },
};
const aiCooldown = {};

function costOf(usage) {
  const u = usage || {};
  const hit = Number(u.prompt_cache_hit_tokens) || 0;
  const miss = u.prompt_cache_miss_tokens != null ? Number(u.prompt_cache_miss_tokens) || 0 : Math.max(0, (Number(u.prompt_tokens) || 0) - hit);
  const out = Number(u.completion_tokens) || 0;
  return (hit * PRICE.hit + miss * PRICE.miss + out * PRICE.out) / 1e6;
}
function worstCost(prompt, maxTokens) {
  // 中文约 1 字 ≈ 0.6–1 token，按 1 字 = 1 token 往高了估
  return (String(prompt).length * PRICE.miss + maxTokens * PRICE.out) / 1e6;
}
function stopAt() {
  const cap = ENV.aiCap || 20;
  return Math.min(cap, ENV.aiStopAt > 0 ? ENV.aiStopAt : cap * 0.9);
}
async function aiMonthRows(month) {
  if (!ENV.tableAiUsage) return [];
  return (await listAll(ENV.tableAiUsage)).filter((r) => fstr(r.fields, F.usage.month) === month);
}
async function aiUsageSummary() {
  const month = cnMonth(), today = cnToday();
  const rows = await aiMonthRows(month);
  const byFeature = {};
  Object.keys(AI_FEATURES).forEach((k) => (byFeature[k] = { label: AI_FEATURES[k].label, calls: 0, cost: 0, today: 0, perDay: AI_FEATURES[k].perDay }));
  let spent = 0;
  rows.forEach((r) => {
    const k = fstr(r.fields, F.usage.feature);
    const c = fnum(r.fields, F.usage.cost);
    spent += c;
    const b = byFeature[k] || (byFeature[k] = { label: k, calls: 0, cost: 0, today: 0, perDay: 0 });
    b.calls += fnum(r.fields, F.usage.calls);
    b.cost += c;
    if (fstr(r.fields, F.usage.day) === today) b.today += fnum(r.fields, F.usage.dayCalls);
  });
  return {
    configured: !!(ENV.tableAiUsage && ENV.llmApiKey), month, spent: Math.round(spent * 1e6) / 1e6,
    cap: ENV.aiCap || 20, stopAt: stopAt(), byFeature,
    pricing: "DeepSeek deepseek-chat（V4.1-Flash 非思考），按高峰价：输入 2 元/百万（缓存命中 0.04）、输出 8 元/百万",
  };
}

function aiError(code, msg) { const e = new Error(msg); e.code = code; return e; }

async function aiCall(feature, prompt, maxTokens) {
  const spec = AI_FEATURES[feature];
  if (!spec) throw aiError("AI_RATE", "未知的 AI 功能");
  maxTokens = Math.min(maxTokens || spec.maxTokens, spec.maxTokens);
  if (!ENV.llmApiKey) throw aiError("LLM_NOT_CONFIGURED", "尚未配置大模型：请在环境变量里设置 LLM_API_KEY");
  if (!ENV.tableAiUsage) throw aiError("AI_BUDGET", "AI 用量表还没配置（TABLE_AI_USAGE），为避免超支，AI 功能暂停使用");

  const month = cnMonth(), today = cnToday();
  const rows = await aiMonthRows(month);
  const spent = rows.reduce((s, r) => s + fnum(r.fields, F.usage.cost), 0);
  const limit = stopAt();
  if (spent + worstCost(prompt, maxTokens) >= limit) {
    throw aiError("AI_BUDGET", `本月 AI 额度已用完（已用约 ¥${spent.toFixed(2)}，上限 ¥${(ENV.aiCap || 20).toFixed(0)}），下个月 1 号自动恢复。`);
  }
  const row = rows.find((r) => fstr(r.fields, F.usage.feature) === feature);
  const dayCalls = row && fstr(row.fields, F.usage.day) === today ? fnum(row.fields, F.usage.dayCalls) : 0;
  if (dayCalls >= spec.perDay) throw aiError("AI_RATE", `今天「${spec.label}」已经用了 ${dayCalls} 次（每日上限 ${spec.perDay}），明天再试吧。`);
  if (aiCooldown[feature] && Date.now() - aiCooldown[feature] < 4000) throw aiError("AI_RATE", "点得太快啦，请几秒后再试。");
  aiCooldown[feature] = Date.now();

  let out, usage;
  try {
    out = await callModel(prompt, maxTokens);
    usage = out.usage;
  } catch (e) {
    if (e.usage) await recordUsage(feature, month, today, row, e.usage).catch(() => {});
    throw e;
  }
  const cost = await recordUsage(feature, month, today, row, usage).catch((e) => {
    console.error("[oao-proxy] AI 用量写入失败:", e && e.message);
    return costOf(usage);
  });
  return { text: out.text, cost, usage: { in: Number(usage.prompt_tokens) || 0, out: Number(usage.completion_tokens) || 0 }, spent: spent + cost };
}

async function recordUsage(feature, month, today, row, usage) {
  const cost = costOf(usage);
  const f = row ? row.fields : {};
  const sameDay = row && fstr(f, F.usage.day) === today;
  const fields = {
    [F.usage.key]: `${month}|${feature}`,
    [F.usage.month]: month,
    [F.usage.feature]: feature,
    [F.usage.calls]: fnum(f, F.usage.calls) + 1,
    [F.usage.inTokens]: fnum(f, F.usage.inTokens) + (Number(usage.prompt_tokens) || 0),
    [F.usage.outTokens]: fnum(f, F.usage.outTokens) + (Number(usage.completion_tokens) || 0),
    [F.usage.cost]: Math.round((fnum(f, F.usage.cost) + cost) * 1e6) / 1e6,
    [F.usage.day]: today,
    [F.usage.dayCalls]: (sameDay ? fnum(f, F.usage.dayCalls) : 0) + 1,
  };
  if (row) await updateRecord(ENV.tableAiUsage, row.id, fields);
  else await createRecord(ENV.tableAiUsage, fields);
  return cost;
}

function parseJsonObject(text) {
  let t = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}
function aiFail(e) {
  if (e.code === "LLM_NOT_CONFIGURED") return respond(501, { ok: false, code: e.code, msg: e.message });
  if (e.code === "AI_BUDGET" || e.code === "AI_RATE") return respond(429, { ok: false, code: e.code, msg: e.message });
  return respond(502, { ok: false, msg: "AI 调用失败：" + e.message });
}
function aiMeta(r) { return { cost: Math.round(r.cost * 1e6) / 1e6, usage: r.usage, spent: Math.round(r.spent * 1e4) / 1e4, cap: ENV.aiCap || 20 }; }

/* AI 1：交付描述 → 一句可直接发的配图文案（成员可用） */
async function aiCaption(req) {
  const d = parseBody(req.body);
  const desc = clip(d.desc, 400), title = clip(d.eventTitle, 60);
  if (desc.length < 4) return respond(400, { ok: false, msg: "先写几句素材描述，再让 AI 润色" });
  const prompt = [
    "你是学生摄影社的文案助手。把成员写的素材描述润色成一段配图文案，适合发小红书/公众号。",
    title ? `活动：${title}` : "",
    `成员描述：${desc}`,
    "要求：中文，40–80 字，真诚、有画面感，不夸张、不编造描述里没有的事实；再给 2–3 个话题标签。",
    '只输出 JSON：{"caption":"…","tags":["#…"]}',
  ].filter(Boolean).join("\n");
  try {
    const r = await aiCall("caption", prompt, 200);
    const j = parseJsonObject(r.text);
    const tags = (Array.isArray(j.tags) ? j.tags : []).map((t) => clip(t, 20)).filter(Boolean).slice(0, 3);
    return respond(200, { ok: true, caption: clip(j.caption, 200), tags, ...aiMeta(r) });
  } catch (e) { return aiFail(e); }
}

/* AI 2：给某个任务推荐人选（管理员） */
async function aiStaffing(d) {
  const nt = needTables(); if (nt) return nt;
  const evRec = await getRecord(ENV.tableEvents, d.eventId);
  if (!evRec) return respond(404, { ok: false, msg: "任务不存在" });
  const ev = eventView(evRec);
  const [apps, members] = await Promise.all([listAll(ENV.tableApplications), listAll(ENV.tableMembers)]);
  const all = apps.map(appView);
  const roster = members.map((m) => ({
    name: fstr(m.fields, F.member.name), sid: fstr(m.fields, F.member.studentId),
    role: fstr(m.fields, F.member.role), skills: fstr(m.fields, F.member.skills),
  })).filter((m) => m.name);
  const load = {};
  all.forEach((a) => { if (["已确认", "已交付"].indexOf(a.status) >= 0) load[a.name] = (load[a.name] || 0) + 1; });
  const applicants = all.filter((a) => a.eventId === ev.id && a.status !== "已取消");
  const appNames = applicants.map((a) => a.name);
  const skillOf = {};
  roster.forEach((m) => (skillOf[m.name] = m));
  const line = (n, i) => `${i + 1}. ${n}${skillOf[n] && skillOf[n].role ? `（${skillOf[n].role}）` : ""} — 技能：${(skillOf[n] && skillOf[n].skills) || "未登记"}；手上已确认任务 ${load[n] || 0} 个`;
  const others = roster.map((m) => m.name).filter((n) => appNames.indexOf(n) < 0).slice(0, 30);
  const need = ev.need || 2;
  const prompt = [
    "你在给学生摄影社排班。",
    `任务：${ev.title}（${ev.category}，${ev.date} ${ev.time}${ev.place ? "，" + ev.place : ""}），需要 ${need} 人。`,
    "已报名：", applicants.length ? appNames.map(line).join("\n") : "（暂无）",
    "未报名、可邀请的成员：", others.length ? others.map(line).join("\n") : "（无）",
    `要求：推荐 ${need} 人。优先已报名的人；技能和任务匹配（体育比赛偏抓拍/视频）；手上任务少的优先；人不够时可从未报名成员里推荐，并标 invite:true。不要编造名单外的人。`,
    '只输出 JSON：{"picks":[{"name":"…","reason":"≤20字","invite":false}],"note":"≤40字的整体建议"}',
  ].join("\n");
  try {
    const r = await aiCall("staffing", prompt, 500);
    const j = parseJsonObject(r.text);
    const known = roster.map((m) => m.name).concat(appNames);
    const warnings = [];
    const picks = (Array.isArray(j.picks) ? j.picks : []).filter((p) => {
      if (known.indexOf(p.name) < 0) { warnings.push(`AI 提到了名单外的「${clip(p.name, 20)}」，已忽略`); return false; }
      return true;
    }).map((p) => {
      const app = applicants.find((a) => a.name === p.name);
      return { name: p.name, reason: clip(p.reason, 60), invite: !app, applicationId: app ? app.id : "", status: app ? app.status : "", studentId: app ? app.studentId : ((skillOf[p.name] || {}).sid || "") };
    });
    return respond(200, { ok: true, eventId: ev.id, picks, note: clip(j.note, 120), warnings, ...aiMeta(r) });
  } catch (e) { return aiFail(e); }
}

/* AI 3：拍摄申请 → 任务草稿（管理员；只返回草稿，不落库，人确认后再建） */
async function aiDraft(d) {
  const rec = await getRecord(ENV.tableActivities, d.requestId);
  if (!rec) return respond(404, { ok: false, msg: "申请不存在" });
  const f = rec.fields || {};
  const prompt = [
    "把下面这条社团拍摄申请整理成一个拍摄任务草稿。今天是 " + cnToday() + "（北京时间）。",
    `活动名称：${fstr(f, F.activity.name)}`,
    `活动时间：${fstr(f, F.activity.date)}`,
    `描述：${stripContact(fstr(f, F.activity.desc)).slice(0, 500)}`,
    `类别只能从这些里选：${EVENT_CATEGORIES.join("、")}。`,
    '只输出 JSON：{"title":"≤20字","category":"…","date":"YYYY-MM-DD，不确定就空","time":"HH:MM-HH:MM 或 放学 或空","place":"","need":2,"note":"≤60字拍摄重点"}',
  ].join("\n");
  try {
    const r = await aiCall("draft", prompt, 300);
    const j = parseJsonObject(r.text);
    const draft = {
      title: clip(j.title, 60) || fstr(f, F.activity.name),
      category: EVENT_CATEGORIES.indexOf(j.category) >= 0 ? j.category : "其他",
      date: normDate(j.date) || normDate(fstr(f, F.activity.date)),
      time: clip(j.time, 20), place: clip(j.place, 40),
      need: Math.max(0, Math.min(20, Math.floor(Number(j.need)) || 2)),
      note: clip(j.note, 200),
      casC: CAS_DEFAULT, casS: CAS_DEFAULT, // CAS 时间不交给 AI 猜，管理员在编辑器里改
    };
    return respond(200, { ok: true, requestId: rec.id, draft, ...aiMeta(r) });
  } catch (e) { return aiFail(e); }
}

/* AI 4：本周简报（管理员） */
async function aiWeekly() {
  const nt = needTables(); if (nt) return nt;
  const { events, apps } = await loadEventsAndApps();
  const today = cnToday(), from = addDays(today, -7), to = addDays(today, 7);
  const byId = {};
  events.forEach((e) => (byId[e.id] = e));
  const cnt = (list, st) => list.filter((a) => a.status === st).length;
  const past = events.filter((e) => e.date >= from && e.date < today);
  const next = events.filter((e) => e.date >= today && e.date <= to && e.status !== "已取消");
  const fmt = (e) => {
    const as = apps.filter((a) => a.eventId === e.id && a.status !== "已取消");
    return `- ${e.date} ${e.time} ${e.title}（${e.status}）报名 ${as.length}/${e.need || "?"}，确认 ${as.filter((a) => a.status !== "已报名").length}，交付 ${cnt(as, "已交付") + cnt(as, "已验收")}`;
  };
  // 与看板的「逾期未交付」同一口径：任务结束超过 24 小时还没交付
  const overdue = apps.filter((a) => {
    const e = byId[a.eventId];
    return e && e.status !== "已取消" && e.end && Date.now() - e.end > 24 * 3600 * 1000 && ["已报名", "已确认", "已退回"].indexOf(a.status) >= 0;
  });
  const prompt = [
    `你是学生摄影社的助理，给社长写本周简报。今天 ${today}。`,
    "过去 7 天的任务：", past.length ? past.slice(0, 25).map(fmt).join("\n") : "（无）",
    "未来 7 天的任务：", next.length ? next.slice(0, 25).map(fmt).join("\n") : "（无）",
    `结束超过 24 小时仍未交付的报名：${overdue.length} 条；待验收：${cnt(apps, "已交付")} 条。`,
    "要求：中文，简洁务实，不编造数据。",
    '只输出 JSON：{"summary":"3–4 句总体情况","highlights":["≤3 条"],"risks":["≤3 条，比如人手不够、交付逾期"],"next":["≤3 条下周建议"]}',
  ].join("\n");
  try {
    const r = await aiCall("weekly", prompt, 600);
    const j = parseJsonObject(r.text);
    const arr = (x) => (Array.isArray(x) ? x : []).map((t) => clip(t, 80)).filter(Boolean).slice(0, 3);
    return respond(200, { ok: true, report: { summary: clip(j.summary, 300), highlights: arr(j.highlights), risks: arr(j.risks), next: arr(j.next) }, ...aiMeta(r) });
  } catch (e) { return aiFail(e); }
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */
/* 导出给测试用：这两个是「不信任模型输出」的防线，没有模型也要能验证 */
exports._parseGroupJson = parseGroupJson;
exports._saveGroups = saveGroups;
exports._checkGroups = checkGroups;
exports._v4 = { costOf, worstCost, eventWindow, normDate, validBaiduLink, stopAt, AI_FEATURES, PRICE };

/**
 * 平台无关入口（Cloudflare Pages Functions 用）。
 * req: { method, path, headers(小写键), body(字符串), query }
 * envSource: Cloudflare 的 context.env（或任何键值对象）；不传则沿用当前 ENV。
 * 返回 { statusCode, headers, body }。
 */
async function handle(req, envSource) {
  if (envSource) ENV = buildEnv(envSource);
  if (req.method === "OPTIONS") {
    return respond(204, "", { "Content-Type": "text/plain; charset=utf-8" });
  }
  try {
    return await route(req);
  } catch (err) {
    console.error("[oao-proxy] error:", err && err.message);
    return respond(500, { ok: false, msg: err && err.message ? err.message : "服务器内部错误" });
  }
}
exports.handle = handle;

/* 腾讯云函数 SCF 入口（函数 URL / API 网关事件格式） */
exports.main_handler = async (event, context) => handle(parseRequest(event || {}));
