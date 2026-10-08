/**
 * app.js 离线渲染测试（手写最小 DOM 桩，不依赖浏览器）
 * 运行：node frontend.test.js
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

function makeEl(id) {
  return {
    id,
    innerHTML: "",
    textContent: "",
    hidden: false,
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    querySelector() { return makeEl("q"); },
    querySelectorAll() { return []; },
    setAttribute() {},
    getAttribute() { return null; },
  };
}

function runWithConfig(cfg, fetchImpl) {
  const bySel = new Map();
  const document = {
    readyState: "complete",
    body: { style: {} },
    querySelector(sel) {
      if (!bySel.has(sel)) bySel.set(sel, makeEl(sel));
      return bySel.get(sel);
    },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  const sessionStorage = {
    _t: null,
    getItem() { return this._t; },
    setItem(k, v) { this._t = v; },
    removeItem() { this._t = null; },
  };

  const g = global;
  const prev = { window: g.window, document: g.document, sessionStorage: g.sessionStorage, fetch: g.fetch };
  g.window = { OAO_CONFIG: cfg, sessionStorage, scheduleGalleryLayout: undefined };
  g.document = document;
  g.sessionStorage = sessionStorage;
  g.fetch = fetchImpl;

  const code = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  (0, eval)(code); // 间接 eval，在全局作用域执行

  return { bySel, prev };
}

(async () => {
  // —— 连接模式 —— //
  const fetchCalls = [];
  function mockFetch(url) {
    fetchCalls.push(String(url));
    const p = String(url).replace("https://mock.local", "");
    let body;
    if (p.includes("activities")) {
      body = { ok: true, items: [
        { id: "a1", fields: { 活动名称: "运动会", 日期: "2026.09", 状态: "待选片", 组别: "照片组", 描述: "赛场瞬间" } },
        { id: "a2", fields: { 活动名称: "排球社合照", 日期: "2026.06", 状态: "已归档", 组别: "两者", 描述: "红墙合照", 照片数: 86, 视频数: 2 } },
      ] };
    } else if (p.includes("photos")) {
      body = { ok: true, items: [
        { id: "p1", fields: { 活动: "运动会", 文件: [{ file_token: "ft1", name: "a.jpg" }], 分类: "sports", 说明: "冲刺瞬间", 网盘链接: "https://pan.baidu.com/s/x", 提取码: "abc" } },
      ] };
    } else if (p.includes("links")) {
      body = { ok: true, items: [
        { id: "l1", fields: { 平台: "B站", 标题: "运动会高光", 链接: "https://b23.tv/x", 备注: "高光集锦" } },
      ] };
    } else {
      body = { ok: true, items: [] };
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  }

  let r = runWithConfig({ proxyUrl: "https://mock.local" }, mockFetch);
  await new Promise((res) => setTimeout(res, 30));

  const stat = r.bySel.get("#stat-rail").innerHTML;
  assert.ok(stat.includes(">2<"), "hero 应显示 2 场活动，实际: " + stat);
  assert.ok(stat.includes(">86<"), "hero 应显示 86 张照片，实际: " + stat);
  const tl = r.bySel.get("#timeline-list").innerHTML;
  // 用 /<article/ 而不是 /<article>/：卡片带了 class，裸标签匹配会漏
  assert.strictEqual((tl.match(/<article/g) || []).length, 2, "时间线应有 2 条");
  assert.ok(tl.includes('class="tile'), "时间线应渲染成图块结构");
  assert.ok(tl.includes("tile-frame"), "图块应有内嵌发丝框");
  assert.ok(r.bySel.get("#archive-grid").innerHTML.includes("pan.baidu.com"), "素材库应含网盘链接");
  assert.ok(r.bySel.get("#archive-grid").innerHTML.includes("提取码 abc"), "素材库应含提取码");
  assert.ok(r.bySel.get("#archive-grid").innerHTML.includes("copy-code"), "素材库应含复制提取码按钮");
  assert.ok(r.bySel.get("#gallery-grid").innerHTML.includes('class="shot'), "照片墙应含 shot 卡片");
  assert.ok(r.bySel.get("#video-grid").innerHTML.includes("video-card-item"), "B站区应含视频卡片");
  assert.strictEqual(fetchCalls.length, 3, "应请求 activities/photos/links 三个接口");
  assert.ok(!fetchCalls.some((u) => u.includes("members")),
    "未登录时不应请求成员名册（含个人信息）");
  assert.ok(r.bySel.get("#roster-list").innerHTML.includes("登录后可见"),
    "未登录时名册应提示需要登录");

  // —— 静态回退模式 —— //
  Object.assign(global, r.prev);
  let fetchThrew = false;
  const noFetch = () => { fetchThrew = true; throw new Error("静态模式不应请求后端"); };
  r = runWithConfig({ proxyUrl: "" }, noFetch);
  await new Promise((res) => setTimeout(res, 20));
  assert.strictEqual(fetchThrew, false, "静态模式不应发请求");
  assert.strictEqual(r.bySel.get(".member-zone").style.display, "none", "静态模式应隐藏成员区");
  assert.ok(r.bySel.get("#skill-pool").innerHTML.includes("拍照"),
    "静态模式下技能标签仍应渲染（不依赖后端）");

  // —— 演示模式 —— //
  Object.assign(global, r.prev);
  let demoFetchCalled = false;
  const demoNoFetch = () => { demoFetchCalled = true; throw new Error("演示模式不应走 fetch"); };
  r = runWithConfig({ demo: true, proxyUrl: "" }, demoNoFetch);
  await new Promise((res) => setTimeout(res, 220)); // demoApi 有 100ms 延迟
  assert.strictEqual(demoFetchCalled, false, "演示模式不应走 fetch");
  assert.ok(r.bySel.get("#stat-rail").innerHTML.includes(">6<"), "演示模式应渲染 6 场活动");
  assert.ok(r.bySel.get("#gallery-grid").innerHTML.includes("empty-state"), "演示模式照片墙应为空态（照片示例已删除）");
  assert.strictEqual(r.bySel.get("#member-toggle").textContent, "成员登录", "演示模式应进入成员界面（登录按钮可见）");
  const demoTl = r.bySel.get("#timeline-list").innerHTML;
  assert.ok(demoTl.includes("has-cover"), "演示模式的活动应带封面图");
  assert.ok(demoTl.includes("assets/events/"), "封面应指向本地素材");

  const roster = r.bySel.get("#roster-list").innerHTML;
  assert.ok(roster.includes("示例同学 A"), "演示模式应渲染成员名册");
  assert.ok(roster.includes("无性别"), "性别应支持「无性别」选项");
  assert.ok(!roster.includes("20260101"), "名册不应把学号渲染到页面上");
  assert.ok(r.bySel.get("#skill-pool").innerHTML.includes("剪视频"), "技能池应渲染技能标签");

  console.log("✅ app.js 离线渲染测试通过（连接 / 静态 / 演示 三种模式）");
  process.exit(0);
})().catch((e) => {
  console.error("❌", e && e.message);
  process.exit(1);
});
