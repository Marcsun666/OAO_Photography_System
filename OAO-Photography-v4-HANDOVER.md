# OAO Photography Club (OAO 摄影社) website: v4 handover

> **v4.1 (polish) LIVE in production (2026-10-09):** CAS 时间 on tasks, 邀请拍摄 kept off the public site, delivery opens on 已结束, admin-only AI 分组 and a UI consistency pass. Cloudflare deployment **`7d104a88-1116-4c69-a858-375ded02409d`**, git `main` / tag `v4.1` (moved to the polish commit). **Rollback:** the pre-polish v4.1 deployment `caccbb28-9462-42eb-8339-7f0e1f58dee5` (git tag `v4.1-backup`, files in `/workspace/backups/v4.1-2026-10-09/deploy`), see §18.7. Older rollback: v4 deployment `522b752c-166e-4583-a01b-c6d5455c3f8e` (§18.1). The v4.1 preview stays at <https://v41.oao-photography.pages.dev>. See **§18**. The v4 notes below describe the base that v4.1 extends.
> **Version:** v4 (calendar + 报名/交付 workflow, hidden admin dashboard, more AI under a hard ≤ ¥20/month cap, automatic dark mode, fully transparent glass). **Status (2026-10-09):** v4 went live as Cloudflare deployment `522b752c` (git tag `v4`) and was superseded the same day by **v4.1** (deployment `caccbb28`, git `main` / tag `v4.1`). The v4 preview remains at <https://v4.oao-photography.pages.dev> (Pages branch `v4`). **Rollback:** v3 deployment `0d0d5be2` (git tag `v3`); see §17.8. See **§17** for everything v4: new tables, secrets, admin flow, AI budget, promote and rollback.
> **Live URL (v4 since 2026-10-09):** <https://oao-photography.pages.dev>. The whole site is password-locked; ask the owner for the password.
> **Source:** the GitHub repo `Marcsun666/OAO_Photography_System` (public): `main` and tag `v4.1` = live (v4.1 polish); tag `v4.1-backup` = v4.1 before the polish; tag `v4` = v4 (rollback target `522b752c`); tag `v3` = previous production (rollback); tag/branch `v2` = older (see §11).
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
| AI model | DeepSeek `deepseek-chat` (served by DeepSeek V4.1-Flash, non-thinking). v3: AI 分组 only. v4: AI 分组 + 4 new button-only features, all behind a hard monthly budget guard (§17.5) |
| Data at snapshot | The tables were emptied after testing. The owner has since added 1 real record in 成员. All live data lives **only in Feishu**, not in this package. |

---

## 2. What the site is and its features

It is a Chinese-language site for a high-school photography club. It works both as an internal tool (logging activities, storing photos and cloud-drive links, the member roster, AI grouping) and as a showcase (photo gallery, Bilibili area, recruiting). Pages are vanilla HTML/CSS/JS with no build step.

Sections of `index.html`, top to bottom:

| Section (id) | Heading | What it does |
|---|---|---|
| hero, stat-band | – | Hero image. The stats show activity count, 照片数 total and 视频数 total, summed live from 活动记录 |
| `#record` | 选择记录方式 | Cards for 照片组 / 视频组 and the club account card (v2: Bilibili placeholder; v3: real 小红书 link) |
| `#workspace` | 照片 / 视频工作台 | Status counts per group (照片组: 待选片/精修中/待交付/已归档; 视频组: 待剪辑/调色中/待发布/已发布) |
| `#request` | 申请 OAO 拍摄活动 | **Shooting-request form.** It posts to `/api/request` and creates a 活动记录 row with 状态=待选片 |
| `#timeline` | 活动记录时间线 | Activity timeline from 活动记录, with the 封面 cover image |
| `#library` | 活动素材库 | Material library from 照片素材: cloud-drive links with 提取码, and uploaded files |
| `#bilibili` (v3: `#rednote`) | B 站视频作品区 (v3: 小红书 · 作品与动态) | v2: links from 外链 where 平台 = B站. v3: all 外链 items, plus the club's 小红书 profile card (§16.2c) |
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
OAO-Photography-v3-HANDOVER.md   this file (copy also at source/HANDOVER-v3.md)
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
├─ HANDOVER.md         (Chinese) long v1 history and design notes; points to HANDOVER-v3.md
├─ HANDOVER-v3.md      copy of this file
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
| `TABLE_EVENTS` | **v4** 拍摄任务 table id | `tbliKFLeS4KfLGKO` |
| `TABLE_APPLICATIONS` | **v4** 报名与交付 table id | `tblzwdHHFJNRm1eA` |
| `TABLE_AI_USAGE` | **v4** AI用量 table id. **Required for any AI call in v4** (incl. AI 分组): no table → no spend tracking → AI refused | `tblhaJ6i2hU8bWo1` |
| `ADMIN_PASSCODE` | **v4** admin code typed into the normal 成员登录 box | `<ask owner>` (format: `oao-admin-` followed by 6 digits; the value is never written in this doc or the repo) |
| `ADMIN_TOKEN` | **v4** bearer token returned for the admin code; the only thing that unlocks `/api/admin/*` | `<regenerate>` (random; must differ from `MEMBER_TOKEN`) |
| `AI_MONTHLY_CAP_CNY`, `AI_STOP_AT_CNY` | **v4** optional budget overrides | not set; defaults 20 and 18 (stop line = min(cap, AI_STOP_AT_CNY or 0.9×cap)) |

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

