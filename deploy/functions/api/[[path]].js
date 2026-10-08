// OAO 摄影社 · 后端 API（Cloudflare Pages Functions）
//
// 匹配 /api 与 /api/*。业务逻辑与腾讯云函数共用同一份 cloud-function/index.js，
// 这里只做「Cloudflare Request ⇄ 平台无关请求对象」的转换。
// 先经过 functions/_middleware.js 的整站密码锁：没有站点会话 Cookie 的请求到不了这里。
// 密钥都在 Pages 项目的环境变量 / Secrets 里（context.env），不进前端、不进仓库。
import api from "../../cloud-function/index.js";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const headers = {};
  for (const [k, v] of request.headers) headers[k.toLowerCase()] = v;

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? "" : await request.text();

  const out = await api.handle(
    {
      method,
      path: url.pathname.replace(/\/+$/, "") || "/",
      headers,
      body,
      query: Object.fromEntries(url.searchParams),
    },
    env
  );

  const status = out.statusCode || 200;
  const noBody = status === 204 || status === 304 || (status >= 300 && status < 400);
  return new Response(noBody ? null : out.body, { status, headers: out.headers || {} });
}
