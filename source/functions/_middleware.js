// 整站密码锁（Cloudflare Pages Functions 中间件，在 Cloudflare 服务器上执行）
//
// - 未登录：任何路径（页面、CSS、JS、图片）都返回 401 + 品牌登录页，不泄露站内任何文件。
// - POST /__login：密码与 Pages 密钥 SITE_PASSWORD 做常数时间比较；正确则发 30 天会话 Cookie，
//   并跳回原来要访问的站内路径（只接受同站相对路径，防开放重定向）。
// - Cookie 内容是「到期时间 + HMAC-SHA256 签名」，签名密钥来自 SITE_PASSWORD，
//   所以改密码 = 所有人立刻退出；Cookie 里永远没有密码本身。
// - /__logout：清除 Cookie。
// - 没配置 SITE_PASSWORD 时整站返回 503（宁可打不开，也不裸奔）。
// 修改密码：wrangler pages secret put SITE_PASSWORD --project-name oao-photography

const COOKIE = "__Host-oao_session";
const MAX_AGE = 30 * 24 * 60 * 60; // 30 天（秒）
const LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWgAAABaCAMAAACi/jz1AAAAYFBMVEUdHR8dHR8dHR8dHR8dHR8dHR8dHR8dHR8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADO61hAAAAAIHRSTlMA/S7QTY6wbwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHkX2bYAAAd4SURBVHja7V3ZbuM6DK25/v8fT1LcuZNIlMzNKQpYbw1qmTo6XLX46+tud7vb3e52t59rzDcGH2nHcWPwEUIfh/4OSUlZEI9HQ0Rhgt7u4dn/4wXPzoWV+gl94LUSdwBC/I3w0ESbwAaVuX/kTrD12WVfh7bEUnsBmCj/xbpB5k331EjoR3dds3YFICTHvtWcOZx0j9pH6OPo0EDgM0DgAhyKUF/c/b+GXV1dJDEfvpaknVzb/Yta/u2pIXa5QGKajP3DuT4a8+QJENLq7GkCLYSuUpr8EkcA4SEGgCHak5q6yBFp1ATQJ+gcIzW8knYRab1535hLBzxircJF6bBCYYklrCXsi0ki2kJHuOVjM3jVzA+Yjci7yE2lVzcMF5jnBoykwQZRSmLwA4EUQQ1qOD8y+0cTwVakoaGTvcS8kvgMEApaRokhbUk9OFtQaUOaQ2PvlXj/Ngq7Do1AYUhtOlsj0U0hXbf15CwOGFk0ulSN4qJgQuplzkrY4BE1qM5ntmcvsQSQxj3O8Gxr+Dgq9TYZ0XqUVw8UQz6O3NzgNc70z+rjWCMlpxpgLK6fagtUN6/ZtNI5UeIb4RIwQyveNEhd45CwHnNN87FaiODwTKtL4oU0ixLsq09gx4xTwrlpxUxTNXiBxDx7RsnmcDbpJ8/kAa+5w5T2U5HQsR4wUyuiUxUCEwL1ZcZwih/nmKVpG0vVzEdzdovOJBZrzsVbguATxkDW2nI2bJBUwrZUQUhOEK+QkFPts03mCWMkrcCSozRUC1TcJDEs+vXj/C6z7iPwQjibCxuWugiZ18Ykxt2jxs+DM3juX3huaECbHFvGcCGb1gyl32b2Lc3kC99qmmm73xUnXpO4v4vBYvYAp/SIJh6YeJjfJlbjoGFFYlkr4bxWrLvQhg3ybpSbSkWLzNPDSMPWB0oFrfXTMNER9tr2zI/FnEY8m+F4sRLDhOThCY72wLUVg+WAdQLpdLFNR0hpDWSx3knhUY8MhiilsSbx8n0y/gTn3oP0y2k7IBU3LHDzOLPZJksMOKguDq/WricySsKkyuoBzTtwy7VlJgZiSkHVhZmFrYLxF8gAoyskpKaHw7iDhIY9xXpmdq8SMEomhqga7xx2epTbpBHjowVqjKNS3uxgS8wjCJLS9BUS9TV/jBh5G9OQ1cWiU3mfKl77wtx0oi0ZVA3eSuyQIwo5ijo12BQChy4h9xZ2AP3VKHYsGAxQuoEaugMaZlkhAQdvRp7cCaMBoFeuN5C0NFDDHvQItObeojYSDUAHulgGcoFonq4CeuxSc7iQDbR+FGhZguSPMhuoYSvF+Df/XqA3vPVn8h8DupfRHzUdO0vsLmBcBvTSRuOvs9G72EK9wcTHnCGVnCH3uxZ31MFbLL2F7auBboqj+Qfj6D2U7KR0cxyNjswwVJqQH88MT4yDu/p5VWY4URFTNhV/vNZxVqMTp3JdVevQBfJBYC6r3nmryaclOm/S0lu9U089GuP2/+J6NPiIiGA1Z4THVbeyMpfTL5igoLpWWKCoh4dzPkpHRa9aYZndmJ6Lo2zzidMKm4wlTELXTtW1rhnizDk0/5MWc4bOun/vKrj60HE18M1ZUWI2ZATzX61NvjhxS9dide7rAJ+BKR7JvWpfh6H2sjvVY+1UwrXw2rdTCRsJvZk1KinhZp+TsZl0eerL3ntHu+nv23unjYTemd+SxLJ+B8zjgPm46KPRajep7GZfrt9NmiH0pjtu200KNhSBaEmsztXxak6r4eZRTgGtvtfGzN32UTJGQgGgcT/32HRkB3yja6C0pM/NnZxusA5WkRtoPduo13OGRZwGpp3S6TMsuOwYxygucirrcBIzeyqrndAbSaTlVBasO2YvU4xzhu5sInfOkH3/yLRvvutSMuc5J5xlR4p3tFbXvVknZ9FtA3znI9U9O6FMDhJJS+7k7LEf1jDJ1sWZ9llwcPtil0f0j5RiQY0z1cTyWXA6sUrTu4lfeC3DZSaa2JXi8OSTKnEZOVMU8Yfm0dsN+FRes2gOT/u2ua9DgtO9Nx8aOIoZPk7ktDSzxBRhkqdc4I90A1sTZG+B3oTGyCnucNFKnTydsyDx30BzuCbFizRHBmj4VRNq6+YK76K1L4nzAiL7KGAH8x4QDebJwVvCrLB8uJY7cedW4nY79joLSUtMXqXCkFNxxvOre+3+u2M2dYtc5vCl/xlZSsxbiSlgvq64yVFS6Ru42UkZOSgSZFYXb7xrK2NVOrpqkpAb/fbWndsHKvvazQyzwLGICyi/hSAstzSZ23ToTc0Sr+r042WLMHzJIrpKHLwl+Ay7ZIU+srwG0irxhnXfzuqRrljWP7HJK2A+Tm9E1+ych0yqdpuN8BzmDmhC3x3/6SUnDg0DLvsqAWEH32rdc1D3CmtkDokv+87GKRa1j9JQy3dYguWkpSfSBolz32GZQrgpPSp/Q2b74SLfJFbutqG41WmQeCkNO9Lm5u4DvQO/tOjM68uzbtNqJtw9eACpvNy12/59Nvj/U2rfn3tp/rbcFe0R4L5KTF93u9vd7na3X93+AGApOn6aJi5TAAAAAElFTkSuQmCC";
const enc = new TextEncoder();

