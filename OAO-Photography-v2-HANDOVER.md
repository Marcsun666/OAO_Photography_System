# OAO Photography Club (OAO 摄影社) website: v2 handover

> **Version:** v2, with a live backend. Snapshot taken 2026-10-08.
> **Live URL:** <https://oao-photography.pages.dev>. The whole site is password-locked; ask the owner for the password.
> **Source:** the `OAO-Photography-v2-source.zip` that came with this file. It is also backed up in the private GitHub repo `Marcsun666/OAO_Photography_System` (tag `v2`; see §11).
> **v3 status (2026-10-08):** v3 is a style refinement. It is deployed as a **preview only** at <https://v3.oao-photography.pages.dev> (git branch `v3`). Production is still v2. See §16 for the promote and rollback steps.
> **Language:** this doc is in English. Chinese UI text and Feishu table/field names are quoted exactly. Never translate them in code.

---

## 0. Instructions for an AI taking over (read first)

1. **Read this whole file before changing anything.** It is self-contained. The older docs in `source/` (`HANDOVER.md` in Chinese, plus `README.md`, `PLAN.md` and `SETUP.md`) give extra background. Where they disagree with this file, this file wins. In particular, older text that says the backend is a Tencent Cloud function, or that the site is in "demo mode", is out of date.
2. **Ask the owner for:**
   - the source zip `OAO-Photography-v2-source.zip`, or access to the private GitHub repo (§11). A link alone is useless, because the site is locked and the source is private.
   - the **site password** and the **member passcode**. The owner knows both.
   - access to the accounts: Cloudflare (Pages project `oao-photography`), the Feishu custom app `OAO 摄影社资料库` (App ID `cli_aa4dacab62f81bef`) together with the Base, DeepSeek, and GitHub.
   - the real secrets, or permission to regenerate them (§6). They are **not** in the zip or the repo. Nobody can read them back out of Cloudflare.
3. **Security rules:**
   - Never put API keys, the Feishu App Secret, the DeepSeek key, `MEMBER_TOKEN` or `SITE_PASSWORD` in frontend files (`index.html`, `app.js`, `config.js`, …), in Git, or in chat logs.
   - Secrets belong only in Cloudflare Pages secrets. If you use Tencent SCF, they go only in its environment variables.
   - Pipe secret values into `wrangler pages secret put` (§9.4) so they never appear on screen.
4. **Privacy rules:**
   - The 成员 table holds students' names, classes and student IDs (学号).
   - `assets/media/` (photos of students) is deliberately **not** deployed and **not** included in this package.
   - Keep the site password lock (`functions/_middleware.js`) in front of everything, `/api/*` included.
5. **After any change:**
   - Run the 4 offline tests (§9.2).
   - Rebuild the deploy folder with `tools/build-deploy.sh`.
   - Deploy (§9.4).
   - Run the live checks in §14.

---

## 1. Snapshot

| Item | Value |
|---|---|
| Live site | `https://oao-photography.pages.dev` (Cloudflare Pages project `oao-photography`, production branch `main`) |
| Hosting plan | Cloudflare **Free**; no card on file |
| Cloudflare account | the owner's account, logged in as `marcsun.1028@gmail.com` |
| GitHub | `Marcsun666`; private backup repo `Marcsun666/OAO_Photography_System` |
| Feishu tenant | `ecnxe8up97z7.feishu.cn` |
| Feishu app | `OAO 摄影社资料库`, App ID `cli_aa4dacab62f81bef` (custom app 企业自建应用) |
| Feishu Base | It sits inside a wiki page: `https://ecnxe8up97z7.feishu.cn/wiki/HNh2w3hL7igXCikus2fc6tIonqK`. The wiki node token is `HNh2w3hL7igXCikus2fc6tIonqK` and the Base app_token is `ENpjbWJVzaNUtEsGlMecJLvFnef`. The Base's own title is still "Untitled bitable". |
| AI model | DeepSeek `deepseek-chat`, used **only** for AI 分组 (AI grouping) |
| Data at snapshot | The tables were emptied after testing. The owner has since added 1 real record in 成员. All live data lives **only in Feishu**, not in this package. |

---

## 2. What the site is and its features

It is a Chinese-language site for a high-school photography club. It works both as an internal tool (logging activities, storing photos and cloud-drive links, the member roster, AI grouping) and as a showcase (photo gallery, Bilibili area, recruiting). Pages are vanilla HTML/CSS/JS with no build step.

Sections of `index.html`, top to bottom:

| Section (id) | Heading | What it does |
|---|---|---|
| hero, stat-band | – | Hero image. The stats show activity count, 照片数 total and 视频数 total, summed live from 活动记录 |
| `#record` | 选择记录方式 | Cards for 照片组 / 视频组 and the Bilibili account card (placeholder link) |
| `#workspace` | 照片 / 视频工作台 | Status counts per group (照片组: 待选片/精修中/待交付/已归档; 视频组: 待剪辑/调色中/待发布/已发布) |
| `#request` | 申请 OAO 拍摄活动 | **Shooting-request form.** It posts to `/api/request` and creates a 活动记录 row with 状态=待选片 |
| `#timeline` | 活动记录时间线 | Activity timeline from 活动记录, with the 封面 cover image |
| `#library` | 活动素材库 | Material library from 照片素材: cloud-drive links with 提取码, and uploaded files |
| `#bilibili` | B 站视频作品区 | Links from 外链 where 平台 = B站 |
| `#works` | 照片合集 | Masonry gallery of uploaded photos with a lightbox. Images load through `/api/file/:token` |
| `#members` | 成员资料与技能 | Member profile form (姓名/班级/学号/性别/职位/技能/备注), the roster, and the **AI 分组** tool (`#group-tool`, 2–20 groups). All of it needs member login |
| `#teams`, `#events` | – | Static club intro |
| `#join` | 招新 form | **Local UI simulation only.** It is not connected to the backend (`script.js`) |
| header | 成员登录 button, ＋ 上传 / 贴链接 button | Member login modal (`#login-modal`) and upload modal (`#upload-modal`: paste a cloud-drive link, or upload a photo directly) |

---

## 3. Architecture