1. **Club social link: production (v2) still has the old placeholders.** v2 production still has `href="#"` placeholders for Bilibili / 小红书 (the `#bilibili-link` card, the `#bilibili` section button and the footer). **v3 r3 resolves this:**
   - The club account is now 小红书: `https://www.xiaohongshu.com/user/profile/67241375000000001d02e0f8`.
   - Share-tracking parameters were removed, and every link opens in a new tab with `rel="noopener"`.
   - The links are marked `data-rednote` in `index.html` and set as `REDNOTE_URL` in `app.js`.

   Individual works (小红书 or B站) can still be added without code changes through ＋ 上传 / 贴链接 → B站 / 小红书 (the 外链 table).
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
- **v3: style and flow refinement**, 2026-10-08 to 2026-10-09. Three review rounds on a preview, then approved by the owner and **promoted to production on 2026-10-09** (deployment `0d0d5be2`; git `main` fast-forwarded to `v3`, tag `v3`). See §16.
- **v4: calendar + 报名/交付, hidden admin dashboard, AI budget**, 2026-10-09 (deployment `522b752c`, tag `v4`). See §17.
- **v4.1: CAS 时间 + 邀请拍摄 copy**, 2026-10-09 (deployment `caccbb28`, tag `v4.1-backup`). See §18.1–18.6.
- **v4.1 polish**, 2026-10-09 (deployment `7d104a88`, tag `v4.1`). See §18.7 and `CHANGELOG.md`.

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
2. Click 成员登录 and enter the passcode. The button should read 「退出登录」 and ＋ 上传 / 贴链接 should appear.
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

## 16. v3: style refinement (LIVE), history and rollback

**Status:** v3 is **live in production** (`main`, deployment `0d0d5be2`, promoted 2026-10-09 after the owner approved round 3). The previous production deployment, v2, is `7fdceb9d-4d26-4711-bc9b-cc9b993579c7`, kept for rollback (§16.4).

- The old preview URL <https://v3.oao-photography.pages.dev> still exists behind the same password but is no longer needed. Use the production URL.
- Git: `main` and tag `v3` in `Marcsun666/OAO_Photography_System` are the live code. Tag `v2` and branch `v2` keep the previous version.
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

### 16.2c v3 r3 refinement (2026-10-09, owner's second review)

The owner asked for:

- the club's 小红书 (Rednote) link instead of Bilibili,
- truly transparent liquid glass,
- example pictures in 活动素材库,
- no animation changes beyond small optimisations.

**1. 小红书 replaces Bilibili as the club link**

- **Link:** `https://www.xiaohongshu.com/user/profile/67241375000000001d02e0f8`. The `xsec_token`, `share_id`, `appuid` and other share parameters were dropped. Every instance has `target="_blank" rel="noopener"`.
- **Labels:** nav, footer nav and the mobile tab bar now say 小红书 → `#rednote`. The tab bar uses a simple inline "note" glyph rather than a logo file.
- **Section:** `#bilibili` "B 站视频作品区" is now `#rednote` "小红书 · 作品与动态", with a 在小红书关注 OAO button.
  - It now lists **every** 外链 item (小红书, B站 and 其他), with a platform-tinted cover mark.
  - When there are none, it shows a profile card that links to the account.
  - The grid id is still `#video-grid`, so the tests and contract are unchanged.
- **Other places:**
  - The `#record` platform card is now "OAO 摄影社 · 小红书" (`#rednote-link`).
  - The footer social link is the real profile; the B站 placeholder was removed.
  - The 视频组 card copy was updated.
- **Unchanged:** the member "贴 B站 / 小红书" upload mode and the 外链 平台 options (B站 / 小红书 / 其他), because members may still post Bilibili videos.

**2. Clear liquid glass**

- **Which surfaces:** nav, mobile tab bar, `.button.glass`, back-to-top, the stats card, modal close buttons, and photo badges.
- **Recipe:**
  - fill: about 5% white, plus a diagonal specular sheen gradient (`--g-fill`),
  - `backdrop-filter: blur(3px) saturate(180%) brightness(1.06)`,
  - shape from a crisp top highlight, side rims, an inner light rim, a hairline and a soft shadow (`--g-rim`).
- **SVG refraction stays off.** Its edge artifact is not fixed; the lens feel comes from the layered highlights instead.
- **Readability:**
  - Two IntersectionObservers watch narrow top and bottom strips of the screen. When a dark photo (hero photo, covered activity tiles, gallery shots, library samples, or `[data-tone="dark"]`) is under the nav or tab bar, those get `.on-dark`: white text with a shadow. Otherwise the text is dark with a white halo.
  - The mobile hamburger dropdown stays frosted and near-opaque, because it is a reading panel.
- **Stats card:** now sits entirely inside the bottom of the hero photo (desktop 104px tall; mobile a single 4-column row 70px tall), so the glass is always over the photo and white text is readable. This also stops the mobile tab bar from covering it on first load.
- **Fallbacks:** `prefers-reduced-transparency` turns all of these solid (light surfaces, or dark for the stats card and photo badges), and `prefers-contrast: more` darkens the stats card.
- **Left as they were:** modal sheets, toasts and the request/join forms keep their solid or frosted surfaces, because they are large reading surfaces.

**3. Example photos in 活动素材库**

- When the 照片素材 table has no records, `renderLibrary()` shows `librarySamples()`: 8 photos from `assets/events/*.webp`.
  - They are lazy-loaded and have a glass 示例 tag and caption.
  - A note above them says they are examples.
  - `assets/media` is never used.
