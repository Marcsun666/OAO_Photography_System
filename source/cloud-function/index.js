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

function isAuthed(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  return !!(ENV.token && token && token === ENV.token);
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
    if (ENV.passcode && passcode === ENV.passcode) {
      return respond(200, { ok: true, token: ENV.token });
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
      raw = await callModel(prompt);
    } catch (e) {
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
async function callModel(prompt) {
  // 只有 Key 是必填；地址和模型默认用 DeepSeek 最便宜的 deepseek-chat
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
        max_tokens: 2000,
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
  if (!text) throw new Error("模型返回为空");
  return text;
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

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */
/* 导出给测试用：这两个是「不信任模型输出」的防线，没有模型也要能验证 */
exports._parseGroupJson = parseGroupJson;
exports._saveGroups = saveGroups;
exports._checkGroups = checkGroups;

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