```
Browser ──HTTPS──> Cloudflare Pages (project oao-photography)
                   │
                   ├─ functions/_middleware.js   runs on EVERY request (pages, assets, /api/*)
                   │     no valid __Host-oao_session cookie → branded login page (401)
                   │                                           or JSON 401 for /api/*
                   │     POST /__login (form: password, next) → sets the HMAC cookie (30 days)
                   │     /cloud-function/* → 404 (backend source is never served)
                   │
                   ├─ static files: index.html, app.js, script.js, styles.css, config.js, assets/brand, assets/events
                   │
                   └─ functions/api/[[path]].js  handles /api and /api/*
                         └─ imports cloud-function/index.js → handle(req, context.env)
                               ├─ Feishu Open API (open.feishu.cn): tenant_access_token, Bitable records,
                               │      drive/v1/medias/upload_all, medias/batch_get_tmp_download_url
                               └─ DeepSeek https://api.deepseek.com/chat/completions  (only POST /api/group)
```

- **Frontend:**
  - `config.js` sets `proxyUrl: window.location.origin` and `demo: false`. `app.js` calls `proxyUrl + "/api/..."`. Those calls are same-origin, so the site cookie is sent automatically.
  - Member requests also send `Authorization: Bearer <MEMBER_TOKEN>`, which is kept in `sessionStorage` under `oao_token`.
- **Backend:**
  - `cloud-function/index.js` is **one codebase for two platforms**. It runs on Cloudflare Pages Functions today and can also run on Tencent SCF (`exports.main_handler`).
  - It uses only Web-standard APIs (fetch, FormData, Blob, atob/`Uint8Array.fromBase64`, AbortController), with no Node builtins and no `nodejs_compat`. Under Node, `Buffer` is used only when present.
  - There is no `wrangler.toml`. Pages uses its defaults.
- **Caching:**
  - The Feishu tenant token and photo temp-download URLs are cached per isolate: the token until shortly before it expires, the URLs for 30 min.
  - The middleware gives `/api/file/*` redirects `private, max-age=1500`. Other `/api/*` responses get `private, no-store`.
- **Storage:** everything is stored in Feishu Bitable (§7), and photo files are Bitable attachments. There is no database on Cloudflare.
- **Fixed v2 bug:** `mediaDownload()` used to call `/drive/v1/medias/:token/download`, which returns raw bytes rather than JSON. It now calls `batch_get_tmp_download_url`.

---

## 4. Access levels

| Level | How | What it unlocks | Where the logic lives |
|---|---|---|---|
| 1. **Site password** | The login page posts to `POST /__login` (form fields `password`, `next`). It is checked in constant time against the Pages secret `SITE_PASSWORD`. | Everything: every page and asset, plus the read APIs (`/api/activities`, `/api/photos`, `/api/links`, `/api/file/*`) and `POST /api/request` | `functions/_middleware.js` |
| 2. **Member passcode** | Click 成员登录 and enter the passcode, which calls `POST /api/auth {passcode}`. If it matches `MEMBER_PASSCODE`, the server returns `MEMBER_TOKEN` and the frontend stores it in `sessionStorage`. | ＋ 上传 / 贴链接 (activities, photo links, photo upload, Bilibili/小红书 links), the 成员 roster and member form, and AI 分组 | `cloud-function/index.js` (`isAuthed`) |

**Site cookie details:**
- Cookie name `__Host-oao_session`, value `v1.<exp>.<HMAC-SHA256 sig>`.
- The key is derived from `"oao-session-v1:" + SITE_PASSWORD`, so **changing the password logs everyone out**.
- Flags: HttpOnly, Secure, SameSite=Lax, 30 days.
- `/__logout` clears it.
- If `SITE_PASSWORD` is unset, the site fails closed with 503.
- Responses carry `X-Robots-Tag: noindex`.
- The `next` redirect only accepts same-site paths.

**MEMBER_TOKEN** is a static string that never expires (MVP design). To revoke it, set a new `MEMBER_TOKEN` and redeploy. Members then log in again; tokens live in `sessionStorage`, so closing the tab also clears them.

The owner knows the **site password** and the **member passcode**. Neither is written in this package.

---

## 5. File tree (the zip and the GitHub repo have the same layout)

```
README.md                        short pointer to this file
.gitignore                       .wrangler, node_modules, .dev.vars, *.env, assets-originals, assets/media, …
OAO-Photography-v2-HANDOVER.md   this file (copy also at source/HANDOVER-v2.md)
feishu-tables.json               Base app_token + table ids + field list (no secrets)
deploy/                          exactly what was deployed to Cloudflare Pages for v2 (built by tools/build-deploy.sh)
source/
├─ index.html          the single page: all sections, login modal, upload modal, lightbox
├─ app.js              data layer: config/demo handling, api(), rendering of all live sections, member login,
│                      upload (FileReader → base64 → /api/upload), member form, AI grouping UI.
│                      Has its own copy of the field-name constants `var F = {...}` (must match the backend)
├─ script.js           UI only: masonry gallery, lightbox, copy buttons, glass effects, 招新 form (local simulation)
├─ styles.css          all styles. Structure: base layer, then the "Apple 结构 + Sequoia 配色" override layer.
│                      Design tokens live in the single :root. Accessibility overrides must stay at the end
├─ config.js           window.OAO_CONFIG = { proxyUrl: window.location.origin, demo: false }
├─ functions/
│  ├─ _middleware.js   site password lock (login page, HMAC cookie, /__login, /__logout, JSON 401 for /api,
│  │                   404 for /cloud-function/*, cache headers)
│  └─ api/[[path]].js  Pages Function: converts Request → {method,path,headers,body,query} → api.handle(req, env)
├─ cloud-function/
│  ├─ index.js         THE backend: Feishu proxy, routes (§8), upload, attachment redirect, AI grouping
│  │                   (prompt, callModel → DeepSeek, JSON parsing, constraint checks, save to 分组).
│  │                   Field names in `const F = {...}`
│  ├─ dev-server.js    local Node server on :9000 (SCF-style; uses process.env)
│  ├─ test.js          offline backend tests (fetch mocked)
│  └─ package.json     for Tencent SCF (`main: index.js`, no dependencies)
├─ tools/
│  ├─ build-deploy.sh  builds the deploy folder from source (copies only what the site needs)
│  └─ feishu/          Python stdlib tools: fs.py (API helper), schema.py (expected tables),
│                      setup_tables.py (create/repair tables, idempotent), verify.py (check schema and
│                      write feishu-tables.json), feishu-tables.json, README.md
├─ assets/brand/       logo (OAO.png, also the favicon), recruiting banner/poster (WebP + OG jpg)
├─ assets/events/      23 compressed WebP event photos used by the static page and the demo data
├─ frontend.test.js    runs app.js in a fake DOM in 3 modes (connected / static / demo)
├─ integration.test.js checks DOM ids, that `F` matches in app.js and cloud-function/index.js, and field names in SETUP.md
├─ design.test.js      colour-contrast and CSS brace-balance checks
├─ SETUP.md            (Chinese) Feishu setup + backend setup: 2A Cloudflare (current), 2B Tencent SCF
├─ HANDOVER.md         (Chinese) long v1 history and design notes; points to HANDOVER-v2.md
├─ HANDOVER-v2.md      copy of this file
├─ README.md           (Chinese) overview; partly outdated (mentions Tencent as the middle layer)
├─ PLAN.md             (Chinese) the original plan; historical
│
│  ── UNUSED LEFTOVERS (from an abandoned Next.js/Supabase/Prisma plan; nothing loads them) ──
├─ lib/*.ts            ai.ts auth.ts crypto.ts db.ts demo.ts env.ts logger.ts notifications.ts supabase.ts validation.ts
├─ next.config.ts, next-env.d.ts, tsconfig.json
└─ package.json, package-lock.json   list Next/React/Supabase/Prisma deps. NOT needed: no npm install is required for anything
```