- They are frontend-only, with nothing written to Feishu, and they disappear automatically as soon as a real photo record exists.
- The lightbox now pages within the group you clicked: 照片合集 or the library samples (1 / 8 …).

**4. Performance only (animation timing unchanged)**

- **Scroll handlers:**
  - Scrollspy is rAF-throttled and only writes to the DOM when the active item changes.
  - The scroll progress bar uses `transform: scaleX()` instead of `width`, so it never triggers layout.
- **will-change:** the hero photo's `will-change` is released once the hero scroll effect finishes (`.hp-idle`).
- **Glass cost:** the blur on glass dropped from 14–24px to 3px, which is much cheaper to composite on mobile.

**5. Fixes**

- **Desktop hero gap:** `.hero` had an inherited 48px flex `gap`. It is removed, and the photo margin is now `clamp(28px, 3.2vw, 40px)`. The gap went from about 125px to about 80px.
- **1px seam:** the bottom of the photo sections (作品 / 申请拍摄 / 加入) had a 1px seam caused by fractional section heights.
  - Fix: the gradient layer is now 2px taller than the section and holds solid page colour for the first and last 3%.
  - Check: a pixel-column seam scan of the whole page found no seams at 1280 or 390.

**Tested on:**

- the 4 test files,
- read-only API checks,
- Chrome and Playwright WebKit (iPhone 14 emulation and 1280): no page errors, all 8 samples render, the lightbox works, the nav gets `.on-dark` over the photo, and the 小红书 button opens the profile in a new tab.

Screenshots are in `/workspace/v3-shots/r3/`.

### 16.3 Redeploy v3 to production (done on 2026-10-09; use this to redeploy)

Production secrets are already set, so no secret changes are needed.

```bash
export PATH=/home/box/.local/bin:/home/box/.local/node-v22.11.0-linux-x64/bin:$PATH WRANGLER_CACHE_DIR=/tmp/wcache
cd /workspace/oao-deploy-v3        # or: bash tools/build-deploy.sh <dir> from the v3 branch's source/
rm -rf .wrangler && wrangler pages deploy . --project-name oao-photography --branch main --commit-dirty=true
```

Git `main` was fast-forwarded to `v3` and tagged `v3` on 2026-10-09.

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
- Bottom sheets and the tab bar were tested in headless Chrome and WebKit (iPhone 14 emulation) at 390px and 1280px. A check on a real iPhone is still worth doing.
- As of r2, the scroll reveal runs on `IntersectionObserver` and works in Safari/iOS, which the WebKit test confirmed. The v3 note in §16.2 about `animation-timeline` is superseded.
- SVG refraction is off by default as of r2 (see §16.2b).


---

## 17. v4 (was production 2026-10-09, deployment `522b752c`, now the v4.1 rollback target; preview at https://v4.oao-photography.pages.dev)

### 17.1 What the owner asked for and what was built

