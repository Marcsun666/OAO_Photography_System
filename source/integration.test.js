/**
 * 一致性契约测试（防止前端 / 云函数 / 文档三者悄然漂移）
 * 运行：node integration.test.js
 *
 * 覆盖：
 *  1. app.js / script.js 里引用的 #id 是否都存在于 index.html；
 *  2. app.js 与 cloud-function/index.js 的字段名常量（F）是否一致；
 *  3. SETUP.md 是否提到关键字段名。
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/* 1) DOM id 契约 */
function referencedIds(file) {
  const ids = new Set();
  const re = /["']#([\w-]+)["']/g;
  let m;
  while ((m = re.exec(read(file)))) ids.add(m[1]);
  return ids;
}

const html = read("index.html");
const htmlIds = new Set();
{
  const re = /id="([\w-]+)"/g;
  let m;
  while ((m = re.exec(html))) htmlIds.add(m[1]);
}
for (const file of ["app.js", "script.js", "events.js"]) {
  for (const id of referencedIds(file)) {
    assert.ok(htmlIds.has(id), file + ' 引用了缺失的 id="' + id + '"');
  }
}

/* 2) 字段名常量一致性（F） */
function extractF(code, marker) {
  const start = code.indexOf(marker);
  assert.ok(start >= 0, "未找到 " + marker);
  const body = code.slice(start + marker.length);
  const m = body.match(/\{([\s\S]*?)\n\s*\};/);
  assert.ok(m, "F 常量未闭合");
  const pairs = [];
  const re = /(\w+):\s*"([^"]+)"/g;
  let mm;
  while ((mm = re.exec(m[1]))) pairs.push(mm[1] + "=" + mm[2]);
  return pairs.sort();
}

const fFront = extractF(read("app.js"), "var F = {");
const fBack = extractF(read("cloud-function/index.js"), "const F = {");
assert.deepStrictEqual(fFront, fBack, "前后端字段名常量不一致");

/* 2b) v4 新表字段：后端用到的每个字段名都必须在 tools/feishu/schema.py 里建过 */
{
  const code = read("cloud-function/index.js");
  const start = code.indexOf("Object.assign(F, {");
  assert.ok(start >= 0, "未找到 v4 字段常量");
  const block = code.slice(start, code.indexOf("\n});", start));
  const schema = read("tools/feishu/schema.py");
  const re = /(\w+):\s*"([^"]+)"/g;
  let mm, n = 0;
  while ((mm = re.exec(block))) {
    n++;
    assert.ok(schema.includes('"' + mm[2] + '"'), "schema.py 缺少 v4 字段「" + mm[2] + "」");
  }
  assert.ok(n >= 30, "v4 字段常量应有 30+ 项，实际 " + n);
  for (const t of ["拍摄任务", "报名与交付", "AI用量", "TABLE_EVENTS", "TABLE_APPLICATIONS", "TABLE_AI_USAGE"]) {
    assert.ok(schema.includes(t), "schema.py 缺少 " + t);
  }
}

/* 2c) v4.1 CAS 时间：字段名在后端 / schema.py 一致，编辑器有 C/S 输入框（0.5–5，0.5 一档），详情/议程会显示 */
{
  const code = read("cloud-function/index.js");
  assert.ok(/casC:\s*"CAS-C"/.test(code) && /casS:\s*"CAS-S"/.test(code), "后端 F.event.casC/casS = CAS-C/CAS-S");
  const schema = read("tools/feishu/schema.py");
  assert.ok(/CAS = lambda n: \{"field_name": n, "type": 2, "property": \{"formatter": "0.0"\}\}/.test(schema), "CAS 字段是数字、格式 0.0");
  assert.ok(schema.includes('CAS("CAS-C"), CAS("CAS-S")'), "schema.py 拍摄任务里有 CAS-C / CAS-S");
  const form = html.slice(html.indexOf('id="edit-form"'), html.indexOf("</form>", html.indexOf('id="edit-form"')));
  for (const n of ["casC", "casS"]) {
    const m = form.match(new RegExp('<input name="' + n + '"[^>]*>'));
    assert.ok(m, "任务编辑器缺少 " + n + " 输入框");
    assert.ok(/type="number"/.test(m[0]) && /min="0.5"/.test(m[0]) && /max="5"/.test(m[0]) && /step="0.5"/.test(m[0]), n + " 应为 0.5–5、步长 0.5");
  }
  assert.ok(form.includes('class="cas-field"') && form.includes("cas-grid"), "编辑器沿用申请表的 CAS 样式");
  const ev = read("events.js");
  assert.ok(ev.includes('["CAS 时间", casText(e)]'), "任务详情显示 CAS 时间");
  assert.ok(ev.includes("f.casC.value") && ev.includes("casC: f.casC.value"), "编辑器读写 casC");
  assert.ok(/\.ag-cas\s*\{/.test(read("styles.css")) && /\.cas-grid\.cas-grid-2\s*\{/.test(read("styles.css")), "CAS 样式存在");
}
/* 2d) v4.1 申请拍摄区：仍保留（表单字段不变），文案写明给其他社团 / 老师，社员去拍摄日历报名 */
{
  const sec = html.slice(html.indexOf('id="request"'), html.indexOf("</section>", html.indexOf('id="request"')));
  for (const n of ["event", "date", "contact", "creativity", "activity", "service", "record"]) assert.ok(sec.includes('name="' + n + '"'), "申请表字段 " + n + " 不能删");
  assert.ok(/其他社团/.test(sec) && /老师/.test(sec), "申请区写明给其他社团和老师");
  assert.ok(/<a href="#calendar">拍摄日历<\/a>/.test(sec), "给社员的提示链接到 #calendar");
  assert.ok(!/>申请拍摄</.test(html), "导航 / 标签栏不再用容易误会的「申请拍摄」");
}

/* 3) 文档字段名 */
const setup = read("SETUP.md");
for (const name of ["活动名称", "照片数", "视频数", "网盘链接", "提取码", "分类", "平台",
                    "姓名", "班级", "学号", "性别", "职位", "技能",
                    "批次", "组名", "成员", "技能覆盖"]) {
  assert.ok(setup.includes(name), 'SETUP.md 缺少字段名「' + name + '」');
}

console.log(
  "✅ 一致性契约测试通过（DOM id=" + htmlIds.size + "，字段常量 " + fFront.length + " 项，文档字段 17 项）"
);