**Not included:**
- `assets/media/`: 49 original photos (~73 MB) of students. Kept out for privacy. Nothing references it.
- `assets-originals/`: ~47 MB full-size originals of brand/events. These exist only on the original build machine and with the owner. Ask the owner for them if you need to re-export images.
- `node_modules/`, `.wrangler/`, backups.
- Every secret.

---

## 6. Cloudflare Pages secrets (production environment)

Set them with `wrangler pages secret put NAME --project-name oao-photography`. **A new deployment is needed before a changed secret takes effect.** `wrangler pages secret list --project-name oao-photography` shows the names only.

| Secret | Purpose | Value |
|---|---|---|
| `SITE_PASSWORD` | Site lock password; also the HMAC key source for the cookie | `<ask owner>`. The owner knows it. To change it, pick a new one, put the secret, and redeploy. Everyone is logged out. |
| `FEISHU_APP_ID` | Feishu custom app id | `cli_aa4dacab62f81bef` |
| `FEISHU_APP_SECRET` | Feishu app secret, used for tenant_access_token | `<ask owner>`. Find or reset it at open.feishu.cn → the app → 凭证与基础信息 → App Secret. After a reset, update the secret and redeploy. |
| `BITABLE_APP_TOKEN` | Base app_token | `ENpjbWJVzaNUtEsGlMecJLvFnef` |
| `BITABLE_UPLOAD_PARENT_NODE` | `parent_node` for `upload_all` (`parent_type=bitable_file`) | `ENpjbWJVzaNUtEsGlMecJLvFnef` (same as the app_token; optional, since the code falls back to the app_token) |
| `TABLE_ACTIVITIES` | 活动记录 table id | `tblb0VFnEzPJiX2Q` |
| `TABLE_PHOTOS` | 照片素材 | `tblHR1Pm4DzDPX2n` |
| `TABLE_LINKS` | 外链 | `tblP3MUlzdHPDoMb` |
| `TABLE_MEMBERS` | 成员 | `tblIOuQufdKJ8JaG` |
| `TABLE_GROUPS` | 分组 (optional: without it, grouping results are not saved) | `tblROKlxEP0058Rj` |
| `LLM_API_KEY` | DeepSeek API key (AI 分组 only) | `<ask owner>`. Create a new one at platform.deepseek.com → API keys (§10c). |
| `LLM_API_URL`, `LLM_MODEL` | optional overrides | not set; defaults are `https://api.deepseek.com/chat/completions` and `deepseek-chat` |
| `MEMBER_PASSCODE` | member passcode typed in 成员登录 | `<ask owner>`. The owner knows it. Format used: `oao-` + 6 digits. |
| `MEMBER_TOKEN` | static bearer token returned after a correct passcode | `<regenerate>`: `python3 -c 'import secrets;print(secrets.token_urlsafe(32))'`. Any random string works; nobody needs to know it. |
| `ALLOWED_ORIGIN` | CORS `Access-Control-Allow-Origin` | `https://oao-photography.pages.dev`, i.e. `https://<project>.pages.dev` or your custom domain. Not strictly needed while the frontend and API are same-origin. |

Every one of these, including the non-secret ids, is stored as an encrypted secret.

---

## 7. Feishu Base schema (must match `const F` in `cloud-function/index.js` and `var F` in `app.js`)

Base `ENpjbWJVzaNUtEsGlMecJLvFnef`. Field types are 1 text, 2 number, 3 single select and 17 attachment. **★ marks the primary (first) field.**

**活动记录** (`TABLE_ACTIVITIES` = `tblb0VFnEzPJiX2Q`). This is the Base's original default table, renamed; its primary field was renamed from "Text".

| Field | Type | Options / notes |
|---|---|---|
| 活动名称 ★ | text | activity name; photos link to it **by exact name** |
| 日期 | text | e.g. `2026.06` (text, not date) |
| 组别 | single select | 照片组 / 视频组 / 两者 |
| 状态 | single select | 待选片 / 精修中 / 待交付 / 已归档 / 待剪辑 / 调色中 / 待发布 / 已发布 |
| 类型 | single select | 舞台 / 运动 / 联动 / 公益 / 招新 / 课程 / 其他 |
| 照片数 | number (format `0`) | auto +1 on each photo added for this 活动名称. The Feishu list API returns numbers as **strings** (e.g. `"3"`), and both frontend and backend handle that. |
| 视频数 | number | |
| 描述 | text | |
| 封面 | attachment | cover image. **Only settable in Feishu directly**; no API route writes it. |
| 网盘链接 | text | Baidu cloud-drive link (text, not a URL field, because the code writes plain strings) |
| 提取码 | text | |

**照片素材** (`TABLE_PHOTOS` = `tblHR1Pm4DzDPX2n`)

