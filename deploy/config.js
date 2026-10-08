/*
 * OAO 摄影社 · 前端配置
 * ------------------------------------------------------------------
 * 把 proxyUrl 填成后端 API 的地址（不含结尾斜杠，前端会请求 proxyUrl + "/api/..."）后，
 * 站点会自动从“静态回退模式”切换到“数据驱动模式”。
 *
 * 例如：
 *   proxyUrl: window.location.origin            // 后端在本站 Cloudflare Pages Functions（当前）
 *   proxyUrl: "https://<腾讯云函数URL>"            // 改用腾讯云函数 SCF 的函数 URL 时
 *
 * 留空字符串 "" 表示未接入后端，站点沿用原有写死内容，便于本地预览。
 *
 * demo: true 时用内置示例数据预览“数据驱动模式”的界面与交互，
 *       无需部署后端（写操作只模拟成功，不真正保存）。接入真实后端后请置回 false。
 */
window.OAO_CONFIG = {
  // 后端跑在同一个 Cloudflare Pages 项目里（functions/api/），所以用本站地址即可；
  // 同源请求会自动带上站点登录 Cookie。改用腾讯云函数时，把这里换成函数 URL。
  proxyUrl: window.location.origin,
  demo: false,
};