| Request | Implementation |
|---|---|
| Automatic dark version that follows the system | `@media (prefers-color-scheme: dark)` layer in `styles.css` (Apple palette #000 / #1c1c1e / #2c2c2e). Switches live when the OS changes, no reload and no toggle. Covers glass nav/tab bar, cards, modals, forms, calendar, dashboard, skeletons, photo-section scrims, toasts. Two `theme-color` metas (#f5f5f7 / #000) + `color-scheme: light dark`. The login page (`functions/_middleware.js`) has its own dark block (logo inverted). |
| More AI, ≤ ¥20/month | 4 new features + existing AI 分组, all through one budget guard (§17.5). |
| Hidden admin dashboard via the student login | Type `ADMIN_PASSCODE` into the normal **成员登录** box → role `admin`, a 管理 nav link and the `#admin` section appear. No visible admin button anywhere. Enforced server-side (§17.4). |
| Events: calendar → apply → after the event upload Baidu links + description; admin sees everything | §17.3 |
| Glass: transparent, not translucent/opaque | Sheets/modals, 申请拍摄 + 加入 forms, mobile menu and toasts now use the transparent `--g-fill/--g-filter/--g-rim` glass. Readability comes from a blurred scrim behind modals/menu and a soft text halo; under *Reduce transparency* everything falls back to solid (light and dark). |
| Caption fix | 汽车社·实验 → **物理社 · 物理周** (asset renamed `physics-week-flame-test.webp`). |
| 班赛 schedule | 29 tasks seeded into 拍摄任务 by `tools/feishu/seed_events.py` (idempotent, 种子键 = `YYYY-MM-DD|名称`). 11/2–11/6 期中考试 is drawn on the calendar only (no tasks). |

### 17.2 New Feishu tables (Base `ENpjbWJVzaNUtEsGlMecJLvFnef`)

| Table | Env var | id | Fields (exact names) |
|---|---|---|---|
| 拍摄任务 | `TABLE_EVENTS` | `tbliKFLeS4KfLGKO` | 名称, 类别 (篮球/足球/匹克球/乒乓球/长绳/文化周/其他), 日期 (YYYY-MM-DD text), 时间 (`11:50-12:20` / `放学` / free text), 地点, 需要人数, 状态 (开放报名/已安排/已结束/已取消), 备注, 种子键, 来源申请, **CAS-C**, **CAS-S** (v4.1, number, format `0.0`; see §18) |
| 报名与交付 | `TABLE_APPLICATIONS` | `tblzwdHHFJNRm1eA` | 成员姓名, 学号, 任务ID, 任务名称, 状态 (已报名/已确认/已交付/已验收/已退回/已取消), 百度网盘链接, 提取码, 描述, AI文案, 报名时间, 提交时间, 管理备注 |
| AI用量 | `TABLE_AI_USAGE` | `tblhaJ6i2hU8bWo1` | 键 (`YYYY-MM|feature`), 月份, 功能, 调用次数, 输入tokens, 输出tokens, 费用元, 当日, 当日次数 |

Created by `tools/feishu/setup_tables.py` (schema in `tools/feishu/schema.py`; `integration.test.js` checks that every backend field exists there). Existing v3 tables are untouched. Times are Beijing time; `放学` = 15:30–17:30.

### 17.3 Member flow

1. **Calendar** (`#calendar`, `events.js`): month grid on desktop, agenda list on phones; colour per category (篮球 orange, 足球 green, 匹克球 purple, 乒乓球 blue, 长绳 pink-red, 文化周 neutral). Anyone with the site password can *view* it (`GET /api/events` returns titles/dates/counts only, never names or 学号).
2. **Apply**: open a task → 报名 with 姓名 + 学号 (remembered in `localStorage.oao_me`). Member token required. Idempotent per task + 学号; a cancelled application is re-activated.
3. **我的任务** (`#my-tasks`): lists the member's applications by 学号; cancel before the task starts.
4. **交付** after the task has ended: pan.baidu.com share link (validated), 4-char 提取码 (auto-filled from `?pwd=`), description, optional ✦ AI 润色成配图文案. Re-deliver is allowed until 验收.
5. Admin 确认 / 验收 / 退回 (with a note the member sees) / 取消.

### 17.4 Admin

- `POST /api/auth {passcode}`: `ADMIN_PASSCODE` → `{token: ADMIN_TOKEN, role: "admin"}`; `MEMBER_PASSCODE` → role `member`. Constant-time compares. Admins also have all member powers.
- Every `/api/admin/*` route: no/invalid token → **401**, member token → **403** (verified live on the preview).
- Dashboard (`#admin`): KPIs (tasks, applications + 待验收, requests, members, activities, photos, links); pipeline bars; **AI 用量** meter with the stop line; next 7 days; 逾期未交付 (ended > 24 h, not delivered); full process view (filters 进行中/待交付/待验收/全部/已取消, search, per-task applicants with 确认/验收/退回/取消, assign a member, edit/cancel/close task, ✦ AI 排班建议); 拍摄申请 list (✦ AI 整理 → editor, 转为任务 → editor; conversion never modifies the request record and refuses duplicates); 成员贡献 table; ✦ AI 周报.
- Admin API: `GET overview`, `POST events`, `PUT events/:id`, `POST applications` (assign), `PUT applications/:id`, `POST requests/:id/convert`, `POST ai/staffing|weekly|draft`.

### 17.5 AI features and the hard budget

Model `deepseek-chat` via `callModel`. Pricing used (official, https://api-docs.deepseek.com/zh-cn/quick_start/pricing, checked 2026-10-09, ¥ per 1M tokens): input cache-hit 0.02 (off-peak) / 0.04 (peak), cache-miss 1 / 2, output 4 / 8. **The code always charges peak prices** (`PRICE = {hit: 0.04, miss: 2, out: 8}`), so the recorded cost is an upper bound.

| Feature | Who | max_tokens | per-day limit | Measured cost per use (preview, 2026-10-09) |
|---|---|---|---|---|
| AI 分组 (existing) | member | 2000 | 20 | ~¥0.005–0.02 depending on roster size |
| ✦ AI 润色成配图文案 (delivery) | member | 200 | 60 | ¥0.0007 |
| ✦ AI 排班建议 (per task) | admin | 500 | 40 | ¥0.0009–0.0010 |
| ✦ AI 周报 | admin | 600 | 10 | ¥0.0031–0.0034 |
| ✦ AI 整理申请 (request → task draft) | admin | 300 | 30 | ¥0.0008 |

Guard (`aiCall` in `cloud-function/index.js`), applied to every call:
1. No `LLM_API_KEY` → HTTP 501; no `TABLE_AI_USAGE` → refused (cannot track spend).
2. Sum this month's 费用元 from AI用量. If `spent + worst-case cost of this call ≥ stop line` (default **¥18**, cap **¥20**) → friendly refusal "本月 AI 额度已用完（已用约 ¥…，上限 ¥20），下个月 1 号自动恢复。" (HTTP 429). Worst case = prompt length × cache-miss price + max_tokens × output price.
3. Per-feature daily limits (table above) and a 4-second per-feature cooldown → HTTP 429.
4. After the call, cost is computed from the returned `usage` (`prompt_cache_hit_tokens`, `prompt_cache_miss_tokens`, `completion_tokens`) and added to the month×feature row.
AI only runs on a button click; no 学号 or contact info is ever sent to the model. Preview and production share the AI用量 table, so the cap is **combined** across both. Total test spend on 2026-10-09: ≈ ¥0.016.

### 17.6 Secrets

Preview (`--env preview`) already has: `TABLE_EVENTS`, `TABLE_APPLICATIONS`, `TABLE_AI_USAGE`, `ADMIN_PASSCODE`, `ADMIN_TOKEN`, `ALLOWED_ORIGIN=https://v4.oao-photography.pages.dev` (plus all v3 secrets).

**Production needs these before/at promotion** (v3 ignores them, so setting them early is harmless):

```bash
cd /tmp/cfwork   # any dir without a wrangler.toml
P="--project-name oao-photography"
printf %s tbliKFLeS4KfLGKO | wrangler pages secret put TABLE_EVENTS $P
printf %s tblzwdHHFJNRm1eA | wrangler pages secret put TABLE_APPLICATIONS $P
printf %s tblhaJ6i2hU8bWo1 | wrangler pages secret put TABLE_AI_USAGE $P
tr -d '\n' < /workspace/oao-admin-passcode.txt | wrangler pages secret put ADMIN_PASSCODE $P
python3 -c 'import secrets;print(secrets.token_urlsafe(32),end="")' | wrangler pages secret put ADMIN_TOKEN $P   # new random, different from preview
# optional: AI_MONTHLY_CAP_CNY (default 20), AI_STOP_AT_CNY (default 18). ALLOWED_ORIGIN stays https://oao-photography.pages.dev
```

### 17.7 Promote v4 to production (done on 2026-10-09 after owner approval: deployment `522b752c`, git `main` fast-forwarded to `v4`, tag `v4`)

```bash
export PATH=/home/box/.local/bin:/home/box/.local/node-v22.11.0-linux-x64/bin:$PATH WRANGLER_CACHE_DIR=/tmp/wcache
# 1) production secrets (§17.6)
# 2) deploy the already-built, already-tested preview folder
cd /workspace/oao-deploy-v4 && wrangler pages deploy . --project-name oao-photography --branch main --commit-dirty=true
# 3) git: fast-forward/merge v4 into main, tag v4, push (repo must stay PRIVATE; run the secret scan first)
```
Then run the §14 checks plus: admin passcode → 管理 appears; `/api/admin/overview` 401/403 rules; calendar shows 29 tasks.

### 17.8 Roll back to v3

- **Fastest:** Cloudflare dashboard → Pages → oao-photography → Deployments → `0d0d5be2` → *Rollback to this deployment*.
- **CLI:** `cd /workspace/v3-backup/oao-deploy-v3 && wrangler pages deploy . --project-name oao-photography --branch main --commit-dirty=true` (full v3 source backup in `/workspace/v3-backup/oao-site`; git tag `v3`).
- The v4 secrets and the 3 new Feishu tables can stay; v3 never reads them. No data migration is involved either way.

### 17.9 Tests

`node cloud-function/test.js`, `node cloud-function/v4.test.js` (events, admin auth 401/403, apply/deliver rules, 验收, convert, AI cost maths, budget stop line, daily limit, cooldown, missing usage table), `node frontend.test.js`, `node integration.test.js`, `node design.test.js`, `node events.test.js` (calendar rendering). Live checks on the preview (2026-10-09): 35/35 API checks passed (incl. one real call of each AI feature), Chrome + WebKit at 1280 and 390 px in light and dark with no page errors. Test task/applications (`【测试】…`, 学号 `TEST9999/TEST9998`) were deleted afterwards; the 29 seeded tasks remain.

### 17.10 Known v4 notes

- A member identifies themself by 姓名 + 学号 on top of the shared member passcode; anyone with the passcode could apply in someone else's name. Admins see everything and can cancel/退回. Per-student logins would need accounts (out of scope).
- Delivery stores Baidu links only (no file upload), as requested.
- `deepseek-chat` is an alias DeepSeek may retire; if calls start failing, set `LLM_MODEL` to the current model and re-check pricing in the comment above `PRICE`.
- The calendar opens on the current month; 2026 autumn schedule is Oct–Nov.

---

## 18. v4.1 (LIVE in production since 2026-10-09; deployment `caccbb28`, replaced the same day by the v4.1 polish deployment `7d104a88`, see §18.7): CAS 时间 on tasks + 邀请拍摄 copy

**Status: LIVE in production** since 2026-10-09 (owner approved): Cloudflare deployment **`caccbb28-9462-42eb-8339-7f0e1f58dee5`** (branch `main`, source commit `4beba1d`) at <https://oao-photography.pages.dev>. Git: `main` fast-forwarded to `v4.1`, tag **`v4.1`**, `deploy/` = the v4.1 build. The preview stays at <https://v41.oao-photography.pages.dev>. **Rollback:** v4 deployment `522b752c-166e-4583-a01b-c6d5455c3f8e` (§18.1, §18.6).

### 18.1 Backup taken before v4.1 (keep it)

- Git: tag **`v4.0-backup`** and branch **`v4.0`**, both = `main` at `c6b186e` (live v4).
- `/workspace/backups/v4.0-2026-10-09/` (chmod 700, on the build machine only, **never commit**):
  `deploy/` (the exact v4 production build), `source-tree/` (git archive of `main`), `feishu/<table>.json` (all 8 tables: field schemas + every record, paginated; **contains student personal data**), `ROLLBACK.md`.
- Rollback target for production: deployment **`522b752c-166e-4583-a01b-c6d5455c3f8e`** (dashboard → Deployments → Rollback), or redeploy `backups/v4.0-2026-10-09/deploy` with `--branch main`.

### 18.2 CAS 时间 (what was built)

- **Feishu:** 拍摄任务 has two number fields **`CAS-C`** and **`CAS-S`** (format `0.0`), added with `tools/feishu/setup_tables.py` from `schema.py` (`CAS(...)` helper; `verify.py` now also checks number formats). All 29 existing tasks were set to C=1, S=1 with `tools/feishu/set_cas_default.py --all` (batch_update). `set_cas_default.py` without `--all` only fills empty cells.
- **Backend** (`cloud-function/index.js`, `F.event.casC/casS`):
  - `GET /api/events` items and `GET /api/admin/overview` events carry `casC` / `casS` as numbers. The Feishu list API returns them as strings (`"1.5"`); `casRead()` converts. An **empty cell shows as 1**. Values edited directly in Feishu show up on the next load (no cache).
  - Admin `POST /api/admin/events`, `PUT /api/admin/events/:id` and `POST /api/admin/requests/:id/convert` accept `casC` / `casS` (number or numeric string). Validation: 0.5–5 in 0.5 steps, otherwise HTTP 400 `CAS C 应为 0.5–5 小时，0.5 一档`. New tasks and converted requests default to 1 / 1. PUT only changes what is sent. The ✦ AI 整理 draft returns 1 / 1 (AI never guesses CAS).
  - Fix: the `PUT /api/admin/events/:id` response used to contain only the changed fields (Feishu's update API returns a partial record). It is now merged with the current record.
- **Frontend** (`events.js`, `index.html`, `styles.css`):
  - Task detail: a `CAS 时间` tile showing `C 1 · S 1` (`C 1.5` for halves; no A).
  - Mobile agenda and the day list: a third line `CAS 时间 C 1 · S 1` (`.ag-cas`, label tinted with the category colour; light and dark).
  - Desktop month chips: CAS is in the chip tooltip and the screen-reader label only. A visible `C1 S1` tag was tried and dropped because at 1280px it truncated 5 of 24 October titles (the calendar is capped at 1180px wide, so bigger screens don't help).
  - Admin 任务编辑器: `C` / `S` number inputs (min 0.5, max 5, step 0.5, default 1), using the same `.cas-field` / `.cas-grid` style as the request form (`.cas-grid-2` = 2 columns, plus a modal-specific fix so the letter prefix and full width match).
- **Tests:** `v4.test.js` (strings from Feishu, defaults, validation, partial PUT, convert defaults, partial-response merge, member 403), `events.test.js` (format, agenda line, tooltip), `integration.test.js` (field names in backend + schema.py, editor inputs, request section). All 6 test files pass.

### 18.3 申请拍摄 → 邀请拍摄 (copy only)

The `#request` section and its form/backend are unchanged. Only the wording changed, so members don't mistake it for task sign-up:

| Where | v4 | v4.1 |
|---|---|---|
| eyebrow | Request | For Clubs & Teachers |
| heading | 申请 OAO 拍摄活动 | 邀请 OAO 来拍你的活动 |
| lede | 给其他社团或活动负责人：填好活动信息和联系方式，提交后直接进入 OAO 的拍摄排期，我们会尽快联系你。 | 给其他社团、活动组织者和老师：想请 OAO 到场拍摄？填好活动信息和联系方式，提交后进入 OAO 的拍摄排期，我们会尽快联系你。 |
| new hint | – | OAO 社员不用填这张表：想参与拍摄，请到 [拍摄日历](#calendar) 报名任务。 |
| nav, footer, mobile tab bar | 申请拍摄 | 邀请拍摄 |
| hero button | 申请拍摄 | 邀请 OAO 拍摄 |
| timeline empty state | …点「申请拍摄」告诉我们。 | 想请 OAO 来拍？点「邀请拍摄」告诉我们。 |

The admin dashboard still calls these records 拍摄申请.

### 18.4 Preview secrets and checks

- The preview environment has every v4 secret, including `TABLE_EVENTS`. **Changed on 2026-10-09:** the preview `ADMIN_PASSCODE` was stale (it did not match the admin passcode used in production), so it was set to the production value from `/home/box/.oao/admin-passcode.txt` (piped, never echoed). The preview `ADMIN_TOKEN` and `MEMBER_TOKEN` still differ from production.
- Live checks on v41 (2026-10-09): site lock 401 → login 303 → health `connected`; `/cloud-function/index.js` 404; `/api/events` = 29 tasks, all C=1 S=1, no 学号; member and admin passcodes → roles member/admin; wrong code 401; `/api/admin/overview` 401 without a token and 403 with the member token; admin PUT `casC 2.5 / casS "0.5"` round-trips through `/api/events` and the overview; invalid values (7, 1.2) → 400; a direct Feishu edit (3.5 / 4) showed on the site on the next load; everything restored to 1 / 1 (Feishu re-checked: 29 × `"1"`/`"1"`).
- Screenshots (Chrome via Playwright, logged in through `/__login`, 1280 and 390, light and dark, no page errors): `/workspace/v41-shots/`.
- The preview reads and writes the **same Feishu Base** as production. The CAS fields and the 1/1 values are therefore already in the live Base. v4 production ignores them.

### 18.5 Promote v4.1 (only after owner approval)

```bash
export WRANGLER_CACHE_DIR=/tmp/wcache   # CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID in env
cd /workspace/oao-deploy-v41            # or: bash source/tools/build-deploy.sh <dir> from branch v4.1
rm -rf .wrangler && npx wrangler@4 pages deploy . --project-name oao-photography --branch main --commit-dirty=true
# git: merge v4.1 into main, rebuild deploy/, tag v4.1, push
```

No production secret changes are needed. Rollback: §18.1.

### 18.6 Promotion record (2026-10-09)

- Branch `v4.1` at `4beba1d`: all 6 test files passed; `tools/build-deploy.sh` output identical to `/workspace/oao-deploy-v41` (apart from wrangler's `.wrangler/` cache).
- Production secrets checked (names only): all 19 present (incl. `TABLE_EVENTS`, `ADMIN_PASSCODE`, `ADMIN_TOKEN`). v4.1 reads no new env vars, so nothing was added.
- Deployed with `--branch main` → deployment **`caccbb28-9462-42eb-8339-7f0e1f58dee5`**.
- Live checks on <https://oao-photography.pages.dev> (18/18 passed): site lock 401, wrong password not accepted, login 303; health `connected`; `/cloud-function/index.js` 404; `/api/events` = 29 tasks, all `casC=1` / `casS=1` (numbers), no 学号; member passcode → `member`, admin passcode → `admin`, wrong code 401; `/api/admin/overview` 401 without a token, 403 with the member token, 200 with the admin token (29 events, CAS 1/1); homepage contains `邀请 OAO 来拍你的活动` and `拍摄日历` and no longer contains `申请 OAO 拍摄活动`. The served `index.html`, `app.js`, `events.js`, `styles.css`, `script.js` and `config.js` are byte-identical to the build.
- Rollback (if ever needed): Cloudflare dashboard → Deployments → `522b752c` → Rollback, or `npx wrangler@4 pages deploy /workspace/backups/v4.0-2026-10-09/deploy --project-name oao-photography --branch main --commit-dirty=true`; then point the git docs back at tag `v4`.

Note: GitHub reports the repo `Marcsun666/OAO_Photography_System` as **public** (older sections of this doc say private). It contains no secrets, but it does document the Base app_token and table ids. Never commit `/workspace/backups/`.

### 18.7 v4.1 polish (LIVE 2026-10-09, deployment `7d104a88`)

Still called **v4.1**. This is a refinement pass on the same design language (Apple-like, liquid glass, light/dark auto). No features were removed. Changelog: root `CHANGELOG.md`.

**Status.**
- Production deployment: **`7d104a88-1116-4c69-a858-375ded02409d`** (branch `main`) at <https://oao-photography.pages.dev>.
- Preview: <https://v41.oao-photography.pages.dev> (deployment `17244b10`, same build).
- Git: `main` and tag **`v4.1`** were force-moved to the polish commit. `deploy/` is the polish build.
- **Rollback target:** the pre-polish v4.1 deployment **`caccbb28-9462-42eb-8339-7f0e1f58dee5`** (git tag `v4.1-backup` = `d80fe41`). Use Cloudflare dashboard → Deployments → `caccbb28` → Rollback, or run `WRANGLER_CACHE_DIR=/tmp/wcache npx wrangler@4 pages deploy /workspace/backups/v4.1-2026-10-09/deploy --project-name oao-photography --branch main --commit-dirty=true`. The Feishu changes below are additive, so the old build keeps working on the new schema. It just stops hiding 邀请拍摄 rows.
- **Backup taken first:** `/workspace/backups/v4.1-2026-10-09/` (chmod 700, never commit). It contains `deploy/`, `source-tree/` (git archive of `d80fe41`), `feishu/*.json` (all 8 tables at 0/0/0/4/2/29/1/4 records) and `ROLLBACK.md`.

**Feishu schema (additive; applied live with `tools/feishu/setup_tables.py`).**
- 活动记录.状态 gets a new option `待处理申请`.
- New single-select field 活动记录.`来源`, with options `成员录入` / `邀请拍摄`.
- `setup_tables.py` now adds missing select options to existing fields and keeps the existing options and their ids.
- `tools/feishu/migrate_requests.py [--dry-run]` tags old request rows: rows with no 来源 whose 描述 has a `联系人：` or `CAS：` line become 来源=邀请拍摄 and 状态=待处理申请. A live run found 0 rows (活动记录 is empty).

**Fixes.**
1. **Mobile tab bar.** The centre 邀请拍摄 tab is now always a solid pill: a graphite gradient with white text in light mode, `#f5f5f7` with black text in dark mode. It stays that way in `.active` and `.on-dark`; active adds an outer ring. The cause was `.tab-bar a.active { background: rgba(255,255,255,.24) !important }` overriding it. Under contrast-more the pill gets an outline.
2. **Modals and sheets.**
   - The scrim is `--p-scrim` with `blur(24px)`.
   - The card is `--p-sheet`: light `rgba(251,251,253,.93)`, dark `rgba(28,28,30,.93)`, with `blur(36px)`, keeping the glass rim.
   - Fields use `--p-field`.
   - Under reduce-transparency the cards and scrim are solid.
3. **Hero stats** never show `0`:
   - Upcoming tasks (not cancelled and not ended) show `个拍摄任务待开拍`, or `—` with 近期暂无拍摄任务.
   - Photos are `max(Σ 照片数, photo rows)`, or 照片素材整理中.
   - Links show the count, or 作品链接即将上线.
   - The last tile is 26-27 招新进行中.
   - While loading the values show `…`.
4. **邀请拍摄 kept off the public site.**
   - `POST /api/request` always writes 状态=待处理申请, 来源=邀请拍摄 and ignores any status the client sends. It requires a name and stores the contact and CAS as `联系人：…` / `CAS：C x / A y / S z` lines in 描述.
   - `GET /api/activities` (public) filters requests out using `isShootRequest`. That checks 来源 first and falls back to the legacy line format, so contact info never reaches the public timeline, stats or workspace.
   - The admin overview's `stats.activities` also excludes requests.
   - The admin 拍摄申请 list is unchanged and now also carries `note` (stripped) and `cas`.
5. **Convert request → task.**
   - The task 备注 is `stripContact(...)`, which drops 联系人 / 联系方式 / 联系 / CAS lines, even when the editor sends them back.
   - CAS-C and CAS-S are prefilled from the request's C and S, rounded to 0.5 steps and clamped to 0.5–5, with a default of 1. Example: C 7 → 5, S 0.3 → 0.5.
   - A stays reference only, and the request card says so: 「转成任务后 CAS 时间为 C x · S y（申请里的 A … 只作参考）」.
   - The AI draft uses the same CAS values.
6. **Delivery opens** when the task time has passed **or** an admin sets 已结束. One rule, `isEnded`, is used by both the server and `events.js`, and `/api/events` returns `ended`. The member hint was updated to match.
7. **恢复为已确认** works for cancelled applications. They are listed in a collapsible 「已取消的报名」 block under each task (open under the 已取消 filter, which now also includes tasks that have cancelled applications), and the action asks for confirmation.
8. **「在管理后台查看报名 →」** closes the modal, loads the admin area if needed, switches the filter to 全部, opens the task, scrolls it to the centre and flashes it for 2.4 s (an outline instead under reduced-motion).
9. **Upload to a new activity name** creates the activity, because `ensureActivityAndCount` is member-authed and server-side:
   - It creates `日期 YYYY.MM`, 照片组, 待选片, 其他, 照片数 1, 来源 成员录入.
   - An existing activity gets 照片数 + 1, so 照片数 stays consistent.
   - Requests with the same name are never matched.
   - The window shows a live hint (existing vs. 将新建), and the toast mentions the new activity.
10. **Smaller fixes.**
    - Task editor: the time is no longer prefilled. It has quick-pick chips (`11:50-12:20 午休`, `放学 15:30-17:30`) and is required in the UI.
    - 已验收 can be undone (「撤销验收」 → 已交付, after a confirm).
    - **AI 分组 is admin-only**: the server returns 403 `ADMIN_ONLY` for members, and the button is disabled with a hint.
    - The login modal mentions 报名.
    - Phone calendar: empty weeks that are already over are hidden; the current and future empty weeks show 「本周暂无任务」.
    - This doc: the button reads 「退出登录」, and the admin passcode format is described (value never written).

**Consistency pass (every change).**
- **Status colours are one map (`PILL` in `events.js`):**
  - blue = 开放报名 / 已报名
  - green = 已安排 / 已确认 / 已转为任务
  - orange = 已交付
  - purple = 已验收
  - red = 已退回
  - grey = 已结束
  - grey with strikethrough = 已取消
  - yellow = 待处理申请
  - Cancelled stack bars changed from red to hatched grey to match.
- **Naming:**
  - Footer 加入我们 → 加入 (same as the nav).
  - Mobile tab 成员 → 成员区 (same as the nav).
  - Events eyebrow "Calendar Feel" → "Club Life".
  - Member tile 「登记技能，一键分组」 → 「登记技能 · 管理员分组」.
  - Member lede says 报名/交付 live in the calendar.
  - Request CAS legend says whose CAS it is, and the inputs are capped at 5.
  - Upload label 「所属活动（选择已有，或输入新名称自动新建）」.
  - The request success message says OAO will contact the requester.
- **Empty states** use one tone ("还没有… + what to do next"), and the static HTML matches the JS text:
  - photo collection 「还没有可展示的照片。成员登录后可以直接上传。」
  - library 「素材库还是空的。…」
  - roster 「还没有人登记资料。填好上面的成员资料表就能加入名册。」
  - workspace week text
  - calendar 「本周暂无任务」
- **Buttons:** confirm dialogs for the reversing actions (撤销验收, 恢复为已确认); `#group-run:disabled` has a proper disabled style.
- **Spacing and parity:** time chips, field hints, the CAS hint and the cancelled block use the existing spacing scale. Every new style has a dark-mode variant and a reduce-transparency / reduced-motion fallback, and the accessibility tail stays last in `styles.css`.

**Tests.** All 6 test files pass. New coverage:
- request marking and public filtering, with no contact leak
- convert note stripping and CAS clamping
- AI draft CAS
- 已结束 → delivery (409 before, 200 after)
- undo 验收 and restoring a cancelled application
- automatic activity creation on upload
- AI 分组 403 for members
- empty weeks and `pillClass`
- schema, SETUP and DOM contract checks

**Live checks.**
- **v41 preview (2026-10-09): 51/51 checks passed.** One more check failed, but the fault was in the check script (it used the wrong query parameter for `/api/my`). It passed after the fix.
  - Lock / health / 29 events with CAS and `ended`.
  - Member / admin roles; admin 401/403/200; AI 分组 403 for members, 401 without a login.
  - A 【测试】 request was absent from `/api/activities` and present in the admin list with CAS prefill 5/0.5 and a clean note. It converted into a task with a clean note and C 5 / S 0.5.
  - A temporary 【测试】 task with 学号 TEST9999: deliver 409 → 已结束 → 200; 验收 → 撤销 → 取消 → 恢复为已确认.
  - All 4 test records were deleted through the Feishu API, and the record counts went back to the backup (0/0/0/4/2/29/1/4).
- **Production (read-only): 24/24 passed.** The check script is at `/workspace/oao-tools/live_check.py`; it reads secrets from env and the box file and never prints them.

**Screenshots.** `/workspace/v41p-shots/` (not in git) covers 1280/390 × light/dark: hero, tab bar on 邀请拍摄 (plus `.on-dark` crops), task modal, admin editor, timeline, calendar and login modal. It also has a reduce-transparency set at 390.