| Field | Type | Options / notes |
|---|---|---|
| 活动 ★ | text | activity name (matches 活动记录.活动名称) |
| 文件 | attachment | uploaded photo |
| 网盘链接 | text | |
| 提取码 | text | |
| 分类 | single select | campus / sports / stage / collab / landscape |
| 说明 | text | |

**外链** (`TABLE_LINKS` = `tblP3MUlzdHPDoMb`). Quirk: Feishu does **not** allow a single-select primary field, so 标题 is first instead of 平台.

| Field | Type | Options |
|---|---|---|
| 标题 ★ | text | |
| 平台 | single select | B站 / 小红书 / 其他 (the Bilibili section shows B站 / Bilibili / bilibili) |
| 链接 | text | |
| 备注 | text | |

**成员** (`TABLE_MEMBERS` = `tblIOuQufdKJ8JaG`). **Personal data.** Reading and writing both need a member login. Writes are upserts **by 学号**.

| Field | Type | Options |
|---|---|---|
| 姓名 ★ | text | |
| 班级 | text | e.g. G11-3 |
| 学号 | text | dedupe key |
| 性别 | single select | 男 / 女 / 无性别 |
| 职位 | text | e.g. 照片组组长 / 干事 / 社员 |
| 技能 | text | separated by 、 (e.g. `拍照、修图、调色`). Text rather than multi-select on purpose. |
| 备注 | text | |

**分组** (`TABLE_GROUPS` = `tblROKlxEP0058Rj`). One row per group from an AI 分组 run.

| Field | Type | Notes |
|---|---|---|
| 批次 ★ | text | run timestamp, UTC, `YYYY-MM-DD HH:MM:SS` |
| 组名 | text | |
| 成员 | text | separated by 、 |
| 技能覆盖 | text | separated by 、 |
| 说明 | text | the model's reason |

Writing a single-select value that doesn't exist yet makes Feishu create the option. Column names must match **character for character**, or reads and writes silently return nothing. `integration.test.js` guards the two `F` constants and SETUP.md.

---

## 8. API routes (`cloud-function/index.js` → `route()`)

All routes sit behind the site-password middleware on Cloudflare. "Member" means the request needs the header `Authorization: Bearer <MEMBER_TOKEN>`.

| Method and path | Auth beyond the site cookie | Body / notes |
|---|---|---|
| GET `/api/health` | none | `{ok, mode: "connected" or "missing-env", time}` |
| POST `/api/auth` | none | `{passcode}` → `{ok, token}` or 401 `口令不正确` |
| GET `/api/activities` | none | first 100 rows of 活动记录 (no pagination) |
| GET `/api/photos` | none | first 100 rows of 照片素材 |
| GET `/api/links` | none | first 100 rows of 外链 |
| GET `/api/members` | **member** | first 100 rows of 成员 |
| GET `/api/file/:file_token` | none | 302 to the Feishu temporary download URL (cached per isolate for 30 min; browser `private, max-age=1500`) |
| POST `/api/request` | none (public shooting-request form) | `{name, date, desc}` → 活动记录 row with defaults 状态=待选片, 组别=照片组, 类型=其他 |
| POST `/api/activities` | member | `{name,date,unit,status,type,desc,link,code,photoCount,videoCount}` |
| POST `/api/photos` | member | `{activity,link,code,category,note,fileToken?,photoAlreadyCounted?}`; increments 照片数 |
| POST `/api/upload` | member | `{fileName, mime, base64, activity, category, note}`. Uploads to Feishu (≤20 MB after decoding), creates the 照片素材 row and increments 照片数. Returns `fileToken`. |
| POST `/api/links` | member | `{platform,title,url,note}` |
| POST `/api/members` | member | `{name,klass,studentId (required),gender,role,skills,note}`; upsert by 学号 → `{updated}` |
| POST `/api/group` | member | `{groupCount: 2–20, note?}`. Reads 成员, calls DeepSeek, validates the result and saves to 分组. Errors: 400 for too few members, 501 if `LLM_API_KEY` is unset, 502 for model errors (401 invalid key, 402 insufficient balance, 429 rate limited). |
| anything else | – | 404 |

Middleware routes: `GET /__login` shows the form, `POST /__login` checks the password, and `/__logout` logs out. Without a cookie, any `/api/*` request returns `401 {"ok":false,"code":"SITE_LOCKED"}` and pages return the login page with status 401.

---

## 9. Local development, tests and deploy

### 9.1 Requirements
- **Node 22** for wrangler: v2 was deployed with wrangler **4.148**, run under Node 22.11.
- The **tests** need only Node 18 or newer, with no `npm install`.
- **Python 3** (stdlib only) for `tools/feishu/*`.
- **Original machine only:** wrangler lived in `~/.local/bin` and used Node `~/.local/node-v22.11.0-linux-x64`. The setup there was:
  ```bash
  export PATH=$HOME/.local/bin:$HOME/.local/node-v22.11.0-linux-x64/bin:$PATH WRANGLER_CACHE_DIR=/tmp/wcache
  ```
  Project-level wrangler commands were run from an empty folder containing only `{}` as `package.json`. On a normal machine you can simply use `npx wrangler@4 ...` anywhere.

### 9.2 Tests (run from `source/`)
```bash
node cloud-function/test.js   # backend routes/auth/upload/grouping (fetch mocked), Cloudflare handle(), Workers-safety
node frontend.test.js         # app.js rendering in connected / static / demo modes
node integration.test.js      # DOM ids, F constants front==back, field names in SETUP.md
node design.test.js           # contrast + CSS syntax
```
All 4 passed at handover.

