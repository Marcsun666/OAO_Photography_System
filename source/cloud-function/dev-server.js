/**
 * 本地调试服务器：`node dev-server.js`（监听 9000）
 * 把环境变量导出到 shell 后运行；前端 config.js 指向 http://localhost:9000。
 * 单独成文件，是为了让 index.js 不含任何 Node 内置模块，能直接被 Cloudflare 打包。
 */
"use strict";
const http = require("http");
const { main_handler } = require("./index.js");

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    const event = {
      httpMethod: req.method,
      path: (req.url || "/").split("?")[0],
      headers: req.headers,
      body,
      isBase64Encoded: false,
    };
    const out = await main_handler(event, {});
    res.statusCode = out.statusCode;
    Object.entries(out.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    res.end(out.body || "");
  });
});
server.listen(9000, () => {
  console.log("[oao-proxy] 本地调试已启动: http://localhost:9000");
  console.log("[oao-proxy] 环境变量未配置时仅 /api/health 可用，其余接口会报缺少 env。");
});
