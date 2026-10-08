/**
 * OAO 摄影社 · 数据层
 * ------------------------------------------------------------------
 * 职责：登录门、读库渲染（hero 统计 / 工作台 / 时间线 / 素材库 / 照片合集 / B站区）、
 *       上传与贴网盘链接、活动记录写入。
 *
 * 依赖 config.js（window.OAO_CONFIG）。proxyUrl 为空时运行在「静态回退模式」：
 * 不改动页面现有写死内容，仅处理拍摄申请表单的本地模拟提交。
 */
(function () {
  "use strict";

  var CFG = window.OAO_CONFIG || {};
  var PROXY = (CFG.proxyUrl || "").replace(/\/+$/, "");
  var DEMO = !!CFG.demo;
  var CONNECTED = !!PROXY || DEMO;

  /* 与云函数保持一致的字段名（改表列名时两边同步改） */
  var F = {
    activity: {
      name: "活动名称", date: "日期", unit: "组别", status: "状态", type: "类型",
      photoCount: "照片数", videoCount: "视频数", desc: "描述", cover: "封面",
      link: "网盘链接", code: "提取码",
    },
    photo: {
      activity: "活动", file: "文件", link: "网盘链接", code: "提取码",
      category: "分类", note: "说明",
    },
    link: { platform: "平台", title: "标题", url: "链接", note: "备注" },
    group: {
      batch: "批次", name: "组名", members: "成员",
      skills: "技能覆盖", reason: "说明",
    },
    member: {
      name: "姓名", klass: "班级", studentId: "学号", gender: "性别",
      role: "职位", skills: "技能", note: "备注",
    },
  };

  var state = {
    token: sessionStorage.getItem("oao_token") || "",
    activities: [],
    photos: [],
    links: [],
    members: [],
    skills: [],
  };

  /* 可选技能词条。加词条只改这里，界面自动跟着变。 */
  var SKILL_POOL = [
    "拍照", "修图", "拍视频", "剪视频", "调色",
    "灯光", "收音", "无人机", "平面设计", "文案", "排版", "活动统筹",
  ];

  /* ---------------------------- 工具 ---------------------------- */
  function el(sel) { return document.querySelector(sel); }
  function elAll(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function raw(fields, key) { return fields ? fields[key] : undefined; }

  function str(fields, key) {
    var v = raw(fields, key);
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(v);
    if (Array.isArray(v)) {
      return v.map(function (x) { return x && (x.text || x.name || x.title); })
        .filter(Boolean).join("、");
    }
    if (typeof v === "object") return v.text || v.name || v.title || "";
    return String(v);
  }

  function num(fields, key) {
    var v = raw(fields, key);
    var n = typeof v === "number" ? v : parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function fileTokens(fields, key) {
    var v = raw(fields, key);
    if (!Array.isArray(v)) return [];
    return v.map(function (a) { return a && a.file_token; }).filter(Boolean);
  }

  var DEMO_IMAGES = {
    "demo-ft": "assets/events/volleyball-team-red-1.webp",
    "demo-ft2": "assets/events/volleyball-team-red-2.webp",
    "demo-ft3": "assets/events/sports-tug-2709.webp",
    "demo-ft4": "assets/events/sports-runner-5119.webp",
    "demo-ft5": "assets/events/relay-runner.webp",
    "demo-ft6": "assets/events/volunteer-day-closeup.webp",
    "demo-ft7": "assets/events/figaro-stage.webp",
    "demo-ft8": "assets/events/orchestra-conductor.webp",
    "demo-ft9": "assets/events/auto-engine-team.webp",
    "demo-ft10": "assets/events/cherry-plush.webp",
    /* 活动封面：Sequoia 式图块版式靠图片撑起来，没有图就是一排空方框 */
    "demo-cv1": "assets/events/volleyball-team-red-1.webp",
    "demo-cv2": "assets/events/recruitment-guitar.webp",
    "demo-cv3": "assets/events/auto-engine-team.webp",
    "demo-cv4": "assets/events/figaro-stage.webp",
    "demo-cv5": "assets/events/volunteer-day-closeup.webp",
    "demo-cv6": "assets/events/sports-runner-5119.webp",
  };
  function fileUrl(token) {
    if (DEMO && DEMO_IMAGES[token]) return DEMO_IMAGES[token];
    return PROXY + "/api/file/" + encodeURIComponent(token);
  }

  function emptyState(text) {
    return '<div class="empty-state">' + esc(text) + "</div>";
  }

  /* 演示模式示例数据（demo: true 时使用，无需后端） */
  var DEMO_DATA = {
    activities: [
      { id: "demo-a1", fields: { 活动名称: "排球社合照", 封面: [{ file_token: "demo-cv1" }], 日期: "2026.06", 组别: "两者", 状态: "已归档", 类型: "联动", 照片数: 86, 视频数: 2, 描述: "红墙合照、团队肖像、社团宣传素材。" } },
      { id: "demo-a2", fields: { 活动名称: "社团招新现场", 封面: [{ file_token: "demo-cv2" }], 日期: "2026.05", 组别: "视频组", 状态: "已发布", 类型: "招新", 照片数: 42, 视频数: 8, 描述: "摊位、采访、学生风采。" } },
      { id: "demo-a3", fields: { 活动名称: "汽车社上汽活动", 封面: [{ file_token: "demo-cv3" }], 日期: "2026.04", 组别: "照片组", 状态: "待选片", 类型: "联动", 照片数: 64, 视频数: 1, 描述: "活动现场、实验细节、社团联动记录。" } },
      { id: "demo-a4", fields: { 活动名称: "费加罗的婚礼 · 舞台跟拍", 封面: [{ file_token: "demo-cv4" }], 日期: "2026.03", 组别: "照片组", 状态: "精修中", 类型: "舞台", 照片数: 210, 视频数: 6, 描述: "正式演出与幕后花絮。" } },
      { id: "demo-a5", fields: { 活动名称: "志愿者日", 封面: [{ file_token: "demo-cv5" }], 日期: "2025.12", 组别: "视频组", 状态: "待剪辑", 类型: "公益", 照片数: 128, 视频数: 3, 描述: "活动跟拍、现场特写、校园公益记录。" } },
      { id: "demo-a6", fields: { 活动名称: "校运动会", 封面: [{ file_token: "demo-cv6" }], 日期: "2025.11", 组别: "两者", 状态: "待交付", 类型: "运动", 照片数: 340, 视频数: 12, 描述: "比赛瞬间、班级合影、赛场视频素材。" } },
    ],
    photos: [],
    links: [
      { id: "demo-l1", fields: { 平台: "B站", 标题: "运动会高光", 链接: "https://www.bilibili.com/", 备注: "赛场瞬间与班级记忆。" } },
      { id: "demo-l2", fields: { 平台: "B站", 标题: "舞台演出记录", 链接: "https://www.bilibili.com/", 备注: "正式演出与幕后花絮。" } },
    ],
    members: [
      { id: "demo-m1", fields: { 姓名: "示例同学 A", 班级: "G11-3", 学号: "20260101", 性别: "女", 职位: "照片组组长", 技能: "拍照、修图、调色" } },
      { id: "demo-m2", fields: { 姓名: "示例同学 B", 班级: "G10-1", 学号: "20260102", 性别: "无性别", 职位: "干事", 技能: "拍视频、剪视频、收音" } },
      { id: "demo-m3", fields: { 姓名: "示例同学 C", 班级: "G12-2", 学号: "20260103", 性别: "男", 职位: "社员", 技能: "拍照、无人机、平面设计" } },
    ],
  };

  function demoApi(path, opts) {
    var p = String(path).split("?")[0];
    return new Promise(function (resolve) {
      setTimeout(function () {
        if (p === "/api/auth") { resolve({ ok: true, token: "demo-token" }); return; }
        if (p === "/api/activities") { resolve({ ok: true, items: DEMO_DATA.activities }); return; }
        if (p === "/api/photos") { resolve({ ok: true, items: DEMO_DATA.photos }); return; }
        if (p === "/api/links") { resolve({ ok: true, items: DEMO_DATA.links }); return; }
        if (p === "/api/members") { resolve({ ok: true, items: DEMO_DATA.members }); return; }
        if (p === "/api/group") {
          // 演示模式不调模型，用轮转发牌凑一个结果，只为把界面跑通
          var n = Math.max(2, Math.min(20, (opts.body && opts.body.groupCount) || 2));
          var gs = [];
          for (var i = 0; i < n; i++) gs.push({ name: "第 " + (i + 1) + " 组", members: [], skills: [] });
          DEMO_DATA.members.forEach(function (m, idx) {
            var g = gs[idx % n];
            g.members.push(m.fields.姓名);
            String(m.fields.技能 || "").split("、").filter(Boolean).forEach(function (k) {
              if (g.skills.indexOf(k) < 0) g.skills.push(k);
            });
          });
          gs.forEach(function (g) { g.reason = "演示模式：按顺序轮转分配，不是真的 AI 结果。"; });
          resolve({ ok: true, groups: gs, warnings: ["演示模式：这不是模型算出来的分组"], source: "demo" });
          return;
        }
        // 写操作在演示模式下只模拟成功，不真正保存
        resolve({ ok: true, record: { id: "demo-write-" + Date.now() } });
      }, 100);
    });
  }

  function api(path, opts) {
    opts = opts || {};
    if (DEMO) return demoApi(path, opts);
    var headers = { "Content-Type": "application/json" };
    if (opts.auth && state.token) headers.Authorization = "Bearer " + state.token;
    return fetch(PROXY + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return { ok: false, msg: "响应解析失败" }; })
        .then(function (json) {
          if (!res.ok && json.ok !== true) {
            var err = new Error(json.msg || ("HTTP " + res.status));
            err.code = json.code;      // 如 LLM_NOT_CONFIGURED
            err.status = res.status;
            throw err;
          }
          return json;
        });
    });
  }

  function readAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var s = String(r.result || "");
        resolve(s.slice(s.indexOf(",") + 1));
      };
      r.onerror = function () { reject(new Error("读取文件失败")); };
      r.readAsDataURL(file);
    });
  }

  /* ---------------------------- Toast ---------------------------- */
  var toastTimer;
  function toast(msg, isError) {
    var t = el("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.toggle("error", !!isError);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 3400);
  }

  function showDemoBadge() {
    if (!document.createElement || !document.body || !document.body.appendChild) return;
    var badge = document.createElement("div");
    badge.className = "demo-badge";
    badge.textContent = "演示模式 · 示例数据";
    document.body.appendChild(badge);
  }

  /* ---------------------------- 弹窗 ---------------------------- */
  function openModal(m) {
    m.classList.add("is-open");
    m.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeModal(m) {
    m.classList.remove("is-open");
    m.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
  function bindModals() {
    elAll(".modal").forEach(function (m) {
      m.addEventListener("click", function (e) { if (e.target === m) closeModal(m); });
      var close = m.querySelector(".modal-close");
      if (close) close.addEventListener("click", function () { closeModal(m); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        elAll(".modal.is-open").forEach(closeModal);
      }
    });
  }

  /* ---------------------------- 登录 ---------------------------- */
  function updateMemberUI() {
    var toggle = el("#member-toggle");
    var entry = el("#upload-entry");
    if (toggle) toggle.textContent = state.token ? "退出 · 已登录" : "成员登录";
    if (entry) entry.hidden = !state.token;
  }

  function logout() {
    state.token = "";
    sessionStorage.removeItem("oao_token");
    updateMemberUI();
    loadMembers();
    toast("已退出登录");
  }

  function setupAuthUI() {
    var toggle = el("#member-toggle");
    var modal = el("#login-modal");
    var form = el("#login-form");
    var status = el("#login-status");
    toggle.addEventListener("click", function () {
      if (state.token) logout();
      else openModal(modal);
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var passcode = (new FormData(form).get("passcode") || "").toString();
      status.textContent = "";
      api("/api/auth", { method: "POST", body: { passcode: passcode } })
        .then(function (res) {
          if (res.ok && res.token) {
            state.token = res.token;
            sessionStorage.setItem("oao_token", res.token);
            closeModal(modal);
            form.reset();
            toast("登录成功，现在可以上传素材了");
            updateMemberUI();
            loadMembers();
          } else {
            status.textContent = res.msg || "口令不正确";
          }
        })
        .catch(function (err) { status.textContent = "登录失败：" + err.message; });
    });
  }

  /* ---------------------------- 数据加载 ---------------------------- */
  function loadData() {
    return Promise.all([
      api("/api/activities"),
      api("/api/photos"),
      api("/api/links"),
    ]).then(function (r) {
      state.activities = (r[0] && r[0].items) || [];
      state.photos = (r[1] && r[1].items) || [];
      state.links = (r[2] && r[2].items) || [];
    });
  }

  function reloadData() {
    loadData().then(renderAll).catch(function (err) {
      toast("刷新数据失败：" + err.message, true);
    });
  }

  /* ---------------------------- 渲染 ---------------------------- */
  function renderHeroStats(acts) {
    var rail = el("#stat-rail");
    if (!rail) return;
    var totalPhotos = acts.reduce(function (s, a) { return s + num(a.fields, F.activity.photoCount); }, 0);
    var totalVideos = acts.reduce(function (s, a) { return s + num(a.fields, F.activity.videoCount); }, 0);
    rail.innerHTML =
      "<div><strong>" + acts.length + "</strong><span>场校内外拍摄</span></div>" +
      "<div><strong>" + totalPhotos + "</strong><span>张照片素材</span></div>" +
      "<div><strong>" + totalVideos + "</strong><span>条视频素材</span></div>" +
      "<div><strong>26-27</strong><span>招新进行中</span></div>";
  }

  function inUnit(a, unit) {
    var u = str(a.fields, F.activity.unit);
    return u === unit || u === "两者";
  }

  function renderWorkspace(acts) {
    var photoList = el("#board-photo-list");
    var videoList = el("#board-video-list");
    var week = el("#board-week");
    var photoStatuses = ["待选片", "精修中", "待交付", "已归档"];
    var videoStatuses = ["待剪辑", "调色中", "待发布", "已发布"];

    if (photoList) {
      photoList.innerHTML = photoStatuses.map(function (label) {
        var n = acts.filter(function (a) {
          return inUnit(a, "照片组") && str(a.fields, F.activity.status) === label;
        }).length;
        return "<li><span>" + label + "</span><strong>" + n + "</strong></li>";
      }).join("");
    }
    if (videoList) {
      videoList.innerHTML = videoStatuses.map(function (label) {
        var n = acts.filter(function (a) {
          return inUnit(a, "视频组") && str(a.fields, F.activity.status) === label;
        }).length;
        return "<li><span>" + label + "</span><strong>" + n + "</strong></li>";
      }).join("");
    }
    if (week) {
      var recent = acts.map(function (a) { return str(a.fields, F.activity.name); })
        .filter(Boolean).slice(0, 3);
      var text = recent.length
        ? recent.join("、") + "，按最新日期优先。"
        : "暂无进行中的记录任务，登录后开始录入。";
      week.innerHTML =
        '<p class="panel-label">This week</p><h3>本周记录任务</h3><p>' + esc(text) + "</p>";
    }
  }

  function renderTimeline(acts) {
    var list = el("#timeline-list");
    if (!list) return;
    var sorted = acts.slice().sort(function (a, b) {
      return (str(b.fields, F.activity.date) || "").localeCompare(str(a.fields, F.activity.date) || "");
    });
    list.innerHTML = sorted.slice(0, 8).map(function (a) {
      var date = str(a.fields, F.activity.date) || "未标注日期";
      var name = str(a.fields, F.activity.name) || "未命名活动";
      var desc = str(a.fields, F.activity.desc);
      var status = str(a.fields, F.activity.status);
      var cover = fileTokens(a.fields, F.activity.cover)[0];
      var type = str(a.fields, F.activity.type);
      return '<article class="tile' + (cover ? " has-cover" : "") + '">' +
        (cover ? '<img class="tile-img" src="' + fileUrl(cover) + '" alt="' + esc(name) + '" loading="lazy" decoding="async" />' +
                 '<span class="tile-scrim"></span>' : "") +
        '<span class="tile-badge"><i></i>' + esc(type || "记录") + "</span>" +
        '<div class="tile-body">' +
          "<time>" + esc(date) + "</time>" +
          "<h3>" + esc(name) + "</h3>" +
          (desc ? "<p>" + esc(desc) + "</p>" : "") +
          (status ? '<span class="tile-status">' + esc(status) + "</span>" : "") +
        "</div><span class=\"tile-frame\"></span></article>";
    }).join("") || emptyState("还没有活动记录，登录后开始录入。");
  }

  function renderLibrary(photos) {
    var grid = el("#archive-grid");
    if (!grid) return;
    grid.innerHTML = photos.slice(0, 12).map(function (p) {
      var act = str(p.fields, F.photo.activity) || "未分类";
      var tokens = fileTokens(p.fields, F.photo.file);
      var link = str(p.fields, F.photo.link);
      var code = str(p.fields, F.photo.code);
      var note = str(p.fields, F.photo.note);
      var category = str(p.fields, F.photo.category) || "素材";
      var thumb = tokens.length
        ? '<img src="' + fileUrl(tokens[0]) + '" alt="' + esc(note || act) + '" loading="lazy" decoding="async" />'
        : '<div class="thumb-empty">OAO</div>';
      var action = link
        ? '<div class="netdisk-actions">' +
          '<a class="button ghost" href="' + esc(link) + '" target="_blank" rel="noopener">打开网盘</a>' +
          (code ? '<button class="copy-code" type="button" data-code="' + esc(code) + '">提取码 ' + esc(code) + " · 复制</button>" : "") +
          "</div>"
        : '<span class="muted-line">' + esc(note || "暂无网盘链接") + "</span>";
      return '<article class="archive-card">' + thumb +
        "<div><p class=\"panel-label\">" + esc(act) + "</p><h3>" + esc(note || act) + "</h3>" +
        "<span>" + esc(category) + "</span>" + action + "</div></article>";
    }).join("") || emptyState("素材库还是空的，登录后上传或贴网盘链接。");
  }

  function renderWorks(photos) {
    var grid = el("#gallery-grid");
    if (!grid) return;
    var withImg = photos.filter(function (p) { return fileTokens(p.fields, F.photo.file).length; });
    grid.innerHTML = withImg.map(function (p) {
      var token = fileTokens(p.fields, F.photo.file)[0];
      var cat = str(p.fields, F.photo.category) || "campus";
      var alt = str(p.fields, F.photo.note) || str(p.fields, F.photo.activity) || "照片";
      var cls = (cat === "stage" || cat === "collab" || cat === "landscape") ? "tall" : "wide";
      return '<button class="shot ' + cls + '" data-category="' + esc(cat) + '" data-full="' + fileUrl(token) + '">' +
        '<img src="' + fileUrl(token) + '" alt="' + esc(alt) + '" loading="lazy" decoding="async" /></button>';
    }).join("") || emptyState("还没有可展示的照片。");
    afterGalleryRender(grid);
  }

  function afterGalleryRender(grid) {
    if (typeof window.scheduleGalleryLayout === "function") {
      window.scheduleGalleryLayout();
    }
    grid.querySelectorAll("img").forEach(function (img) {
      if (!img.complete) {
        img.addEventListener("load", function () {
          if (typeof window.scheduleGalleryLayout === "function") window.scheduleGalleryLayout();
        });
      }
    });
  }

  function renderVideo(links) {
    var grid = el("#video-grid");
    if (!grid) return;
    var bili = links.filter(function (l) {
      var p = str(l.fields, F.link.platform);
      return p === "B站" || p === "Bilibili" || p === "bilibili";
    });
    if (bili.length) {
      grid.innerHTML = bili.map(function (l) {
        var title = str(l.fields, F.link.title) || "B站视频";
        var url = str(l.fields, F.link.url);
        var note = str(l.fields, F.link.note);
        var platform = str(l.fields, F.link.platform) || "B站";
        return '<a class="video-card-item" href="' + esc(url || "#") + '" target="_blank" rel="noopener">' +
          '<div class="video-cover"><span class="video-play">▶</span></div>' +
          "<div><span>" + esc(platform) + "</span><h3>" + esc(title) + "</h3><p>" + esc(note) + "</p></div></a>";
      }).join("");
    } else {
      grid.innerHTML = emptyState("还没有 B 站链接，稍后补充。");
    }
  }

  function renderAll() {
    renderHeroStats(state.activities);
    renderWorkspace(state.activities);
    renderTimeline(state.activities);
    renderLibrary(state.photos);
    renderWorks(state.photos);
    renderVideo(state.links);
  }

  /* ---------------------------- 上传 / 贴链接 ---------------------------- */
  function populateActivityDatalist() {
    var dl = el("#activity-list");
    if (!dl) return;
    dl.innerHTML = state.activities.map(function (a) {
      var n = str(a.fields, F.activity.name);
      return n ? '<option value="' + esc(n) + '"></option>' : "";
    }).join("");
  }

  function setupUploadUI() {
    var entry = el("#upload-entry");
    var modal = el("#upload-modal");
    var form = el("#upload-form");
    var status = el("#upload-status");

    entry.addEventListener("click", function () {
      populateActivityDatalist();
      openModal(modal);
    });

    form.querySelectorAll('input[name="mode"]').forEach(function (r) {
      r.addEventListener("change", function () {
        var isLink = (new FormData(form).get("mode")) === "link";
        el(".mode-link").hidden = !isLink;
        el(".mode-file").hidden = isLink;
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = new FormData(form);
      var mode = data.get("mode");
      var activity = (data.get("activity") || "").toString().trim();
      var note = (data.get("note") || "").toString().trim();
      if (!activity) { status.textContent = "请填写所属活动"; return; }
      status.textContent = "提交中…";

      var p;
      if (mode === "link") {
        var link = (data.get("link") || "").toString().trim();
        var code = (data.get("code") || "").toString().trim();
        if (!link) { status.textContent = "请填写网盘分享链接"; return; }
        p = api("/api/photos", { method: "POST", auth: true, body: { activity: activity, link: link, code: code, note: note } });
      } else {
        var file = form.querySelector('input[name="file"]').files[0];
        if (!file) { status.textContent = "请选择照片文件"; return; }
        p = readAsBase64(file).then(function (base64) {
          return api("/api/upload", {
            method: "POST", auth: true,
            body: {
              activity: activity, fileName: file.name,
              mime: file.type || "image/jpeg", base64: base64,
              category: data.get("category") || "campus", note: note,
            },
          });
        });
      }

      p.then(function () {
        status.textContent = "已入库 ✓";
        form.reset();
        toast(DEMO ? "演示模式：已模拟入库" : "素材已入库，稍后刷新可见");
        setTimeout(function () { closeModal(modal); }, 700);
        reloadData();
      }).catch(function (err) {
        status.textContent = "提交失败：" + err.message;
      });
    });
  }

  /* ---------------------------- 拍摄申请表单 ---------------------------- */
  function setupRequestForm() {
    var form = el("#request-form");
    var status = el("#request-status");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = new FormData(form);
      var name = (data.get("event") || "").toString().trim();
      if (!name) return;
      var date = (data.get("date") || "").toString().trim();
      var record = (data.get("record") || "").toString().trim();
      var c = data.get("creativity") || 0, a = data.get("activity") || 0, s = data.get("service") || 0;
      var desc = record + ((c || a || s) ? "\nCAS：C " + c + " / A " + a + " / S " + s : "");

      if (!CONNECTED) {
        // 静态回退：本地模拟提交
        status.textContent = "已提交「" + name + "」：C " + c + " / A " + a + " / S " + s + "。本地 UI 模拟提交成功。";
        form.reset();
        return;
      }

      status.textContent = "提交中…";
      api("/api/request", {
        method: "POST",
        body: { name: name, date: date, desc: desc, status: "待选片", unit: "照片组", type: "其他" },
      }).then(function () {
        status.textContent = DEMO
          ? "演示模式：已模拟提交，不会真正保存。"
          : "已提交「" + name + "」并写入资料库。";
        form.reset();
        reloadData();
      }).catch(function (err) {
        status.textContent = "提交失败：" + err.message;
      });
    });
  }

  /* ---------------------------- 成员资料与技能 ---------------------------- */
  function skillChip(name) {
    return '<button class="skill-chip" type="button" data-skill="' + esc(name) + '">' +
      esc(name) + "</button>";
  }

  function renderSkillPicker() {
    var pool = el("#skill-pool");
    var picked = el("#skill-selected");
    var hidden = el("#member-skills");
    if (!pool || !picked) return;

    var chosen = state.skills;
    var rest = SKILL_POOL.filter(function (n) { return chosen.indexOf(n) < 0; });

    picked.innerHTML = chosen.length
      ? chosen.map(skillChip).join("")
      : '<p class="skill-hint">把下面的技能拖进来，或者直接点一下</p>';
    pool.innerHTML = rest.length
      ? rest.map(skillChip).join("")
      : '<p class="skill-hint">技能标签都选完了</p>';
    if (hidden) hidden.value = chosen.join("、");
  }

  function addSkill(name) {
    if (name && state.skills.indexOf(name) < 0) state.skills.push(name);
    renderSkillPicker();
  }

  function removeSkill(name) {
    var i = state.skills.indexOf(name);
    if (i >= 0) state.skills.splice(i, 1);
    renderSkillPicker();
  }

  function toggleSkill(name) {
    if (state.skills.indexOf(name) < 0) addSkill(name);
    else removeSkill(name);
  }

  /*
   * 技能标签的两种操作方式：
   *  - 点一下：加入 / 移出（键盘 Enter、空格同样有效）
   *  - 拖动：用 Pointer Events 实现，鼠标和触屏都能用
   * 不用 HTML5 的 dragstart/drop —— 那套 API 在手机浏览器上根本不触发。
   */
  function setupSkillPicker() {
    var pool = el("#skill-pool");
    var picked = el("#skill-selected");
    if (!pool || !picked) return;

    var drag = null;
    /*
     * 拖拽结束后要吃掉紧跟的那次 click，否则一次拖动会被当成一次点击、把刚拖进来的标签又弹回去。
     * 这里用时间戳而不是布尔开关：触屏拖动结束后浏览器不一定补发 click，
     * 布尔开关会一直卡在 true，把用户下一次真实点击吞掉。
     */
    var lastDragEnd = 0;

    function chipFrom(target) {
      return target && target.closest ? target.closest(".skill-chip") : null;
    }

    function zoneAt(x, y) {
      var node = document.elementFromPoint ? document.elementFromPoint(x, y) : null;
      while (node) {
        if (node.getAttribute && node.getAttribute("data-zone")) return node;
        node = node.parentElement;
      }
      return null;
    }

    function onClick(e) {
      var chip = chipFrom(e.target);
      if (!chip) return;
      if (Date.now() - lastDragEnd < 400) return;
      toggleSkill(chip.getAttribute("data-skill"));
    }

    function onDown(e) {
      var chip = chipFrom(e.target);
      if (!chip) return;
      var r = chip.getBoundingClientRect();
      drag = {
        skill: chip.getAttribute("data-skill"), chip: chip,
        x: e.clientX, y: e.clientY,
        /* 记住手指按在标签内的哪个位置，拖动时保持不变。
           否则标签会「跳」到指针正中，手感像被抢走。 */
        grabX: e.clientX - r.left, grabY: e.clientY - r.top,
        w: r.width, h: r.height,
        pointerId: e.pointerId,
        moved: false, ghost: null,
      };
      /* 指针捕获：指针移出标签甚至移出窗口也不丢跟踪 */
      if (chip.setPointerCapture && e.pointerId != null) {
        try { chip.setPointerCapture(e.pointerId); } catch (err) {}
      }
    }

    function onMove(e) {
      if (!drag) return;
      if (!drag.moved) {
        /* 约 10px 的位移阈值，低于此仍算点击 */
        if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 10) return;
        drag.moved = true;
        drag.chip.classList.add("dragging");
        var g = document.createElement("button");
        g.className = "skill-chip skill-ghost";
        g.textContent = drag.skill;
        document.body.appendChild(g);
        drag.ghost = g;
      }
      if (e.cancelable) e.preventDefault();
      drag.ghost.style.width = drag.w + "px";
      drag.ghost.style.left = (e.clientX - drag.grabX) + "px";
      drag.ghost.style.top = (e.clientY - drag.grabY) + "px";
      var z = zoneAt(e.clientX, e.clientY);
      pool.classList.toggle("drop-active", z === pool);
      picked.classList.toggle("drop-active", z === picked);
    }

    function onUp(e) {
      if (!drag) return;
      var d = drag;
      drag = null;
      if (d.chip.releasePointerCapture && d.pointerId != null) {
        try { d.chip.releasePointerCapture(d.pointerId); } catch (err) {}
      }
      pool.classList.remove("drop-active");
      picked.classList.remove("drop-active");
      if (d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
      d.chip.classList.remove("dragging");
      if (!d.moved) return; // 没移动，交给 click 处理
      lastDragEnd = Date.now();
      var z = zoneAt(e.clientX, e.clientY);
      if (!z) return;
      if (z.getAttribute("data-zone") === "selected") addSkill(d.skill);
      else removeSkill(d.skill);
    }

    pool.addEventListener("click", onClick);
    picked.addEventListener("click", onClick);
    pool.addEventListener("pointerdown", onDown);
    picked.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);

    renderSkillPicker();
  }

  /* 名册只展示姓名/班级/职位/技能。学号是个人信息，不往页面上放。 */
  function renderRoster() {
    var box = el("#roster-list");
    if (!box) return;
    if (!CONNECTED) {
      box.innerHTML = emptyState("接入数据库后，这里会列出已登记的成员。");
      return;
    }
    if (!DEMO && !state.token) {
      box.innerHTML = emptyState("成员名册含个人信息，登录后可见。");
      return;
    }
    box.innerHTML = state.members.map(function (m) {
      var f = m.fields;
      var name = str(f, F.member.name);
      var meta = [str(f, F.member.klass), str(f, F.member.gender)].filter(Boolean).join(" · ");
      var role = str(f, F.member.role);
      var skills = str(f, F.member.skills)
        .split(/[、,，]/).map(function (t) { return t.trim(); }).filter(Boolean);
      return '<article class="roster-card">' +
        '<div class="roster-top"><strong>' + esc(name || "未具名") + "</strong>" +
        (role ? '<span class="roster-role">' + esc(role) + "</span>" : "") + "</div>" +
        (meta ? '<p class="roster-meta">' + esc(meta) + "</p>" : "") +
        (skills.length ? '<p class="roster-skills">' +
          skills.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</p>" : "") +
        "</article>";
    }).join("") || emptyState("还没有人登记资料。");
  }

  function loadMembers() {
    if (!CONNECTED) { renderRoster(); return Promise.resolve(); }
    if (!DEMO && !state.token) { state.members = []; renderRoster(); return Promise.resolve(); }
    return api("/api/members", { auth: true }).then(function (r) {
      state.members = (r && r.items) || [];
      renderRoster();
    }).catch(function () {
      state.members = [];
      renderRoster();
    });
  }

  function setupMemberForm() {
    var form = el("#member-form");
    var status = el("#member-status");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var d = new FormData(form);
      function val(k) { return (d.get(k) || "").toString().trim(); }
      var payload = {
        name: val("name"), klass: val("klass"), studentId: val("studentId"),
        gender: val("gender"), role: val("role"), note: val("note"),
        skills: state.skills.join("、"),
      };
      if (!payload.studentId) { status.textContent = "请填写学号。"; return; }
      if (!state.skills.length) { status.textContent = "至少选一个技能标签。"; return; }

      if (!CONNECTED) {
        status.textContent = "已记录「" + payload.name + "」：" + payload.skills + "。本地 UI 模拟提交，未真正保存。";
        return;
      }
      if (!DEMO && !state.token) {
        status.textContent = "成员资料需要登录后才能保存，请先点右上角「成员登录」。";
        return;
      }

      status.textContent = "保存中…";
      api("/api/members", { method: "POST", auth: true, body: payload }).then(function (res) {
        if (DEMO) {
          status.textContent = "演示模式：已模拟保存，不会真正写入。";
        } else {
          status.textContent = res && res.updated
            ? "已按学号更新你的资料。"
            : "资料已保存，谢谢！";
          form.reset();
          state.skills = [];
          renderSkillPicker();
        }
        loadMembers();
      }).catch(function (err) {
        status.textContent = "保存失败：" + err.message;
      });
    });
  }

  /* ---------------------------- AI 自动分组 ---------------------------- */
  /*
   * 前端只负责发请求和展示。模型和密钥都在云函数那边，
   * 这里拿到什么就画什么，并且把校验出的 warnings 原样显示 —— 结果要给人复核，不能装作一定对。
   */
  function renderGroups(res) {
    var box = el("#group-result");
    if (!box) return;
    var groups = (res && res.groups) || [];
    var warns = (res && res.warnings) || [];

    var warnHtml = warns.length
      ? '<ul class="group-warnings">' +
        warns.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>"
      : "";

    box.innerHTML = warnHtml + groups.map(function (g) {
      var names = (g.members || []).map(function (n) { return "<span>" + esc(n) + "</span>"; }).join("");
      var skills = (g.skills || []).join("、");
      return '<article class="group-card">' +
        "<h4>" + esc(g.name || "未命名组") + '<em>' + (g.members || []).length + " 人</em></h4>" +
        '<p class="group-members">' + names + "</p>" +
        (skills ? '<p class="group-skills">技能覆盖：' + esc(skills) + "</p>" : "") +
        (g.reason ? '<p class="group-reason">' + esc(g.reason) + "</p>" : "") +
        "</article>";
    }).join("");
  }

  function setupGrouping() {
    var btn = el("#group-run");
    var status = el("#group-status");
    var countInput = el("#group-count");
    if (!btn) return;

    btn.addEventListener("click", function () {
      var n = parseInt((countInput && countInput.value) || "0", 10);
      if (!n || n < 2 || n > 20) { status.textContent = "组数请填 2–20 之间的整数。"; return; }
      if (!DEMO && !state.token) { status.textContent = "请先登录再分组。"; return; }

      status.textContent = "分组中…";
      btn.disabled = true;
      api("/api/group", { method: "POST", auth: true, body: { groupCount: n } })
        .then(function (res) {
          status.textContent = res.source === "demo"
            ? "演示模式：下面是模拟结果，不是模型算的。"
            : "分组完成，请人工复核后再执行。" +
              (res.saved ? "已留档到「分组」表（批次 " + res.batch + "），可在飞书里手动调整。" : "");
          renderGroups(res);
        })
        .catch(function (err) {
          renderGroups(null);
          if (err.code === "LLM_NOT_CONFIGURED" || err.code === "LLM_NOT_IMPLEMENTED") {
            // 接口已通，只是模型还没接上 —— 说清楚，别让人以为是坏了
            status.textContent = "接口已就绪，但还没接大模型：" + err.message;
          } else {
            status.textContent = "分组失败：" + err.message;
          }
        })
        .then(function () { btn.disabled = false; });
    });
  }

  /* ---------------------------- 初始化 ---------------------------- */
  function init() {
    bindModals();
    setupRequestForm();
    setupSkillPicker();
    setupMemberForm();
    setupGrouping();

    if (!CONNECTED) {
      var zone = el(".member-zone");
      if (zone) zone.style.display = "none";
      renderRoster();
      return;
    }

    setupAuthUI();
    setupUploadUI();
    updateMemberUI();

    if (DEMO) {
      showDemoBadge();
      toast("演示模式：展示内置示例数据");
    }

    loadData().then(renderAll).catch(function (err) {
      toast("后端连接失败，先展示离线内容：" + err.message, true);
    });
    loadMembers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