### 9.3 Run locally
- **Full stack (recommended):** build a deploy folder and run Pages locally.
  ```bash
  bash tools/build-deploy.sh /tmp/oao-local
  cd /tmp/oao-local
  cat > .dev.vars <<'VARS'      # local only. NEVER commit (.gitignore covers it)
  SITE_PASSWORD=localtest
  MEMBER_PASSCODE=local-pass
  MEMBER_TOKEN=local-token
  VARS
  npx wrangler@4 pages dev . --port 8788
  # open http://localhost:8788 and log in with "localtest"; GET /api/health → mode "missing-env"
  ```
  Add `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `BITABLE_APP_TOKEN`, `TABLE_*` and `LLM_API_KEY` to `.dev.vars` to talk to the real Feishu Base. Be careful: that writes **live data**.
- **UI only (no backend):** set `demo: true` in `config.js`, then run `python3 -m http.server 8000` in `source/`. This gives built-in sample data and a 演示模式 badge. **Never deploy with `demo: true`**: `demo` takes priority over `proxyUrl`, and the site would show fake data without any error.
- **SCF-style Node server:** export the env vars, then run `cd cloud-function && node dev-server.js`, which serves `:9000`. In `config.js`, set `proxyUrl: "http://localhost:9000"`.

### 9.4 Deploy to Cloudflare Pages
```bash
# from source/
node cloud-function/test.js && node frontend.test.js && node integration.test.js && node design.test.js
bash tools/build-deploy.sh ../oao-deploy
cd ../oao-deploy && rm -rf .wrangler
npx wrangler@4 pages deploy . --project-name oao-photography --branch main --commit-dirty=true
```
- Deploying to `--branch main` updates production, `https://oao-photography.pages.dev`. Every deploy also gets a unique preview URL (`https://<hash>.oao-photography.pages.dev`). The site cookie is per host, so you log in separately there.
- **Set or rotate a secret without echoing it:**
  ```bash
  printf '%s' "$VALUE" | npx wrangler@4 pages secret put NAME --project-name oao-photography
  ```
  Redeploy afterwards.
- `wrangler login` (browser OAuth) is required once per machine.
- **Never deploy `source/` directly.** It contains tests, docs and `lib/`. Always build with `tools/build-deploy.sh`, which leaves out `assets/media`.

### 9.5 Scripting quirk
Cloudflare blocks Python's default `urllib` User-Agent on this site. The response is **HTTP 403 "error code: 1010"**. Send a browser-like header such as `User-Agent: Mozilla/5.0 ...`. curl and real browsers are fine.

---

## 10. Migration playbooks

### (a) Move to a new Cloudflare account
1. Run `npx wrangler@4 login` with the new account.
2. Create the project:
   ```bash
   npx wrangler@4 pages project create oao-photography --production-branch main
   ```
   `*.pages.dev` names are global. If `oao-photography` is still taken (the old project still exists), either delete the old project first or use a new name. A new name changes the URL, so update `ALLOWED_ORIGIN` and use the new `--project-name` everywhere.
3. Put **all** secrets from §6 into the new project. Get the real secrets from the owner, or regenerate them.
4. Build and deploy (§9.4), then run the checks in §14.
5. **Custom domain (optional):** Pages → project → Custom domains. Then set `ALLOWED_ORIGIN` to it. The `__Host-` cookie works on any HTTPS host.
6. Delete the old project when you're done. Nothing on the Cloudflare side holds data; all data is in Feishu.

### (b) New Feishu app and/or new Base
1. **App:**
   - At open.feishu.cn (Lark international: open.larksuite.com, and also set `FEISHU_BASE_URL` for the tools; the backend hard-codes `https://open.feishu.cn/open-apis` in `cloud-function/index.js`), choose 创建企业自建应用 and name it e.g. `OAO 摄影社资料库`.
   - Copy the App ID and App Secret from 凭证与基础信息.
2. **Scopes** (权限管理). Enable:
   - `bitable:app`: view, comment, edit and manage Bases
   - `drive:drive`: upload and download attachments
   - `wiki:node:read`: **only if the Base lives inside a wiki page.** Without it you get Feishu error **99991672**, which names the required scopes (wiki:wiki, wiki:wiki:readonly or wiki:node:read).
3. **Publish a version:** 版本管理与发布 → 创建版本 → 申请发布, and have the tenant admin approve it. **Scopes only take effect after publishing.** Each scope change needs a new version.
4. **Base:**
   - Create a Base (多维表格 / "Base" in the 新建 menu), or reuse the current one.
   - Give the app edit access to it: open the Base, or its wiki page, then use the "…" menu to add the app as a collaborator ("add document app"/添加文档应用). If you skip this, Bitable calls fail with permission errors even when the scopes are correct.
   - **Get the token:** from a `/base/<app_token>` URL, the token is the app_token. From a `/wiki/<node_token>` URL, use the node token. The tool resolves it via `GET /wiki/v2/spaces/get_node`, and the Base's app_token is the returned `obj_token`.
