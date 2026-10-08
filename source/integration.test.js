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
for (const file of ["app.js", "script.js"]) {
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