const BASE_HEADERS = { "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "same-origin" };

function b64url(buf) {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(str) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// 常数时间比较：先各自做 SHA-256，再逐字节异或，长度信息也不会泄露。
async function safeEqual(a, b) {
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(a))),
    crypto.subtle.digest("SHA-256", enc.encode(String(b))),
  ]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode("oao-session-v1:" + secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function makeToken(secret) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = "v1." + exp;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payload));
  return payload + "." + b64url(sig);
}
async function validToken(token, secret) {
  const m = /^v1\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token || "");
  if (!m || Number(m[1]) <= Math.floor(Date.now() / 1000)) return false;
  try {
    // subtle.verify 本身是常数时间比较
    return await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(m[2]), enc.encode("v1." + m[1]));
  } catch {
    return false;
  }
}
function readCookie(request, name) {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

// 只允许跳回本站的相对路径（/xxx），拒绝 //evil.com、/\evil.com、绝对地址等。
function safeNext(raw, request) {
  if (typeof raw !== "string" || raw.length > 512) return "/";
  // 拒绝控制字符、反斜杠、以及非「以单个 / 开头」的值（包括 //、/\、绝对 URL）
  if (/[\u0000-\u001f\u007f\\]/.test(raw) || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  try {
    const base = new URL(request.url);
    // 再按 URL 规范解析一遍，确认仍是本站（%5C、%0A 这类编码保持编码，不会变成真正的反斜杠/换行）
    const u = new URL(raw, base.origin);
    if (u.origin !== base.origin) return "/";
    if (u.pathname.startsWith("/__log") || u.pathname.includes("\\") || u.pathname.startsWith("//")) return "/";
    // 只允许路径 + 查询 + hash；三者都不能含控制字符
    const out = u.pathname + u.search + u.hash;
    if (/[\u0000-\u001f\u007f\\]/.test(out)) return "/";
    return out;
  } catch {
    return "/";
  }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function loginPage({ next = "/", error = false, status = 401 } = {}) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="color-scheme" content="light dark" />
<meta name="theme-color" content="#f5f5f7" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />
<meta name="robots" content="noindex, nofollow" />
<title>OAO 摄影社 · 成员登录</title>
<style>
  /* v3 r2：与站点首屏同一套底色与光晕，登录 → 进站是一段连续的过渡；无外链资源 */
  :root { color-scheme: light dark; --green: #007354; --text: #1d1d1f; --muted: #6e6e73;
    --e: cubic-bezier(0.22, 1, 0.36, 1); --spring: cubic-bezier(0.34, 1.4, 0.64, 1); }
  * { box-sizing: border-box; }
  html { background: #f5f5f7; }
  body {
    margin: 0; min-height: 100vh; min-height: 100dvh; display: grid; place-items: center;
    padding: max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom));
    color: var(--text);
    background:
      radial-gradient(70vmax 46vmax at 10% -6%, rgba(0, 115, 84, 0.10), transparent 62%),
      radial-gradient(64vmax 42vmax at 96% 2%, rgba(0, 122, 255, 0.08), transparent 62%),
      linear-gradient(180deg, #fbfbfd 0, #f5f5f7 100%);
    background-repeat: no-repeat; background-color: #f5f5f7;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
      "Microsoft YaHei", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main {
    width: 100%; max-width: 400px; text-align: center;
    padding: 44px 32px 30px; border-radius: 32px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95), inset 0 0 0 1px rgba(0, 0, 0, 0.05),
      0 2px 6px rgba(0, 0, 0, 0.04), 0 30px 80px -10px rgba(0, 0, 0, 0.16);
    transition: opacity 520ms var(--e), transform 620ms var(--e), filter 520ms var(--e);
  }
  @supports (corner-shape: squircle) { main { corner-shape: squircle; border-radius: 52px; } }
  @supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    main { background: rgba(255, 255, 255, 0.72); backdrop-filter: blur(30px) saturate(180%); -webkit-backdrop-filter: blur(30px) saturate(180%); }
  }
  @keyframes rise { from { opacity: 0; transform: translateY(22px) scale(0.97); filter: blur(8px); } to { opacity: 1; transform: none; filter: none; } }
  @keyframes item { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  main { animation: rise 900ms var(--e) both; }
  main > * { animation: item 800ms var(--e) both; }
  main > :nth-child(2) { animation-delay: 120ms; }
  main > :nth-child(3) { animation-delay: 180ms; }
  main > :nth-child(4) { animation-delay: 240ms; }
  main > :nth-child(5) { animation-delay: 300ms; }
  /* 提交后：卡片轻轻后退、变虚，站点首屏在同一底色上接着淡入 */
  body.leaving main { opacity: 0; transform: scale(0.96) translateY(-8px); filter: blur(6px); }
  .logo { display: block; width: 148px; height: auto; margin: 0 auto 22px; }
  h1 { margin: 0 0 8px; font-size: 30px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.12; }
  .sub { margin: 0 0 28px; color: var(--muted); font-size: 15px; line-height: 1.55; }
  form { display: grid; gap: 10px; text-align: left; }
  label { padding-left: 4px; font-size: 13px; font-weight: 500; color: var(--muted); }
  input[type="password"] {
    width: 100%; height: 52px; padding: 0 18px; border: 0; border-radius: 16px;
    background: rgba(118, 118, 128, 0.12); color: var(--text); font: inherit; font-size: 17px;
    outline: 2px solid transparent; transition: background 240ms var(--e), outline-color 240ms var(--e), box-shadow 240ms var(--e);
  }
  input[type="password"]:hover { background: rgba(118, 118, 128, 0.16); }
  input[type="password"]:focus { background: #fff; outline-color: var(--green); box-shadow: 0 0 0 6px rgba(0, 115, 84, 0.12); }
  input[aria-invalid="true"], input[aria-invalid="true"]:focus { outline-color: #d70015; background: #fff; box-shadow: 0 0 0 6px rgba(215, 0, 21, 0.10); }
  button {
    height: 52px; margin-top: 10px; border: 0; border-radius: 980px; cursor: pointer;
    background: linear-gradient(180deg, #3a3a3c 0%, #1d1d1f 100%); color: #fff;
    font: inherit; font-size: 17px; font-weight: 600;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16), 0 1px 2px rgba(0, 0, 0, 0.18), 0 8px 20px rgba(0, 0, 0, 0.14);
    transition: background 200ms ease, transform 520ms var(--spring), box-shadow 300ms var(--e);
  }
  button:hover { background: linear-gradient(180deg, #2c2c2e 0%, #000 100%); }
  button:active { transform: scale(0.96); transition-duration: 120ms; }
  button:focus-visible { outline: 2px solid var(--green); outline-offset: 3px; }
  .error { margin: 2px 0 0; color: #d70015; font-size: 14px; text-align: center; }
  .foot { margin: 24px 0 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
  @media (max-width: 440px) { main { padding: 38px 22px 26px; } }
  @media (prefers-reduced-transparency: reduce) { main { background: #fff !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; } }
  /* v4：深色模式跟随系统（实时切换），色板与站内一致 */
  @media (prefers-color-scheme: dark) {
    :root { --green: #30d158; --text: #f5f5f7; --muted: #a1a1a6; }
    html { background: #000; }
    body {
      background:
        radial-gradient(70vmax 46vmax at 10% -6%, rgba(48, 209, 88, 0.08), transparent 62%),
        radial-gradient(64vmax 42vmax at 96% 2%, rgba(10, 132, 255, 0.09), transparent 62%),
        #000;
      background-repeat: no-repeat; background-color: #000;
    }
    main { background: rgba(28, 28, 30, 0.96);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.10), inset 0 0 0 1px rgba(255, 255, 255, 0.06), 0 30px 80px -10px rgba(0, 0, 0, 0.8); }
    .logo { filter: invert(1) brightness(0.96); }
    input[type="password"] { background: rgba(118, 118, 128, 0.24); }
    input[type="password"]:hover { background: rgba(118, 118, 128, 0.30); }
    input[type="password"]:focus { background: #2c2c2e; box-shadow: 0 0 0 6px rgba(48, 209, 88, 0.16); }
    input[aria-invalid="true"], input[aria-invalid="true"]:focus { outline-color: #ff453a; background: #2c2c2e; box-shadow: 0 0 0 6px rgba(255, 69, 58, 0.16); }
    button { background: linear-gradient(180deg, #fff 0%, #e5e5ea 100%); color: #000;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 8px 20px rgba(0, 0, 0, 0.5); }
    button:hover { background: #fff; }
    .error { color: #ff6961; }
  }
  @supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    @media (prefers-color-scheme: dark) { main { background: rgba(28, 28, 30, 0.64); } }
  }
  @media (prefers-color-scheme: dark) and (prefers-reduced-transparency: reduce) { main { background: #1c1c1e !important; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }
</style>
</head>
<body>
<main>
  <img class="logo" src="${LOGO}" width="360" height="90" alt="OAO 摄影社" />
  <h1>OAO 摄影社</h1>
  <p class="sub">社团活动记录站仅对社员开放<br />请输入访问密码</p>
  <form method="post" action="/__login">
    <input type="hidden" name="next" value="${esc(next)}" />
    <label for="pw">访问密码</label>
    <input id="pw" name="password" type="password" autocomplete="current-password" required autofocus${error ? ' aria-invalid="true" aria-describedby="err"' : ""} />
    ${error ? '<p class="error" id="err" role="alert">密码错误</p>' : ""}
    <button type="submit">进入</button>
  </form>
  <p class="foot">登录后 30 天内无需再次输入 · 密码请向社团负责人索取</p>
</main>
<script>
  /* 提交时先让卡片退场，再真正提交；JS 不可用时表单照常提交 */
  (function () {
    var f = document.querySelector("form"), done = false;
    if (!f) return;
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    f.addEventListener("submit", function (e) {
      if (done || reduce) return;
      e.preventDefault(); done = true;
      document.body.classList.add("leaving");
      setTimeout(function () { f.submit(); }, 380);
    });
  })();
</script>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { ...BASE_HEADERS, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function redirect(location, cookie) {
  const h = new Headers({ ...BASE_HEADERS, Location: location, "Cache-Control": "no-store" });
  if (cookie) h.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers: h });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const secret = env.SITE_PASSWORD;
  if (!secret) {
    return new Response("Site is locked (no password configured).", {
      status: 503, headers: { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const url = new URL(request.url);

  if (url.pathname === "/__logout") {
    return redirect("/", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  }

  if (url.pathname === "/__login") {
    if (request.method !== "POST") return loginPage({ next: safeNext(url.searchParams.get("next"), request) });
    let form;
    try { form = await request.formData(); } catch { return loginPage({ error: true }); }
    const dest = safeNext(form.get("next"), request);
    if (!(await safeEqual(form.get("password") || "", secret))) {
      await new Promise((r) => setTimeout(r, 400)); // 稍微拖慢暴力猜测
      return loginPage({ next: dest, error: true });
    }
    const token = await makeToken(secret);
    return redirect(dest, `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`);
  }

  // 后端源码只供 Functions 打包引用，不当静态文件对外提供（即使已登录）
  if (url.pathname.startsWith("/cloud-function/") || url.pathname === "/cloud-function") {
    return new Response("Not found", {
      status: 404, headers: { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  if (!(await validToken(readCookie(request, COOKIE), secret))) {
    // API 返回 JSON 401（前端 fetch 能读懂），页面/静态资源返回品牌登录页
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ ok: false, code: "SITE_LOCKED", msg: "请先输入站点访问密码" }), {
        status: 401, headers: { ...BASE_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return loginPage({ next: safeNext(url.pathname + url.search, request) });
  }

  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set("X-Robots-Tag", "noindex, nofollow");
  const type = out.headers.get("Content-Type") || "";
  if (url.pathname.startsWith("/api/file/") && res.status === 302) {
    out.headers.set("Cache-Control", "private, max-age=1500"); // 附件跳转：浏览器私有缓存 25 分钟（临时地址有效期 24 小时）
  } else if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    out.headers.set("Cache-Control", "private, no-store"); // 接口数据不缓存
  } else if (type.includes("text/html") || (res.status >= 300 && res.status < 400 && res.status !== 304)) {
    out.headers.set("Cache-Control", "private, no-store");
  } else if (url.pathname.startsWith("/assets/")) {
    out.headers.set("Cache-Control", "private, max-age=86400"); // 图片只缓存在自己浏览器里，1 天
  } else {
    out.headers.set("Cache-Control", "private, no-cache"); // CSS/JS：每次用 ETag 校验，改了立刻生效
  }
  return out;
}
