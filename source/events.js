/**
 * OAO 摄影社 · v4：拍摄日历 / 报名 / 我的任务 / 交付 / 管理后台
 * ------------------------------------------------------------------
 * 依赖 app.js 暴露的 window.OAO（api / 登录态 / 弹窗 / toast）。
 * 日历所有人可看（站点密码之后）；报名、交付需要成员口令；
 * 管理后台只在用管理员口令登录后出现，所有管理接口在服务端再校验一次。
 * AI 按钮只在点击时调用，花费显示在按钮旁边。
 */
(function () {
  "use strict";

  /* ---------------- 纯函数（也给 events.test.js 用） ---------------- */
  var CATS = [
    ["篮球", "bb"], ["足球", "fb"], ["匹克球", "pk"], ["乒乓球", "tt"], ["长绳", "jr"], ["文化周", "cw"], ["其他", "ot"],
  ];
  var CAT_KEY = {};
  CATS.forEach(function (c) { CAT_KEY[c[0]] = c[1]; });
  /* 期中考试周：只是日历上的标注，不是任务 */
  var EXAMS = [{ from: "2026-11-02", to: "2026-11-06", label: "期中考试" }];
  var WEEK = ["一", "二", "三", "四", "五", "六", "日"];

  function catKey(c) { return CAT_KEY[c] || "ot"; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
  function parseYmd(s) { var p = String(s).split("-"); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function dowMon(y, m, d) { return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; } // 周一 = 0
  function daysIn(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function addDays(s, n) {
    var p = parseYmd(s), t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
    return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  function examOf(day) {
    for (var i = 0; i < EXAMS.length; i++) if (day >= EXAMS[i].from && day <= EXAMS[i].to) return EXAMS[i];
    return null;
  }
  function cnDate(s, withWeek) {
    var p = parseYmd(s);
    return p.m + "月" + p.d + "日" + (withWeek ? " 周" + WEEK[dowMon(p.y, p.m, p.d)] : "");
  }
  function shortTitle(e) {
    var t = String(e.title || "");
    if (e.category && t.indexOf(e.category + " ") === 0) t = t.slice(e.category.length + 1);
    return t || e.title || "任务";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  /* 一个月的格子：周一开头，前后补齐整周 */
  function monthCells(y, m) {
    var first = dowMon(y, m, 1), n = daysIn(y, m), cells = [];
    var start = addDays(ymd(y, m, 1), -first);
    var total = Math.ceil((first + n) / 7) * 7;
    for (var i = 0; i < total; i++) {
      var day = addDays(start, i), p = parseYmd(day);
      cells.push({ day: day, d: p.d, inMonth: p.m === m, dow: i % 7 });
    }
    return cells;
  }
  function byDay(events) {
    var map = {};
    events.forEach(function (e) { (map[e.date] = map[e.date] || []).push(e); });
    Object.keys(map).forEach(function (k) {
      map[k].sort(function (a, b) { return String(a.time).localeCompare(String(b.time)); });
    });
    return map;
  }
  function evClass(e) {
    return "c-" + catKey(e.category) + (e.status === "已取消" ? " is-cancel" : "") + (e.ended ? " is-ended" : "");
  }
  /* v4.1 CAS 时间：「C 1 · S 1.5」（没有 A）。缺值按 1 显示；飞书可能给字符串 "1.5"。
   * 桌面月历格子里不放可见标签（1280px 下会把 5/24 个任务名截断），只放在悬停提示和读屏文字里；
   * 任务详情和手机议程里完整显示。 */
  function casNum(v) {
    var n = Number(v);
    if (v == null || v === "" || !isFinite(n) || n < 0) n = 1;
    n = Math.round(n * 100) / 100;
    return String(n);
  }
  function casText(e) { return "C " + casNum(e && e.casC) + " · S " + casNum(e && e.casS); }
  function countText(e, counts) {
    var c = (counts && counts[e.id]) || { applied: 0 };
    return "报名 " + c.applied + (e.need ? " / 需 " + e.need + " 人" : "");
  }
  function renderMonthHTML(y, m, events, today, counts) {
    var map = byDay(events), MAX = 3;
    var head = WEEK.map(function (w, i) { return '<div class="cal-head' + (i > 4 ? " is-weekend" : "") + '" role="columnheader">' + w + "</div>"; }).join("");
    var body = monthCells(y, m).map(function (c) {
      var list = map[c.day] || [], ex = examOf(c.day);
      var cls = "cal-cell" + (c.inMonth ? "" : " is-out") + (c.day === today ? " is-today" : "") +
        (c.dow > 4 ? " is-weekend" : "") + (ex ? " is-exam" : "") + (list.length ? " has-ev" : "");
      var evs = list.slice(0, MAX).map(function (e) {
        return '<button class="cal-ev ' + evClass(e) + '" type="button" data-ev="' + esc(e.id) + '" title="' + esc(e.title + " · " + (e.time || "") + " · CAS 时间 " + casText(e)) +
          '" aria-label="' + esc(e.title + "，" + cnDate(e.date) + " " + (e.time || "") + "，" + e.status + "，CAS 时间 " + casText(e)) + '"><i aria-hidden="true"></i><span>' + esc(shortTitle(e)) + "</span></button>";
      }).join("");
      var more = list.length > MAX ? '<button class="cal-more" type="button" data-day="' + c.day + '">还有 ' + (list.length - MAX) + " 项</button>" : "";
      return '<div class="' + cls + '" role="gridcell" data-date="' + c.day + '">' +
        '<span class="cal-d"' + (c.day === today ? ' aria-current="date"' : "") + ">" + c.d + "</span>" +
        (ex && c.inMonth ? '<span class="cal-exam">' + esc(ex.label) + "</span>" : "") +
        '<div class="cal-evs">' + evs + more + "</div></div>";
    }).join("");
    return head + body;
  }
  function renderAgendaHTML(y, m, events, today, counts) {
    var map = byDay(events), out = "", n = daysIn(y, m), weekOpen = false, any = false, examShown = {};
    for (var d = 1; d <= n; d++) {
      var day = ymd(y, m, d), dow = dowMon(y, m, d), list = map[day] || [], ex = examOf(day);
      if (dow === 0 || d === 1) {
        if (weekOpen) out += "</div>";
        var wEnd = addDays(day, 6 - dow);
        out += '<div class="ag-week"><p class="ag-week-h">' + cnDate(day) + " – " + cnDate(wEnd) + "</p>";
        weekOpen = true;
      }
      if (ex && !examShown[ex.from]) {
        examShown[ex.from] = 1; any = true;
        out += '<div class="ag-exam"><span>' + esc(ex.label) + "</span>" + cnDate(ex.from) + " – " + cnDate(ex.to) + " · 这周没有拍摄任务</div>";
      }
      if (!list.length) continue;
      any = true;
      out += '<div class="ag-day' + (day === today ? " is-today" : "") + '"><div class="ag-date"><strong>' + d + "</strong><span>周" + WEEK[dow] + "</span></div><div class=\"ag-list\">" +
        list.map(function (e) {
          return '<button class="ag-ev ' + evClass(e) + '" type="button" data-ev="' + esc(e.id) + '"><i aria-hidden="true"></i><span class="ag-t">' + esc(e.title) +
            '</span><span class="ag-m">' + esc(e.time || "全天") + " · " + esc(e.status === "开放报名" && !e.ended ? countText(e, counts) : e.ended && e.status !== "已取消" ? "已结束" : e.status) + "</span>" +
            casLine(e) + "</button>";
        }).join("") + "</div></div>";
    }
    if (weekOpen) out += "</div>";
    return any ? out : '<div class="empty-state">这个月还没有拍摄任务。</div>';
  }
  function casLine(e) { return '<span class="ag-cas"><b>CAS 时间</b>' + esc(casText(e)) + "</span>"; }
  var pure = { monthCells: monthCells, renderMonthHTML: renderMonthHTML, renderAgendaHTML: renderAgendaHTML, catKey: catKey, shortTitle: shortTitle, casText: casText, EXAMS: EXAMS, CATS: CATS };
  if (typeof module !== "undefined" && module.exports) { module.exports = pure; return; }
  window.OAOCal = pure;

  /* ---------------- 页面逻辑 ---------------- */
  var O = window.OAO;
  if (!O || !document.querySelector) return;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  var S = {
    events: [], counts: {}, today: "", loaded: false, error: "",
    y: 0, m: 0,
    mine: [], me: readMe(),
    admin: null, adminFilter: "active", adminQuery: "", staffing: {},
    editing: null,
  };
  function readMe() { try { return JSON.parse(localStorage.getItem("oao_me") || "null") || {}; } catch (e) { return {}; } }
  function saveMe(name, sid) {
    S.me = { name: name, sid: sid };
    try { localStorage.setItem("oao_me", JSON.stringify(S.me)); } catch (e) {}
  }
  function isMember() { return !!O.token(); }
  function isAdmin() { return !!O.token() && O.role() === "admin"; }
  function localToday() { var t = new Date(Date.now() + 8 * 3600e3); return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
  function evById(id) { for (var i = 0; i < S.events.length; i++) if (S.events[i].id === id) return S.events[i]; return null; }
  function myAppFor(id) {
    for (var i = 0; i < S.mine.length; i++) if (S.mine[i].eventId === id && S.mine[i].status !== "已取消") return S.mine[i];
    return null;
  }
  function pill(st) {
    var k = { "已报名": "p-applied", "已确认": "p-ok", "已交付": "p-done", "已验收": "p-accept", "已退回": "p-back", "已取消": "p-cancel",
      "开放报名": "p-open", "已安排": "p-ok", "已结束": "p-muted" }[st] || "p-muted";
    return '<span class="pill ' + k + '">' + esc(st) + "</span>";
  }
  function phase(e) {
    if (e.status === "已取消") return "已取消";
    if (e.ended) return "已结束";
    return e.status;
  }
  function aiCostLine(r) {
    if (!r || r.cost == null) return "";
    return "本次约 ¥" + Number(r.cost).toFixed(4) + " · 本月已用 ¥" + Number(r.spent || 0).toFixed(2) + " / ¥" + (r.cap || 20);
  }

  /* ---------------- 日历 ---------------- */
  function legend() {
    var box = $("#cal-legend");
    if (!box) return;
    box.innerHTML = CATS.slice(0, 6).map(function (c) {
      return '<span class="lg c-' + c[1] + '"><i aria-hidden="true"></i>' + c[0] + "</span>";
    }).join("") + '<span class="lg lg-exam"><i aria-hidden="true"></i>期中考试</span>';
  }
  function renderCalendar() {
    var grid = $("#cal-grid"), ag = $("#cal-agenda"), title = $("#cal-month");
    if (!grid) return;
    if (title) title.textContent = S.y + "年" + S.m + "月";
    if (!S.loaded) {
      grid.innerHTML = '<div class="skel skel-cal" aria-hidden="true"></div>';
      if (ag) ag.innerHTML = '<div class="skel skel-card" aria-hidden="true"><i></i><i></i></div>';
      return;
    }
    if (S.error) {
      var err = '<div class="empty-state is-error"><p>日历暂时加载不了：' + esc(S.error) + '</p><button class="button ghost" type="button" data-cal="retry">重试</button></div>';
      grid.innerHTML = err; if (ag) ag.innerHTML = err;
      return;
    }
    grid.innerHTML = renderMonthHTML(S.y, S.m, S.events, S.today, S.counts);
    if (ag) ag.innerHTML = renderAgendaHTML(S.y, S.m, S.events, S.today, S.counts);
  }
  function shiftMonth(delta) {
    var m = S.m + delta, y = S.y;
    if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
    S.y = y; S.m = m;
    var shell = $("#cal-shell");
    if (shell && shell.animate && !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      [$("#cal-grid"), $("#cal-agenda")].forEach(function (n) {
        if (n) n.animate([{ opacity: 0, transform: "translateX(" + (delta > 0 ? 24 : -24) + "px)" }, { opacity: 1, transform: "none" }],
          { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      });
    }
    renderCalendar();
  }
  function loadEvents() {
    return O.api("/api/events").then(function (r) {
      S.events = r.items || []; S.counts = r.counts || {}; S.today = r.today || localToday();
      S.loaded = true; S.error = "";
      if (!S.y) { var t = parseYmd(S.today); S.y = t.y; S.m = t.m; }
      renderCalendar();
    }).catch(function (e) {
      S.loaded = true; S.error = e.message;
      if (!S.y) { var t = parseYmd(localToday()); S.y = t.y; S.m = t.m; }
      renderCalendar();
    });
  }

  /* ---------------- 任务详情 / 报名 ---------------- */
  function openEvent(id) {
    var e = evById(id);
    if (!e) return;
    renderEventBody(e);
    O.openModal($("#event-modal"));
  }
  function openDay(day) {
    var list = S.events.filter(function (e) { return e.date === day; });
    var ex = examOf(day);
    $("#ev-body").innerHTML = '<p class="eyebrow">Day</p><h3 id="ev-title">' + esc(cnDate(day, true)) + "</h3>" +
      (ex ? '<p class="modal-note">' + esc(ex.label) + "</p>" : "") +
      '<div class="day-list">' + list.map(function (e) {
        return '<button class="ag-ev ' + evClass(e) + '" type="button" data-ev="' + esc(e.id) + '"><i aria-hidden="true"></i><span class="ag-t">' + esc(e.title) +
          '</span><span class="ag-m">' + esc(e.time || "全天") + " · " + esc(phase(e)) + "</span>" + casLine(e) + "</button>";
      }).join("") + "</div>";
    O.openModal($("#event-modal"));
  }
  function renderEventBody(e) {
    var c = S.counts[e.id] || { applied: 0, confirmed: 0 };
    var mine = myAppFor(e.id);
    var rows = [
      ["日期", cnDate(e.date, true)], ["时间", e.time || "全天"], ["CAS 时间", casText(e)], e.place ? ["地点", e.place] : null,
      ["报名", c.applied + " 人" + (e.need ? "（需要 " + e.need + " 人）" : "") + (c.confirmed ? " · 已确认 " + c.confirmed : "")],
    ].filter(Boolean);
    var action = "";
    if (e.status === "已取消") action = '<p class="ev-hint">这个任务已取消。</p>';
    else if (mine) {
      action = '<div class="ev-mine"><p>你已报名 ' + pill(mine.status) + "</p>" +
        (e.ended && ["已报名", "已确认", "已退回", "已交付"].indexOf(mine.status) >= 0
          ? '<button class="button primary" type="button" data-deliver="' + esc(mine.id) + '">' + (mine.status === "已交付" ? "重新交付" : "交付素材") + "</button>" : "") +
        (!e.ended && ["已报名", "已确认"].indexOf(mine.status) >= 0
          ? '<button class="button ghost" type="button" data-cancel="' + esc(mine.id) + '">取消报名</button>' : "") +
        (!e.ended ? '<p class="ev-hint">任务结束后，这里会出现「交付素材」。</p>' : "") + "</div>";
    } else if (e.ended) action = '<p class="ev-hint">任务已经结束。参加了但没报名？请联系管理员补登记。</p>';
    else if (e.status !== "开放报名") action = '<p class="ev-hint">这个任务目前「' + esc(e.status) + "」，暂不接受报名。</p>";
    else if (!isMember()) action = '<button class="button primary" type="button" data-login-apply="' + esc(e.id) + '">成员登录后报名</button><p class="ev-hint">报名需要社团成员口令。</p>';
    else {
      action = '<form class="apply-form" id="apply-form" data-ev="' + esc(e.id) + '">' +
        '<div class="ed-row"><label><span>姓名</span><input name="name" type="text" maxlength="30" autocomplete="name" required value="' + esc(S.me.name || "") + '" /></label>' +
        '<label><span>学号</span><input name="sid" type="text" maxlength="32" inputmode="text" autocomplete="off" required value="' + esc(S.me.sid || "") + '" /></label></div>' +
        '<button class="button primary" type="submit">报名这个任务</button><p class="modal-status" id="apply-status" aria-live="polite"></p>' +
        '<p class="ev-hint">姓名和学号会记在这台设备上，下次自动填好。</p></form>';
    }
    $("#ev-body").innerHTML =
      '<span class="ev-cat c-' + catKey(e.category) + '"><i aria-hidden="true"></i>' + esc(e.category) + "</span>" +
      '<h3 id="ev-title" class="ev-title">' + esc(e.title) + "</h3>" +
      '<p class="ev-status">' + pill(phase(e)) + "</p>" +
      '<dl class="ev-meta">' + rows.map(function (r) { return "<div><dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd></div>"; }).join("") + "</dl>" +
      (e.note ? '<p class="ev-note">' + esc(e.note) + "</p>" : "") +
      '<div class="ev-actions">' + action + "</div>" +
      (isAdmin() ? '<p class="ev-admin"><a href="#admin" data-admin-jump="' + esc(e.id) + '">在管理后台查看报名 →</a></p>' : "");
  }
  function submitApply(form) {
    var id = form.getAttribute("data-ev"), st = form.querySelector(".modal-status");
    var name = form.name.value.trim(), sid = form.sid.value.trim();
    if (!name || !/^[A-Za-z0-9_-]{2,32}$/.test(sid)) { st.textContent = "请填写姓名和正确的学号"; return; }
    st.textContent = "报名中…";
    O.api("/api/events/" + id + "/apply", { method: "POST", auth: true, body: { name: name, studentId: sid } }).then(function (r) {
      saveMe(name, sid);
      O.toast(r.already ? "你已经报过名了" : "报名成功 ✓");
      return Promise.all([loadEvents(), loadMine()]);
    }).then(function () {
      var e = evById(id); if (e) renderEventBody(e);
    }).catch(function (err) { st.textContent = "报名失败：" + err.message; });
  }
  function cancelApp(appId) {
    if (!window.confirm("确定取消报名吗？")) return;
    O.api("/api/applications/" + appId + "/cancel", { method: "POST", auth: true, body: { studentId: S.me.sid } }).then(function () {
      O.toast("已取消报名");
      return Promise.all([loadEvents(), loadMine()]);
    }).then(refreshOpenEvent).catch(function (e) { O.toast("取消失败：" + e.message, true); });
  }
  var openEventId = "";
  function refreshOpenEvent() {
    var m = $("#event-modal");
    if (openEventId && m && m.classList.contains("is-open")) { var e = evById(openEventId); if (e) renderEventBody(e); }
  }

  /* ---------------- 我的任务 ---------------- */
  function loadMine() {
    if (!isMember() || !S.me.sid) { S.mine = []; renderMine(); return Promise.resolve(); }
    return O.api("/api/my?sid=" + encodeURIComponent(S.me.sid), { auth: true }).then(function (r) {
      S.mine = r.items || []; renderMine();
    }).catch(function (e) { S.mine = []; renderMine(e.message); });
  }
  function renderMine(err) {
    var box = $("#my-tasks");
    if (!box) return;
    if (!isMember()) {
      box.innerHTML = '<div class="mt-locked"><p>想报名拍摄？成员登录后点日历上的任务即可报名，结束后在这里交付素材。</p><button class="button ghost" type="button" data-action="login">成员登录</button></div>';
      return;
    }
    var head = '<div class="mt-head"><div><p class="panel-label">My Tasks</p><h3>我的任务</h3></div>' +
      (S.me.sid ? '<button class="mt-who" type="button" data-me-reset>' + esc(S.me.name || "我") + " · " + esc(S.me.sid) + ' · 切换</button>' : "") + "</div>";
    if (!S.me.sid) {
      box.innerHTML = head + '<form class="mt-id" id="me-form"><p>输入姓名和学号，查看你报名的任务（只存在这台设备上）。</p><div class="ed-row">' +
        '<label><span>姓名</span><input name="name" type="text" maxlength="30" required /></label>' +
        '<label><span>学号</span><input name="sid" type="text" maxlength="32" required /></label></div>' +
        '<button class="button ghost" type="submit">查看我的任务</button></form>';
      return;
    }
    if (err) { box.innerHTML = head + '<div class="empty-state is-error">加载失败：' + esc(err) + "</div>"; return; }
    var list = S.mine.filter(function (a) { return a.status !== "已取消"; });
    box.innerHTML = head + (list.length ? '<div class="mt-list">' + list.map(function (a) {
      var e = a.event || { title: a.eventTitle, category: "其他", date: "", time: "" };
      var canDeliver = e.ended && ["已报名", "已确认", "已退回", "已交付"].indexOf(a.status) >= 0;
      var canCancel = !e.ended && ["已报名", "已确认"].indexOf(a.status) >= 0;
      return '<article class="mt-item c-' + catKey(e.category) + '"><i class="mt-dot" aria-hidden="true"></i><div class="mt-main">' +
        '<button class="mt-title" type="button" data-ev="' + esc(a.eventId) + '">' + esc(e.title || a.eventTitle) + "</button>" +
        '<p class="mt-meta">' + esc(e.date ? cnDate(e.date, true) : "") + " " + esc(e.time || "") + "</p>" +
        (a.adminNote && a.status === "已退回" ? '<p class="mt-note">管理员：' + esc(a.adminNote) + "</p>" : "") +
        (a.link ? '<p class="mt-link"><a href="' + esc(a.link) + '" target="_blank" rel="noopener">已交付的网盘链接 ↗</a></p>' : "") +
        '</div><div class="mt-side">' + pill(a.status) +
        (canDeliver ? '<button class="button primary mini" type="button" data-deliver="' + esc(a.id) + '">' + (a.status === "已交付" ? "重新交付" : "交付") + "</button>" : "") +
        (canCancel ? '<button class="button ghost mini" type="button" data-cancel="' + esc(a.id) + '">取消</button>' : "") +
        "</div></article>";
    }).join("") + "</div>" : '<div class="empty-state">还没有报名任务。点上面日历里的任务就能报名。</div>');
  }

  /* ---------------- 交付 ---------------- */
  var delivering = null;
  function openDeliver(appId) {
    var a = null;
    S.mine.forEach(function (x) { if (x.id === appId) a = x; });
    if (!a) { O.toast("找不到这条报名，请刷新后再试", true); return; }
    delivering = a;
    var f = $("#deliver-form");
    f.reset();
    f.link.value = a.link || ""; f.code.value = a.code || ""; f.desc.value = a.desc || "";
    f.caption.value = a.caption || "";
    $("#dl-caption-wrap").hidden = !a.caption;
    $("#dl-status").textContent = ""; $("#dl-ai-cost").textContent = "";
    var e = a.event || {};
    $("#dl-event").textContent = (e.title || a.eventTitle) + (e.date ? " · " + cnDate(e.date, true) : "");
    O.closeModal($("#event-modal"));
    O.openModal($("#deliver-modal"));
  }
  var BAIDU = /^https:\/\/pan\.baidu\.com\/(s\/[A-Za-z0-9_-]{6,}|share\/init\?surl=[A-Za-z0-9_-]{4,})([?&#][^\s<>"']*)?$/;
  function submitDeliver(f) {
    var st = $("#dl-status");
    var link = f.link.value.trim(), code = f.code.value.trim(), desc = f.desc.value.trim();
    // 链接里常带 ?pwd=xxxx，顺手把提取码补上
    var pm = link.match(/[?&]pwd=([A-Za-z0-9]{4})/);
    if (!code && pm) { code = pm[1]; f.code.value = code; }
    if (!BAIDU.test(link)) { st.textContent = "请粘贴百度网盘分享链接（https://pan.baidu.com/s/…）"; f.link.focus(); return; }
    if (code && !/^[A-Za-z0-9]{4}$/.test(code)) { st.textContent = "提取码是 4 位字母或数字"; f.code.focus(); return; }
    if (!desc) { st.textContent = "写一句素材描述"; f.desc.focus(); return; }
    st.textContent = "提交中…";
    O.api("/api/applications/" + delivering.id + "/deliver", { method: "POST", auth: true,
      body: { studentId: S.me.sid, link: link, code: code, desc: desc, caption: f.caption.value.trim() } }).then(function () {
      st.textContent = "已交付 ✓";
      O.toast("素材已交付，等管理员验收");
      setTimeout(function () { O.closeModal($("#deliver-modal")); }, 700);
      loadMine(); loadEvents();
    }).catch(function (e) { st.textContent = "提交失败：" + e.message; });
  }
  function aiCaption(btn) {
    var f = $("#deliver-form"), desc = f.desc.value.trim(), cost = $("#dl-ai-cost");
    if (desc.length < 4) { $("#dl-status").textContent = "先写几句素材描述，再让 AI 润色"; return; }
    btn.disabled = true; cost.textContent = "AI 正在润色…";
    var e = (delivering && delivering.event) || {};
    O.api("/api/ai/caption", { method: "POST", auth: true, body: { desc: desc, eventTitle: e.title || (delivering && delivering.eventTitle) || "" } }).then(function (r) {
      f.caption.value = (r.caption || "") + (r.tags && r.tags.length ? " " + r.tags.join(" ") : "");
      $("#dl-caption-wrap").hidden = false;
      cost.textContent = aiCostLine(r);
    }).catch(function (err) { cost.textContent = err.message; }).then(function () { btn.disabled = false; });
  }

  /* ---------------- 管理后台 ---------------- */
  function showAdmin(on) {
    var sec = $("#admin");
    if (!sec) return;
    sec.hidden = !on;
    if (on) loadAdmin();
  }
  function loadAdmin() {
    var k = $("#adm-kpis");
    if (k && !S.admin) k.innerHTML = '<div class="skel skel-card" aria-hidden="true"><i></i><i></i></div>';
    return O.api("/api/admin/overview", { auth: true }).then(function (r) {
      S.admin = r; renderAdmin();
      var u = $("#adm-updated"); if (u) u.textContent = "更新于 " + new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    }).catch(function (e) {
      if (e.status === 401 || e.status === 403) { showAdmin(false); return; }
      if (k) k.innerHTML = '<div class="empty-state is-error">后台数据加载失败：' + esc(e.message) + "</div>";
    });
  }
  function kpi(n, label, hint) {
    return '<div class="kpi"><strong>' + esc(n) + "</strong><span>" + esc(label) + "</span>" + (hint ? "<em>" + esc(hint) + "</em>" : "") + "</div>";
  }
  function bars(obj, order, cls) {
    var total = order.reduce(function (s, k) { return s + (obj[k] || 0); }, 0) || 1;
    return '<div class="stack ' + cls + '">' + order.map(function (k, i) {
      var v = obj[k] || 0;
      return v ? '<i class="s' + i + '" style="flex:' + v + '" title="' + esc(k + " " + v) + '"></i>' : "";
    }).join("") + '</div><ul class="stack-legend">' + order.map(function (k, i) {
      return '<li><i class="s' + i + '"></i>' + esc(k) + "<b>" + (obj[k] || 0) + "</b></li>";
    }).join("") + "</ul>";
  }
  function renderAdmin() {
    var a = S.admin; if (!a) return;
    var st = a.stats;
    $("#adm-kpis").innerHTML = kpi(st.events, "拍摄任务") + kpi(st.applications, "报名", (a.pipeline.applications["已交付"] || 0) + " 待验收") +
      kpi(st.requests, "拍摄申请") + kpi(st.members, "成员") + kpi(st.activities, "活动记录") + kpi(st.photos, "照片素材") + kpi(st.links, "作品链接");
    $("#adm-pipeline").innerHTML = '<p class="panel-label">Pipeline</p><h3>流程概览</h3><p class="adm-sub">任务状态</p>' +
      bars(a.pipeline.events, a.options.eventStatus, "ev") + '<p class="adm-sub">报名状态</p>' + bars(a.pipeline.applications, a.options.appStatus, "ap");
    renderAiCard();
    $("#adm-week").innerHTML = '<p class="panel-label">Next 7 days</p><h3>未来一周</h3>' + (a.upcoming.length ? '<ul class="adm-list">' + a.upcoming.map(function (e) {
      var n = e.applicants ? e.applicants.length : ((S.counts[e.id] || {}).applied || 0);
      return '<li class="c-' + catKey(e.category) + '"><i></i><button type="button" data-adm-open="' + esc(e.id) + '">' + esc(e.title) + "</button><span>" + esc(cnDate(e.date, true)) + " " + esc(e.time) + "</span></li>";
    }).join("") + "</ul>" : '<p class="adm-empty">未来 7 天没有任务。</p>');
    $("#adm-overdue").innerHTML = '<p class="panel-label">Overdue</p><h3>逾期未交付 <em class="count">' + a.overdue.length + "</em></h3>" + (a.overdue.length ? '<ul class="adm-list">' + a.overdue.map(function (x) {
      return '<li class="c-' + catKey(x.event.category) + '"><i></i><span class="who">' + esc(x.name) + '</span><button type="button" data-adm-open="' + esc(x.eventId) + '">' + esc(x.event.title) + "</button><span>" + esc(cnDate(x.event.date)) + "</span></li>";
    }).join("") + "</ul>" : '<p class="adm-empty">没有逾期，棒。</p>');
    renderProcess();
    renderRequests();
    $("#adm-people").innerHTML = '<p class="panel-label">Members</p><h3>成员贡献</h3>' + (a.contributions.length ? '<div class="tbl-wrap"><table class="adm-table"><thead><tr><th>成员</th><th>报名</th><th>确认</th><th>交付</th><th>验收</th></tr></thead><tbody>' +
      a.contributions.map(function (p) {
        return "<tr><td>" + esc(p.name) + (p.role ? '<small>' + esc(p.role) + "</small>" : "") + (p.registered ? "" : '<small class="warn">未登记资料</small>') + "</td><td>" + p.applied + "</td><td>" + p.confirmed + "</td><td>" + p.delivered + "</td><td>" + p.accepted + "</td></tr>";
      }).join("") + "</tbody></table></div>" : '<p class="adm-empty">还没有成员数据。</p>');
  }
  function renderAiCard() {
    var ai = S.admin.ai || {};
    if (ai.error) { $("#adm-ai").innerHTML = '<p class="panel-label">AI</p><h3>AI 用量</h3><p class="adm-empty">读取失败：' + esc(ai.error) + "</p>"; return; }
    var pct = Math.min(100, (ai.spent || 0) / (ai.cap || 20) * 100), stop = (ai.stopAt || 18) / (ai.cap || 20) * 100;
    var feats = ai.byFeature || {};
    $("#adm-ai").innerHTML = '<p class="panel-label">AI · ' + esc(ai.month || "") + '</p><h3>AI 用量 <em class="count">¥' + Number(ai.spent || 0).toFixed(2) + " / ¥" + (ai.cap || 20) + "</em></h3>" +
      '<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="' + (ai.cap || 20) + '" aria-valuenow="' + Number(ai.spent || 0).toFixed(2) + '" aria-label="本月 AI 花费"><i style="width:' + pct.toFixed(2) + '%"></i><b style="left:' + stop.toFixed(1) + '%" title="停用线 ¥' + ai.stopAt + '"></b></div>' +
      '<p class="adm-sub">到 ¥' + esc(ai.stopAt) + " 自动停用，下月 1 号恢复" + (ai.configured ? "" : " · <strong>未配置</strong>") + "</p>" +
      '<ul class="ai-feats">' + Object.keys(feats).map(function (k) {
        var f = feats[k];
        return "<li><span>" + esc(f.label) + "</span><b>" + f.calls + " 次 · ¥" + Number(f.cost).toFixed(4) + "</b><em>今日 " + f.today + "/" + f.perDay + "</em></li>";
      }).join("") + "</ul>";
  }
  function appRow(x, e) {
    var acts = [];
    if (x.status === "已报名") acts.push(["已确认", "确认"]);
    if (x.status === "已交付") { acts.push(["已验收", "验收"]); acts.push(["已退回", "退回"]); }
    if (x.status === "已退回" || x.status === "已取消") acts.push(["已确认", "恢复为已确认"]);
    if (["已报名", "已确认"].indexOf(x.status) >= 0) acts.push(["已取消", "取消"]);
    return '<li class="app-row"><div class="app-who"><strong>' + esc(x.name) + "</strong><small>" + esc(x.studentId) + (x.appliedAt ? " · " + esc(x.appliedAt.slice(5)) : "") + "</small></div>" +
      pill(x.status) +
      (x.link ? '<div class="app-deliv"><a href="' + esc(x.link) + '" target="_blank" rel="noopener">网盘 ↗</a>' + (x.code ? '<button class="copy-code" type="button" data-code="' + esc(x.code) + '">提取码 ' + esc(x.code) + "</button>" : "") +
        (x.desc ? "<p>" + esc(x.desc) + "</p>" : "") + (x.caption ? '<p class="cap">✦ ' + esc(x.caption) + "</p>" : "") + (x.submittedAt ? "<small>交付于 " + esc(x.submittedAt) + "</small>" : "") + "</div>" : "") +
      '<div class="app-acts">' + acts.map(function (a) {
        return '<button class="button ghost mini" type="button" data-app="' + esc(x.id) + '" data-to="' + esc(a[0]) + '">' + esc(a[1]) + "</button>";
      }).join("") + "</div></li>";
  }
  function renderProcess() {
    var a = S.admin, now = a.now;
    var F = [["active", "进行中"], ["deliver", "待交付"], ["review", "待验收"], ["all", "全部"], ["cancel", "已取消"]];
    var list = a.events.filter(function (e) {
      var ap = e.applicants || [];
      if (S.adminFilter === "active") return e.status !== "已取消" && !e.ended;
      if (S.adminFilter === "deliver") return e.status !== "已取消" && e.ended && ap.some(function (x) { return ["已报名", "已确认", "已退回"].indexOf(x.status) >= 0; });
      if (S.adminFilter === "review") return ap.some(function (x) { return x.status === "已交付"; });
      if (S.adminFilter === "cancel") return e.status === "已取消";
      return true;
    }).filter(function (e) { return !S.adminQuery || (e.title + e.category + e.date).indexOf(S.adminQuery) >= 0; });
    var roster = a.roster || [];
    $("#adm-process").innerHTML = '<div class="proc-head"><div><p class="panel-label">Process</p><h3>全流程</h3></div>' +
      '<div class="seg" role="tablist">' + F.map(function (f) {
        return '<button type="button" role="tab" aria-selected="' + (S.adminFilter === f[0]) + '" data-filter="' + f[0] + '">' + f[1] + "</button>";
      }).join("") + '</div><input class="proc-search" type="search" placeholder="搜索任务 / 日期" value="' + esc(S.adminQuery) + '" aria-label="搜索任务" data-proc-search /></div>' +
      (list.length ? '<div class="proc-list">' + list.map(function (e) {
        var ap = (e.applicants || []).filter(function (x) { return x.status !== "已取消"; });
        var cancelled = (e.applicants || []).length - ap.length;
        var staff = S.staffing[e.id];
        return '<details class="proc-ev c-' + catKey(e.category) + (e.status === "已取消" ? " is-cancel" : "") + '" data-proc="' + esc(e.id) + '"' + (S.openProc === e.id ? " open" : "") + ">" +
          '<summary><i class="dot"></i><span class="pe-date">' + esc(cnDate(e.date)) + "<small>" + esc(e.time) + '</small></span><span class="pe-title">' + esc(e.title) + "</span>" +
          pill(phase(e)) + '<span class="pe-count">' + ap.length + (e.need ? "/" + e.need : "") + " 人</span></summary>" +
          '<div class="pe-body"><div class="pe-tools">' +
          '<button class="button ghost mini" type="button" data-edit="' + esc(e.id) + '">编辑</button>' +
          (e.status === "已取消" ? '<button class="button ghost mini" type="button" data-ev-status="开放报名" data-id="' + esc(e.id) + '">恢复</button>'
            : '<button class="button ghost mini" type="button" data-ev-status="已取消" data-id="' + esc(e.id) + '">取消任务</button>') +
          (e.status === "开放报名" ? '<button class="button ghost mini" type="button" data-ev-status="已安排" data-id="' + esc(e.id) + '">截止报名</button>' : "") +
          '<button class="button ghost mini ai-btn" type="button" data-staff="' + esc(e.id) + '">✦ AI 排班建议</button></div>' +
          (staff ? renderStaff(staff, e) : "") +
          (ap.length ? '<ul class="app-list">' + ap.map(function (x) { return appRow(x, e); }).join("") + "</ul>" : '<p class="adm-empty">还没人报名。</p>') +
          (cancelled ? '<p class="adm-sub">另有 ' + cancelled + " 人取消了报名。</p>" : "") +
          '<form class="assign" data-assign="' + esc(e.id) + '"><select name="who" aria-label="指派成员"><option value="">指派成员…</option>' +
          roster.map(function (m, i) { return '<option value="' + i + '">' + esc(m.name) + (m.studentId ? "" : "（未填学号）") + "</option>"; }).join("") +
          '</select><button class="button ghost mini" type="submit">指派并确认</button></form>' +
          "</div></details>";
      }).join("") + "</div>" : '<p class="adm-empty">这个筛选下没有任务。</p>');
  }
  function renderStaff(r, e) {
    if (r.loading) return '<div class="staff"><p class="adm-sub">AI 正在看名单…</p></div>';
    if (r.error) return '<div class="staff"><p class="adm-sub">' + esc(r.error) + "</p></div>";
    return '<div class="staff"><p class="staff-h">✦ AI 建议' + (r.note ? "：" + esc(r.note) : "") + '</p><ul>' + r.picks.map(function (p) {
      var btn = p.applicationId && p.status === "已报名" ? '<button class="button ghost mini" type="button" data-app="' + esc(p.applicationId) + '" data-to="已确认">确认</button>'
        : !p.applicationId && p.studentId ? '<button class="button ghost mini" type="button" data-invite="' + esc(e.id) + '" data-name="' + esc(p.name) + '" data-sid="' + esc(p.studentId) + '">指派</button>' : "";
      return "<li><strong>" + esc(p.name) + "</strong>" + (p.invite ? '<em class="tag">未报名</em>' : "") + "<span>" + esc(p.reason) + "</span>" + btn + "</li>";
    }).join("") + "</ul>" + (r.warnings && r.warnings.length ? '<p class="adm-sub">' + esc(r.warnings.join("；")) + "</p>" : "") + '<p class="ai-cost">' + esc(aiCostLine(r)) + "</p></div>";
  }
  function renderRequests() {
    var rq = S.admin.requests || [];
    $("#adm-requests").innerHTML = '<p class="panel-label">Requests</p><h3>拍摄申请 <em class="count">' + rq.length + "</em></h3>" + (rq.length ? '<ul class="req-list">' + rq.map(function (q) {
      return '<li><div class="rq-main"><strong>' + esc(q.name) + "</strong><small>" + esc(q.date) + "</small><p>" + esc(q.desc) + "</p></div>" +
        '<div class="rq-acts">' + (q.convertedTo ? '<span class="pill p-ok">已转为任务</span>' :
        '<button class="button ghost mini ai-btn" type="button" data-draft="' + esc(q.id) + '">✦ AI 整理</button><button class="button primary mini" type="button" data-convert="' + esc(q.id) + '">转为任务</button>') + "</div></li>";
    }).join("") + "</ul>" : '<p class="adm-empty">还没有拍摄申请。</p>');
  }
  function setAppStatus(id, to) {
    var note = "";
    if (to === "已退回") { note = window.prompt("退回原因（成员能看到）", "链接打不开 / 缺精选") ; if (note === null) return; }
    O.api("/api/admin/applications/" + id, { method: "PUT", auth: true, body: note ? { status: to, adminNote: note } : { status: to } }).then(function () {
      O.toast("已更新为「" + to + "」"); loadAdmin(); loadEvents();
    }).catch(function (e) { O.toast("操作失败：" + e.message, true); });
  }
  function setEventStatus(id, to) {
    if (to === "已取消" && !window.confirm("确定取消这个任务？成员会在日历上看到「已取消」。")) return;
    O.api("/api/admin/events/" + id, { method: "PUT", auth: true, body: { status: to } }).then(function () {
      O.toast("任务已更新"); loadAdmin(); loadEvents();
    }).catch(function (e) { O.toast("操作失败：" + e.message, true); });
  }
  function assign(eventId, name, sid) {
    if (!sid) { O.toast("这位成员没有登记学号，请先在名册里补上", true); return; }
    O.api("/api/admin/applications", { method: "POST", auth: true, body: { eventId: eventId, name: name, studentId: sid, status: "已确认" } }).then(function () {
      O.toast("已指派 " + name); loadAdmin(); loadEvents();
    }).catch(function (e) { O.toast("指派失败：" + e.message, true); });
  }
  function runStaffing(id) {
    S.staffing[id] = { loading: true }; S.openProc = id; renderProcess();
    O.api("/api/admin/ai/staffing", { method: "POST", auth: true, body: { eventId: id } }).then(function (r) {
      S.staffing[id] = r; renderProcess(); refreshAiUsage();
    }).catch(function (e) { S.staffing[id] = { error: e.message }; renderProcess(); });
  }
  function refreshAiUsage() {
    O.api("/api/admin/overview", { auth: true }).then(function (r) { S.admin = r; renderAiCard(); }).catch(function () {});
  }
  function runWeekly(btn) {
    var box = $("#adm-weekly");
    box.hidden = false; btn.disabled = true;
    box.innerHTML = '<p class="panel-label">✦ AI Weekly</p><p class="adm-sub">AI 正在写本周简报…</p>';
    O.api("/api/admin/ai/weekly", { method: "POST", auth: true }).then(function (r) {
      var p = r.report, li = function (xs) { return xs && xs.length ? "<ul>" + xs.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "<p class=\"adm-empty\">—</p>"; };
      box.innerHTML = '<div class="wk-head"><div><p class="panel-label">✦ AI Weekly</p><h3>本周简报</h3></div><button class="modal-close wk-close" type="button" aria-label="收起">×</button></div><p class="wk-sum">' + esc(p.summary) + "</p>" +
        '<div class="wk-cols"><div><h4>亮点</h4>' + li(p.highlights) + "</div><div><h4>风险</h4>" + li(p.risks) + "</div><div><h4>下周建议</h4>" + li(p.next) + "</div></div>" +
        '<p class="ai-cost">' + esc(aiCostLine(r)) + " · AI 生成，请核对</p>";
      refreshAiUsage();
    }).catch(function (e) { box.innerHTML = '<p class="adm-sub">' + esc(e.message) + "</p>"; }).then(function () { btn.disabled = false; });
  }

  /* —— 任务编辑器（新建 / 编辑 / 申请转任务）—— */
  function openEditor(mode, data, note) {
    var f = $("#edit-form"), opts = (S.admin && S.admin.options) || { categories: CATS.map(function (c) { return c[0]; }), eventStatus: ["开放报名", "已安排", "已结束", "已取消"] };
    f.category.innerHTML = opts.categories.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("");
    f.status.innerHTML = opts.eventStatus.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("");
    data = data || {};
    f.title.value = data.title || ""; f.category.value = data.category || "其他"; f.status.value = data.status || "开放报名";
    f.date.value = data.date || S.today || ""; f.time.value = data.time != null ? data.time : "11:50-12:20";
    f.place.value = data.place || ""; f.need.value = data.need || ""; f.note.value = data.note || "";
    f.casC.value = casNum(data.casC); f.casS.value = casNum(data.casS);
    S.editing = { mode: mode, id: data.id || data.requestId || "" };
    $("#ed-title").textContent = mode === "edit" ? "编辑任务" : mode === "convert" ? "申请 → 任务" : "新建任务";
    $("#ed-note").textContent = note || "";
    $("#ed-status").textContent = "";
    O.openModal($("#edit-modal"));
  }
  function submitEditor(f) {
    var st = $("#ed-status"), ed = S.editing;
    var body = { title: f.title.value.trim(), category: f.category.value, status: f.status.value, date: f.date.value,
      time: f.time.value.trim(), place: f.place.value.trim(), need: f.need.value === "" ? "" : Number(f.need.value), note: f.note.value.trim(),
      casC: f.casC.value === "" ? 1 : Number(f.casC.value), casS: f.casS.value === "" ? 1 : Number(f.casS.value) };
    if (!body.title || !body.date) { st.textContent = "名称和日期必填"; return; }
    var casBad = [["C", body.casC], ["S", body.casS]].filter(function (x) { return !(x[1] >= 0.5 && x[1] <= 5 && x[1] * 2 === Math.round(x[1] * 2)); });
    if (casBad.length) { st.textContent = "CAS " + casBad[0][0] + " 应为 0.5–5 小时，0.5 一档"; return; }
    var p = ed.mode === "edit" ? O.api("/api/admin/events/" + ed.id, { method: "PUT", auth: true, body: body })
      : ed.mode === "convert" ? O.api("/api/admin/requests/" + ed.id + "/convert", { method: "POST", auth: true, body: body })
      : O.api("/api/admin/events", { method: "POST", auth: true, body: body });
    st.textContent = "保存中…";
    p.then(function () {
      st.textContent = "已保存 ✓"; O.toast("任务已保存，日历已更新");
      setTimeout(function () { O.closeModal($("#edit-modal")); }, 500);
      loadAdmin(); loadEvents();
    }).catch(function (e) { st.textContent = "保存失败：" + e.message; });
  }
  function convertRequest(id, viaAi, btn) {
    var q = null;
    (S.admin.requests || []).forEach(function (x) { if (x.id === id) q = x; });
    if (!q) return;
    if (!viaAi) {
      var m = String(q.date).match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
      var t = String(q.date).match(/\d{1,2}[:：]\d{2}/);
      openEditor("convert", { requestId: id, title: q.name, date: m ? m[1] + "-" + pad(+m[2]) + "-" + pad(+m[3]) : "", time: t ? t[0] : "",
        note: String(q.desc).split("\n").filter(function (l) { return l.indexOf("联系人：") !== 0; }).join("\n") }, "从拍摄申请「" + q.name + "」转换，原申请保持不变。");
      return;
    }
    btn.disabled = true; btn.textContent = "AI 整理中…";
    O.api("/api/admin/ai/draft", { method: "POST", auth: true, body: { requestId: id } }).then(function (r) {
      var d = r.draft; d.requestId = id;
      openEditor("convert", d, "✦ AI 整理的草稿，确认无误再保存。" + aiCostLine(r));
      refreshAiUsage();
    }).catch(function (e) { O.toast(e.message, true); }).then(function () { btn.disabled = false; btn.textContent = "✦ AI 整理"; });
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    document.addEventListener("click", function (ev) {
      var t = ev.target && ev.target.closest ? ev.target : null;
      if (!t) return;
      var n;
      if ((n = t.closest("[data-ev]")) && !n.matches("form")) { ev.preventDefault(); openEventId = n.getAttribute("data-ev"); O.closeModal($("#event-modal")); setTimeout(function () { openEvent(openEventId); }, n.closest("#event-modal") ? 120 : 0); return; }
      if ((n = t.closest("[data-day]"))) { openDay(n.getAttribute("data-day")); return; }
      if ((n = t.closest("[data-cal='retry']"))) { S.loaded = false; renderCalendar(); loadEvents(); return; }
      if ((n = t.closest("[data-login-apply]"))) {
        var id = n.getAttribute("data-login-apply");
        O.closeModal($("#event-modal"));
        O.requireMember(function () { loadMine().then(function () { openEventId = id; openEvent(id); }); });
        return;
      }
      if ((n = t.closest("[data-deliver]"))) { openDeliver(n.getAttribute("data-deliver")); return; }
      if ((n = t.closest("[data-cancel]"))) { cancelApp(n.getAttribute("data-cancel")); return; }
      if ((n = t.closest("[data-me-reset]"))) { S.me = {}; try { localStorage.removeItem("oao_me"); } catch (e) {} S.mine = []; renderMine(); return; }
      if ((n = t.closest("[data-admin-jump]"))) {
        S.openProc = n.getAttribute("data-admin-jump"); S.adminFilter = "all"; O.closeModal($("#event-modal")); renderProcess();
        return;
      }
      if (!isAdmin()) return;
      if ((n = t.closest("[data-filter]"))) { S.adminFilter = n.getAttribute("data-filter"); renderProcess(); return; }
      if ((n = t.closest("[data-app]"))) { setAppStatus(n.getAttribute("data-app"), n.getAttribute("data-to")); return; }
      if ((n = t.closest("[data-ev-status]"))) { setEventStatus(n.getAttribute("data-id"), n.getAttribute("data-ev-status")); return; }
      if ((n = t.closest("[data-staff]"))) { runStaffing(n.getAttribute("data-staff")); return; }
      if ((n = t.closest("[data-invite]"))) { assign(n.getAttribute("data-invite"), n.getAttribute("data-name"), n.getAttribute("data-sid")); return; }
      if ((n = t.closest("[data-edit]"))) {
        var e = null; S.admin.events.forEach(function (x) { if (x.id === n.getAttribute("data-edit")) e = x; });
        if (e) openEditor("edit", e); return;
      }
      if ((n = t.closest("[data-convert]"))) { convertRequest(n.getAttribute("data-convert"), false); return; }
      if ((n = t.closest("[data-draft]"))) { convertRequest(n.getAttribute("data-draft"), true, n); return; }
      if ((n = t.closest("[data-adm-open]"))) {
        S.openProc = n.getAttribute("data-adm-open"); S.adminFilter = "all"; renderProcess();
        var d = $('[data-proc="' + S.openProc + '"]'); if (d && d.scrollIntoView) d.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if ((n = t.closest(".wk-close"))) { $("#adm-weekly").hidden = true; return; }
    });
    document.addEventListener("toggle", function (ev) {
      var d = ev.target;
      if (d && d.matches && d.matches("details.proc-ev")) { if (d.open) S.openProc = d.getAttribute("data-proc"); else if (S.openProc === d.getAttribute("data-proc")) S.openProc = ""; }
    }, true);
    document.addEventListener("input", function (ev) {
      // 交付：粘贴带 ?pwd= 的链接时，提取码当场补上
      if (ev.target && ev.target.name === "link" && ev.target.form && ev.target.form.id === "deliver-form") {
        var pm = ev.target.value.match(/[?&]pwd=([A-Za-z0-9]{4})/), cf = ev.target.form.code;
        if (pm && cf && !cf.value) cf.value = pm[1];
      }
      if (ev.target && ev.target.hasAttribute && ev.target.hasAttribute("data-proc-search")) {
        S.adminQuery = ev.target.value.trim();
        clearTimeout(S.qT); S.qT = setTimeout(function () {
          renderProcess(); var i = $("[data-proc-search]"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
        }, 250);
      }
    });
    document.addEventListener("submit", function (ev) {
      var f = ev.target;
      if (f.id === "apply-form") { ev.preventDefault(); submitApply(f); }
      else if (f.id === "deliver-form") { ev.preventDefault(); submitDeliver(f); }
      else if (f.id === "edit-form") { ev.preventDefault(); submitEditor(f); }
      else if (f.id === "me-form") {
        ev.preventDefault();
        var nm = f.name.value.trim(), sid = f.sid.value.trim();
        if (!nm || !/^[A-Za-z0-9_-]{2,32}$/.test(sid)) { O.toast("请填写姓名和正确的学号", true); return; }
        saveMe(nm, sid); loadMine();
      } else if (f.hasAttribute && f.hasAttribute("data-assign")) {
        ev.preventDefault();
        var i = f.who.value; if (i === "") return;
        var m = S.admin.roster[+i]; assign(f.getAttribute("data-assign"), m.name, m.studentId);
      }
    });
    var prev = $("#cal-prev"), next = $("#cal-next"), today = $("#cal-today");
    if (prev) prev.addEventListener("click", function () { shiftMonth(-1); });
    if (next) next.addEventListener("click", function () { shiftMonth(1); });
    if (today) today.addEventListener("click", function () { var t = parseYmd(S.today || localToday()); var d = (t.y - S.y) * 12 + t.m - S.m; S.y = t.y; S.m = t.m; if (d) shiftMonth(0); else renderCalendar(); });
    var dlAi = $("#dl-ai"); if (dlAi) dlAi.addEventListener("click", function () { aiCaption(dlAi); });
    var nb = $("#adm-new"); if (nb) nb.addEventListener("click", function () { openEditor("new", {}); });
    var rb = $("#adm-refresh"); if (rb) rb.addEventListener("click", function () { loadAdmin(); loadEvents(); });
    var wb = $("#adm-weekly-run"); if (wb) wb.addEventListener("click", function () { runWeekly(wb); });
    document.addEventListener("oao:auth", function () {
      renderMine(); loadMine();
      showAdmin(isAdmin());
      if (isAdmin()) setTimeout(function () { var a = $("#admin"); if (a && a.scrollIntoView) a.scrollIntoView({ behavior: "smooth", block: "start" }); }, 500);
      refreshOpenEvent();
    });
  }

  function init() {
    if (!O.connected) return;
    legend();
    var t = parseYmd(localToday()); S.y = t.y; S.m = t.m;
    renderCalendar();
    bind();
    renderMine();
    loadEvents();
    loadMine();
    if (isAdmin()) showAdmin(true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
