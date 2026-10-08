/**
 * 设计系统回归测试
 * 运行：node design.test.js
 *
 * 校验：
 *  1. 语义化配色令牌在底色上的 WCAG 对比度达标；
 *  2. 单一强调色在按钮白字上的对比度达标；
 *  3. CSS 大括号配平（轻量语法完整性）。
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");

/* ---------- 工具 ---------- */
function hexToLum(hex) {
  const c = hex.replace("#", "");
  const channel = (i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}
function contrast(a, b) {
  const [hi, lo] = [hexToLum(a), hexToLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function token(name) {
  const m = css.match(new RegExp("--" + name + ":\\s*(#[0-9a-fA-F]{6})"));
  return m ? m[1] : null;
}

/* ---------- 1) 正文/小字对比度（vs 底色，需 ≥4.5） ---------- */
const bg = token("bg") || "#f4f5f7";
const textTargets = { text: 4.5, "text-muted": 4.5, "accent-strong": 4.5 };
for (const [name, min] of Object.entries(textTargets)) {
  const c = token(name);
  assert.ok(c, "缺少 token --" + name);
  const ratio = contrast(c, bg);
  assert.ok(ratio >= min, `--${name} (${c}) 对比度 ${ratio.toFixed(2)} < ${min}，不达标`);
  console.log(`  --${name} ${c} = ${ratio.toFixed(2)}:1 ✓ (需 ≥${min})`);
}

/* ---------- 2) 强调色（品牌蓝，用于大字号/按钮，≥3.0） ---------- */
const accent = token("accent");
assert.ok(accent, "缺少 --accent");
const accentOnBg = contrast(accent, bg);
assert.ok(accentOnBg >= 3.0, `--accent (${accent}) vs 底色 ${accentOnBg.toFixed(2)} < 3.0`);
const onWhite = contrast(accent, "#ffffff");
assert.ok(onWhite >= 3.0, `--accent (${accent}) 白字对比度 ${onWhite.toFixed(2)} < 3.0`);
console.log(`  --accent ${accent} vs 底色 ${accentOnBg.toFixed(2)}:1、上白字 ${onWhite.toFixed(2)}:1 ✓ (需 ≥3.0)`);

/* ---------- 3) CSS 括号配平 ---------- */
const open = (css.match(/\{/g) || []).length;
const close = (css.match(/\}/g) || []).length;
assert.strictEqual(open, close, `CSS 括号不配平：{ ${open} vs } ${close}`);

console.log("✅ 设计系统测试通过（对比度达标 + CSS 括号配平）");