5. **Create the tables** (idempotent; a fresh Base's empty default table is reused as 活动记录):
   ```bash
   cd source/tools/feishu
   export FEISHU_APP_ID=cli_xxx FEISHU_APP_SECRET='...'   # don't put these in files
   export BITABLE_APP_TOKEN=xxxx        # or: export WIKI_NODE_TOKEN=xxxx
   python3 setup_tables.py              # creates/repairs, then runs verify.py
   ```
   This prints `BITABLE_APP_TOKEN`, `BITABLE_UPLOAD_PARENT_NODE` and the `TABLE_*` values, and writes `feishu-tables.json`.
6. Put the new `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `BITABLE_APP_TOKEN`, `BITABLE_UPLOAD_PARENT_NODE` and `TABLE_*` values into Pages secrets, redeploy, and run the checks in §14.
7. **Moving data:** export or copy records in Feishu itself (e.g. copy the Base). Copied Bases get **new table ids**, so re-run `verify.py`. Attachments must be re-uploaded if they move between tenants.
8. **Schema changes:** if you rename a column, change it in all three places: `app.js` `var F`, `cloud-function/index.js` `const F`, and `tools/feishu/schema.py`. Update SETUP.md too, then run `node integration.test.js`.

### (c) New DeepSeek key
1. At platform.deepseek.com → API keys, create a key and make sure the account has a balance. A 402 error means insufficient balance.
2. Set and deploy it:
   ```bash
   printf '%s' "$NEW_KEY" | npx wrangler@4 pages secret put LLM_API_KEY --project-name oao-photography
   ```
   Then redeploy.
3. Test one small grouping (§14) and revoke the old key.
4. To use another OpenAI-compatible provider, set `LLM_API_URL` and `LLM_MODEL` too. `callModel()` sends `response_format: {type: "json_object"}`, `temperature: 0.3`, `max_tokens: 2000`, a 45 s timeout and no retries.

### (d) Optional: Tencent Cloud SCF instead of Cloudflare Functions
Use this only if needed. It requires Tencent real-name verification, which the owner could not complete, and that is why v2 uses Cloudflare. **This path is untested in v2.**
1. In the SCF console, create a function from scratch:
   - runtime Node.js 18 or newer
   - upload `cloud-function/index.js` and `package.json`
   - handler `index.main_handler`
   - **execution timeout 60 s**
2. Set the same env vars as §6, except `SITE_PASSWORD`, which isn't used there.
3. Create a **函数URL (Function URL)** with no auth. The **API Gateway trigger was taken offline on 2025-06-30**, so don't use it. `parseRequest()` accepts both `event.path`/`httpMethod` and `rawPath`/`requestContext.http`. Verify against a real Function URL event.
4. In `config.js`, set `proxyUrl: "https://<function-url>"` (no trailing slash), keep `demo: false`, and set `ALLOWED_ORIGIN` to the site origin, since this is cross-origin.
5. ⚠️ The Function URL is **public** and is not covered by the site password. The read APIs and `/api/request` become open to the internet. Consider adding a shared secret check.
6. SCF has been pay-as-you-go since 2024-04, and new users get a trial. Request body limits are smaller than Cloudflare's, so keep photos to about 4 MB.

---

## 11. GitHub backup (private repo)

- **Repo:** `https://github.com/Marcsun666/OAO_Photography_System`, which is **private**. Branch `main`; the v2 snapshot is tag **`v2`**.
- **Contents:** identical to the zip: `README.md`, this handover file, `feishu-tables.json`, `deploy/` and `source/`. It has no secrets, no `assets/media`, no `assets-originals`, no `node_modules` and no `.wrangler`. `.gitignore` covers `.wrangler`, `node_modules`, `.dev.vars`, `*.env` and `assets-originals`.
- **Deploys don't come from GitHub.** The Pages project is a "direct upload" project and is **not** connected to Git. Pushing to GitHub does **not** deploy anything. Deploy with wrangler from local files (§9.4).
- If you later connect Pages to Git:
  - Pages can't switch an existing direct-upload project to Git, so you'd create a new Git-connected project.
  - Set the build output directory to the built deploy folder, or commit `deploy/`.
  - Re-add all the secrets.
- Keep the repo private: it documents the Base ids and the backend.

---

## 12. Known limitations and TODOs

1. **Bilibili / 小红书 links are waiting on the owner.** Placeholders with `href="#"` are in `index.html`:
   - line 133: `B站账号链接占位` (the `#bilibili-link` card)
   - line 272: `B站主页占位`
   - lines 482–483: footer B站 / 小红书
   - line 275: the empty-state text

   Individual videos can be added without code changes through ＋ 上传 / 贴链接 (the 外链 table, 平台=B站).
2. **No photo resize before upload.** Originals are uploaded as base64 (up to 20 MB) and the gallery loads the **full-size originals**, so big phone photos make it slow. TODO: shrink images in the browser (canvas, ~2000 px, WebP/JPEG ~0.8) before `readAsBase64` in `app.js`.
3. **Favicon:** `assets/brand/OAO.png` is a white logo and nearly invisible on light browser tabs. TODO: add a dark or filled favicon.
4. **Change the site password:** it was typed in a chat during setup. Change it before sharing widely (§6). This logs everyone out.
5. **Feishu speed and rate limits:**
   - Each Feishu-backed request takes about 3–7 s (Cloudflare edge → open.feishu.cn), and uploads take 8–10 s.
   - The gallery makes one `batch_get_tmp_download_url` call per new image. Per-isolate and browser caching soften this, but a large gallery could hit Feishu rate limits.
   - TODO: batch the tokens in one call, or cache in KV.
6. **Only the first 100 rows** of each table are read; there's no pagination (`listRecords`).
7. **`MEMBER_TOKEN` is static and never expires.** It is one shared passcode for all members, which is an MVP choice. `/api/request` is open to anyone with the site password and has no rate limit.
8. **The 招新 form (`#join`) is UI-only** and doesn't save anything.
9. **The 封面 cover can only be set in Feishu.**
10. **The Base title is "Untitled bitable".** Rename it in Feishu if wanted (the wiki page title is separate).
11. **Cloudflare Free limits:**
    - 100 MB request body
    - about 10 ms CPU per request (time spent waiting on the network doesn't count; an 8 MB upload worked)
    - 50 subrequests per request (AI grouping uses about 3 + one per group; groups are capped at 20)
    - 100k Functions requests per day, which includes static requests that pass through the middleware
12. **`assets/media` is deliberately not deployed** (student privacy) and is not in this package. `assets-originals` exists only on the original machine and with the owner.
13. **Leftovers:** `lib/`, the Next.js config, and `package.json`/`package-lock.json` are unused. They can be deleted after confirming with the owner.
14. **Test uploads:** a few test images (≤8 MB) remain as orphaned files in Feishu Drive storage. They're harmless, and the API can't delete them.

---

## 13. Version history

- **v1: static site plus demo mode**, until 2026-10-08.
  - Vanilla HTML/CSS/JS site with `config.js` `demo: true`, so it showed sample data.
  - Deployed to Cloudflare Pages behind the password lock (`functions/_middleware.js`).
  - Images compressed to WebP, system PingFang font stack, lazy loading, branded login page, stylesheet cleanup.
  - The backend existed only as a Tencent SCF design (`cloud-function/index.js`) and was never deployed.
- **v2: live backend**, 2026-10-08.
  - Created the Feishu Base tables (§7) via API.
  - Backend ported to Cloudflare Pages Functions (`functions/api/[[path]].js` + the shared `cloud-function/index.js`); Tencent real-name verification wasn't possible.
  - Fixed the attachment download bug.
  - DeepSeek AI 分组 is live and saves to 分组.
  - `config.js` now has `demo: false` and same-origin `proxyUrl`.
  - Middleware returns JSON 401 for `/api` and blocks `/cloud-function/*`.
  - Added `tools/feishu/*` and `tools/build-deploy.sh`; SETUP.md has the 2A/2B sections.
  - Verified end to end: every route, uploads of 676 B, 3.3 MB and 8 MB with byte-identical download, one real DeepSeek call, and headless Chrome showing live data with no demo badge.
- **v3: style and flow refinement**, 2026-10-08. **Preview only** until the owner approves it. See §16.

---

## 14. How to verify everything works

```bash
S=https://oao-photography.pages.dev
curl -s -w ' [%{http_code}]\n' $S/api/health        # expect {"ok":false,"code":"SITE_LOCKED",...} [401]
read -rs SITE_PW                                      # type the site password (not echoed)
curl -s -o /dev/null -w 'login %{http_code}\n' -c cj.txt --data-urlencode "password=$SITE_PW" --data-urlencode "next=/" $S/__login   # expect 303
curl -s -b cj.txt $S/api/health                       # expect "mode":"connected"
curl -s -o /dev/null -w '%{http_code}\n' -b cj.txt $S/cloud-function/index.js   # expect 404
curl -s -b cj.txt $S/api/activities | head -c 300     # expect {"ok":true,"items":[...]}
read -rs MEMBER_PC                                    # type the member passcode
curl -s -b cj.txt -H 'Content-Type: application/json' -d "{\"passcode\":\"$MEMBER_PC\"}" $S/api/auth \
  | python3 -c 'import json,sys; print("member login ok:", json.load(sys.stdin).get("ok"))'
rm cj.txt
```

**In a browser:**
1. Log in. There should be **no** 演示模式 badge, and the timeline, library and Bilibili area should load from Feishu.
2. Click 成员登录 and enter the passcode. The button should read 退出 · 已登录 and ＋ 上传 / 贴链接 should appear.
3. Upload a small photo and check that it shows in 照片合集.
4. In 成员资料与技能, run AI 分组 with 2 groups (it needs at least 2 members registered).
5. Delete test rows in Feishu afterwards.

Also: in `cd source/tools/feishu`, run `python3 verify.py`. It should end with `schema OK`.

---

## 15. What is NOT in this package (ask the owner)

- **Secrets:** `SITE_PASSWORD`, `MEMBER_PASSCODE` (the owner knows both), `FEISHU_APP_SECRET`, the DeepSeek key, and `MEMBER_TOKEN` (regenerate it).
- **Account access:** Cloudflare, the Feishu developer console and admin approval, the Feishu Base, DeepSeek billing, GitHub.
- **Live data:** every activity, photo, link and member record is in Feishu only.
- **Large and private images:** `assets/media/` and `assets-originals/`.

---

## 16. v3: style refinement (preview), promote and rollback

**Status:** v3 is deployed to the Cloudflare Pages **preview** branch `v3`. Production (`main`) is still v2, deployment `7fdceb9d-4d26-4711-bc9b-cc9b993579c7`.

- Preview URL: <https://v3.oao-photography.pages.dev>. It uses the same site password as production.
- Git: branch `v3` in `Marcsun666/OAO_Photography_System`. `main`, tag `v2` and branch `v2` are unchanged.
- Backend, API routes, Feishu schema and `config.js` are **unchanged**. v3 only touches `index.html`, `styles.css`, `app.js`, `script.js` and the login page HTML/CSS inside `functions/_middleware.js`. The login logic is unchanged.

### 16.1 Preview environment secrets

The Pages **preview** environment has its own copy of all 14 secrets (same names as §6). Set them with:

```bash
cd /tmp/cfwork   # any folder; it only needs a package.json
printf %s "$VALUE" | wrangler pages secret put NAME --project-name oao-photography --env preview
```

The values match production with two exceptions:

- `MEMBER_TOKEN` is a **different** random value. Member sessions from the preview do not work on production, and production sessions do not work on the preview.
- `ALLOWED_ORIGIN=https://v3.oao-photography.pages.dev`

`MEMBER_PASSCODE` and `SITE_PASSWORD` are the same as production. The preview reads and writes the **same Feishu Base** as production, so anything you submit on the preview is real data.

### 16.2 What changed in v3

Design (the v2 "Apple + Liquid Glass" look, refined rather than replaced):

- **One set of shadow and motion tokens** (`--v3-shadow-1/2/3`, `--v3-ease`). Cards use a white surface, a hairline edge and a layered soft shadow. Cards lift on hover only for mouse or trackpad users, and buttons and tiles scale down slightly when pressed.
- **Hero.**
  - Added a frosted eyebrow pill ("OAO 摄影社 · 照片组 / 视频组").
  - Added a primary button 申请拍摄 and a glass secondary button 看照片合集.
  - The stats band is now a floating glass card that overlaps the bottom edge of the hero, with tabular numbers and dividers between items.
- **Glossy primary pill.** The primary button has a subtle top-to-bottom graphite gradient plus an inner highlight. Glass elements fall back to solid surfaces when `backdrop-filter` is unsupported or reduced transparency is requested.
- **Typography.** One heading and lede scale, using `clamp()`. The PingFang stack is kept and no web fonts are loaded.
- **Activity cards without a cover** get a soft blue and orange gradient instead of a flat grey block. A single activity is centred at a 640px maximum width instead of filling half the grid.
- **Scroll reveal.** Removed the v2 `sec-leave` effect, which faded sections to 50% opacity as they scrolled away and hurt readability. The enter animation now runs on each section's children, so section backgrounds never leave white gaps.
- **Loading.** While Feishu responds (3–7 s), skeleton shimmer placeholders replace the static sample content. A failed load shows an error card with a 重试 button.
- **Mobile (≤ 820px).**
  - A floating glass bottom tab bar: 活动 · 作品 · **申请拍摄** (emphasised) · B站 · 成员. It respects the safe-area inset.
  - Modals open as bottom sheets with a grab handle.
  - The 上传 button uses a short label on small screens.
  - The back-to-top button and toasts sit above the tab bar.
- **Login page.** Same visual language: an aurora gradient background and a glass card with a graphite pill button. There are no external resources.
- **Accessibility.**
  - A v3 block at the very end of `styles.css` handles `prefers-reduced-transparency`, `prefers-reduced-motion` and `prefers-contrast: more`.
  - The v2 accessibility block is still in place.
  - All glass elements have solid fallbacks.

Flow:

- **Sections reordered** into the student path first: 活动 → 作品 → B站 → 申请拍摄 → 关于/加入. Member tools follow, grouped behind a new **成员工作区** section that looks like a raised sheet on grey: 成员工作区 → 记录方式 → 工作台 → 资料库 → 名册/AI 分组. The nav and footer follow the same order.
- **成员工作区 quick actions:** 上传照片 · 贴网盘链接 · 贴 B站/小红书 · 名册·AI 分组.
  - When a logged-out user taps a tile, the login modal opens.
  - After a successful login, the original action continues automatically (a pending action).
- **Upload modal has a third mode, "B站 / 小红书".** It posts to the existing `/api/links` route, so Bilibili and Xiaohongshu links can be added without opening Feishu. The activity field is hidden in this mode.
- **Request form has a new required field 联系人与联系方式.** It is appended to the description as `联系人：…`, so no Feishu schema change was needed. The copy and success message are clearer.
- **Join form copy is honest.** The join form is still UI-only (nothing is saved), and the copy now says so.
- **Better empty states** that point to the next action.

### 16.2b v3 r2 refinement (2026-10-09, after the owner's first review)

The owner's feedback: "epic transitions, smooth transitions, smoother corners, the page you first see when you log in, should be better designed, instead of a bottom fade picture, no significant color breaks should be seen, follow apple aesthetics."

**1. Transitions**

- **Reveal on scroll.** Each section's content fades up as you scroll to it, using Apple's long easing `cubic-bezier(0.22,1,0.36,1)` over 0.9 to 1.1 s. Headings go from blurred to sharp, and items in grids appear one after another.
  - Driven by `IntersectionObserver` in `script.js` (`setupMotion`), plus a debounced sweep when scrolling stops so nothing stays hidden after a fast jump.
  - It no longer uses CSS `animation-timeline`, which Chrome supports but Safari/iOS does not.
  - Only `opacity`, `translate` and `transform` are animated.
- **Hero scroll effect.** A scroll handler throttled with `requestAnimationFrame` writes `--hp` (0→1) to the hero. As you scroll:
  - the photo card grows from 0.94 to 1,
  - the photo inside drifts upward slightly,
  - the headline fades and rises.
- **Login to site.** On submit, the login card recedes (it shrinks and blurs) before the form actually posts. The site's first screen then fades in on the same background: eyebrow, headline, buttons, photo card, stats card.
- **Pop-ups.** They now animate both opening and closing. They stay rendered and switch between hidden and visible instead of `display:none`. On mobile they slide up as bottom sheets.
- **Buttons** spring back with a slight overshoot when released.
- **Navigation glass** changes over 600 ms as you scroll.
- **Progressive enhancement.**
  - An inline `<head>` script adds `html.motion` only when reduced motion is not requested.
  - Elements are hidden only after JS has added `.rv` to them, so the content still shows if JS fails.

**2. Corners**

- One set of radii: cards 28px, media and modals 32px, mobile sheets 32px at the top, pill-shaped buttons.
- Images are clipped to the card's corners.
- Where `corner-shape: squircle` is supported, cards and media use continuous (Apple-style) corners with larger radii. Elsewhere they fall back to normal rounded corners.

**3. First screen**

- The hero is a clean light background with an eyebrow, the headline and the 申请拍摄 / 看照片合集 buttons.
- Below that, the group photo sits in a large rounded card inset from the edges with a soft shadow (`figure.hero-media`). It replaces the old background photo that faded to white.
- The stats card floats on the bottom edge of the photo as real glass.
- The login page uses the same background and glow, so logging in feels like one continuous scene.

**4. No colour breaks**

- **One background for the whole page:** a long `#fbfbfd → #f5f5f7` gradient with two very faint glows (green and blue) at the top. Every section, the member area and the footer are transparent on top of it.
  - Removed: the member area's raised "sheet" edge, the footer's top border, and the hero's background photo along with the line where it ended.
- **Photo sections** (作品, 申请拍摄, 加入) only show their photo in the middle of the section; the top and bottom fade back to the page colour.
- **SVG refraction on the glass is now off by default.**
  - Why: it sampled outside the element and drew a blue or dark line along the bottom of the nav bar and the back-to-top button.
  - Now: those elements use frosted glass with the specular rim, like Apple's own site.
  - To turn refraction back on, add `data-refraction="on"` to `<html>`.

**Tested on:**

- headless Chrome at 1280 and 390,
- Playwright WebKit (iPhone 14 emulation, and 1280 desktop): login, reveal (25/25 elements), hero scroll effect, member login, no page errors.

Screenshots are in `/workspace/v3-shots/r2/`.

### 16.3 Promote v3 to production (only after the owner approves)

Production secrets are already set, so no secret changes are needed.

```bash
export PATH=/home/box/.local/bin:/home/box/.local/node-v22.11.0-linux-x64/bin:$PATH WRANGLER_CACHE_DIR=/tmp/wcache
cd /workspace/oao-deploy-v3        # or: bash tools/build-deploy.sh <dir> from the v3 branch's source/
rm -rf .wrangler && wrangler pages deploy . --project-name oao-photography --branch main --commit-dirty=true
```

Then, optionally, merge or fast-forward git `main` to `v3`.

### 16.4 Roll back to v2

Use either option.

- **Fastest (dashboard).** Go to Cloudflare → Workers & Pages → `oao-photography` → Deployments, find deployment `7fdceb9d-4d26-4711-bc9b-cc9b993579c7`, then choose ⋯ → **Rollback to this deployment**.
- **CLI.** Redeploy the v2 build:

  ```bash
  export PATH=/home/box/.local/bin:/home/box/.local/node-v22.11.0-linux-x64/bin:$PATH WRANGLER_CACHE_DIR=/tmp/wcache
  cd /workspace/v2-backup/oao-deploy  # or the deploy/ folder from git tag v2
  rm -rf .wrangler && wrangler pages deploy . --project-name oao-photography --branch main --commit-dirty=true
  ```

v2 and v3 use the same API, secrets and Feishu data, so rolling back in either direction loses no data. To discard the preview completely, delete the `v3` preview deployments in the dashboard. You can also leave them, since they are behind the same password.

### 16.5 Known v3 notes

- The preview shares production's Feishu data, so test submissions are real and must be deleted by hand.
- Bottom sheets and the tab bar were tested in headless Chrome at 390px and 1280px. Check them on a real iPhone (Safari) before promoting.
- As of r2, the scroll reveal runs on `IntersectionObserver` and works in Safari/iOS, which the WebKit test confirmed. The v3 note in §16.2 about `animation-timeline` is superseded.
- SVG refraction is off by default as of r2 (see §16.2b).

