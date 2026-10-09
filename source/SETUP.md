# OAO 摄影社 · 部署与配置步骤

按顺序完成三步，站点就从「静态展示」变成「内部工具 + 对外传播平台」。

> **当前线上做法（2026-10 起）**：后端直接跑在网站所在的 **Cloudflare Pages 项目里（Pages Functions）**，
> 不再需要腾讯云。第 1 步（飞书）照做，第 2 步看下面的「2A」，腾讯云函数降为可选备用方案（2B）。

---

## 第 1 步：创建飞书应用 + 多维表格

### 1.1 创建应用，拿 App ID / App Secret

1. 打开 [飞书开放平台](https://open.feishu.cn/)，用社团的飞书账号登录。
2. 右上角「创建企业自建应用」，填应用名（如 `OAO 摄影社资料库`）、图标，创建。
3. 进入应用「凭证与基础信息」页，记下两样东西：
   - **App ID**（`cli_` 开头）
   - **App Secret**

### 1.2 开通权限

进入「权限管理」，搜索并开通以下权限（名称以控制台实际为准）：

| 用途 | 需要勾选 |
|---|---|
| 多维表格读写 | `bitable:app`（查看、评论、编辑和管理多维表格） |
| 上传附件 | `drive:drive`（查看、评论、编辑和管理云空间中所有文件）或媒体上传相关权限 |
| 下载附件中转 | 同上（媒体/文件下载权限） |

> 关键点：**开通后要发布应用版本**（「版本管理与发布」→ 创建版本 → 申请发布，管理员通过），否则 token 会提示无权限。

### 1.3 建多维表格（Bitable）

在飞书里新建一个多维表格，命名为 `OAO 摄影社资料库`。建 4 张表（第 5 张可选）：

#### 表 1：`活动记录`（对应 activities）

字段（**列名必须一字不差**，云函数按这些列名读写）：

| 列名 | 类型 | 选项（单选需预建） |
|---|---|---|
| 活动名称 | 文本 | — |
| 日期 | 文本 | 填 `2026.06` 这类 |
| 组别 | 单选 | 照片组 / 视频组 / 两者 |
| 状态 | 单选 | 待选片 / 精修中 / 待交付 / 已归档 / 待剪辑 / 调色中 / 待发布 / 已发布 |
| 类型 | 单选 | 舞台 / 运动 / 联动 / 公益 / 招新 / 课程 / 其他 |
| 照片数 | 数字 | — |
| 视频数 | 数字 | — |
| 描述 | 文本 | — |
| 封面 | 附件 | — |
| 网盘链接 | 文本 | 百度网盘分享链接 |
| 提取码 | 文本 | — |

#### 表 2：`照片素材`（对应 photos）

| 列名 | 类型 | 选项 |
|---|---|---|
| 活动 | 文本 | 填活动名称，按名关联 |
| 文件 | 附件 | 直传照片 |
| 网盘链接 | 文本 | — |
| 提取码 | 文本 | — |
| 分类 | 单选 | campus / sports / stage / collab / landscape |
| 说明 | 文本 | — |

#### 表 3：`外链`（对应 links）

| 列名 | 类型 | 选项 |
|---|---|---|
| 平台 | 单选 | B站 / 小红书 / 其他 |
| 标题 | 文本 | — |
| 链接 | 文本 | — |
| 备注 | 文本 | — |

#### 表 4：`成员`（对应 members）

社员的基础信息与技能标签。**这张表含学号等个人信息，云函数对它的读和写都要求登录**（其他三张表是游客可读的）。

| 列名 | 类型 | 选项 |
|---|---|---|
| 姓名 | 文本 | — |
| 班级 | 文本 | 如 `G11-3` |
| 学号 | 文本 | **按学号去重**：同一学号重复提交会覆盖原记录，不会新增 |
| 性别 | 单选 | 男 / 女 / 无性别 |
| 职位 | 文本 | 如 照片组组长 / 干事 / 社员 |
| 技能 | 文本 | 顿号分隔，如 `拍照、修图、调色` |
| 备注 | 文本 | — |

> 技能这里用**文本**而不是多选，是为了免去预建选项、方便以后直接喂给 AI 分组。
> 想在飞书里按技能筛选的话，可以改成多选，但云函数写入格式要跟着改。

#### 表 5：`分组`（对应 groups，可选）

AI 自动分组的结果留档，**每组一行**，同一次分组的几行用相同的「批次」串起来。

不建这张表也不影响分组功能——不配 `TABLE_GROUPS` 时结果只返回给前端，不落库。

| 列名 | 类型 | 说明 |
|---|---|---|
| 批次 | 文本 | 分组时间，如 `2026-08-30 14:22:05` |
| 组名 | 文本 | 如 `第 1 组` |
| 成员 | 文本 | 顿号分隔 |
| 技能覆盖 | 文本 | 顿号分隔 |
| 说明 | 文本 | 模型给的分组理由 |

> 留档的意义在于**结果能在飞书里人工调整**——AI 出初稿，人拍板。

#### 表 6–8（v4 新增）：`拍摄任务` / `报名与交付` / `AI用量`

字段以 `tools/feishu/schema.py` 为准（与 `cloud-function/index.js` 的 `F.event / F.app / F.usage` 一一对应）。最省事的做法：

```bash
cd tools/feishu && python3 setup_tables.py && python3 seed_events.py
```

对应环境变量：`TABLE_EVENTS`、`TABLE_APPLICATIONS`、`TABLE_AI_USAGE`。另外 v4 需要 `ADMIN_PASSCODE`（管理员口令，在「成员登录」框里输入）和 `ADMIN_TOKEN`（随机串）；可选 `AI_MONTHLY_CAP_CNY`（默认 20）和 `AI_STOP_AT_CNY`（默认 18）。**没有 `TABLE_AI_USAGE` 时所有 AI 功能（含 AI 分组）都会拒绝调用**——这是预算硬上限的一部分。

### 1.4 拿 app_token 和 table_id

打开多维表格，看浏览器地址栏：

```
https://xxx.feishu.cn/base/AppToken?table=TableId&view=xxx
```

- `AppToken` 即 **app_token**（BITABLE_APP_TOKEN）。
- 分别点进各张表，地址里 `table=` 后的值就是每张表的 **table_id**（TABLE_ACTIVITIES / TABLE_PHOTOS / TABLE_LINKS / TABLE_MEMBERS / TABLE_GROUPS）。

---

## 第 2 步：部署后端

`cloud-function/index.js` 就是后端代码（飞书多维表格代理 + AI 分组），无第三方依赖，
只用 `fetch` / `FormData` / `Blob` / `atob` 等 Web 标准 API，**同一份代码**既能跑在 Cloudflare，也能跑在腾讯云函数。

### 2A（当前使用）：Cloudflare Pages Functions —— 免费、无需绑卡、无需实名

结构：

```
functions/_middleware.js      整站密码锁（SITE_PASSWORD），/api/* 也在锁后面；未登录访问 /api 返回 JSON 401
functions/api/[[path]].js     把 /api/* 请求转给 cloud-function/index.js 的 handle(req, context.env)
cloud-function/index.js       业务逻辑（与腾讯云函数共用）；作为源码被打包，不对外提供下载（中间件返回 404）
```

1. 在能运行 wrangler 的机器上登录 Cloudflare（`wrangler login`）。
2. 逐个设置 Pages **生产环境密钥**（值从标准输入读入，不会出现在命令行历史里）：

   ```bash
   wrangler pages secret put FEISHU_APP_ID --project-name oao-photography
   ```

   需要的密钥：

   | 密钥 | 值 |
   |---|---|
   | `SITE_PASSWORD` | 整站访问密码（已有） |
   | `FEISHU_APP_ID` / `FEISHU_APP_SECRET` | 第 1 步的 App ID / App Secret |
   | `BITABLE_APP_TOKEN` | 多维表格 app_token |
   | `BITABLE_UPLOAD_PARENT_NODE` | 同 app_token（可不设，默认就是 app_token） |
   | `TABLE_ACTIVITIES` / `TABLE_PHOTOS` / `TABLE_LINKS` / `TABLE_MEMBERS` / `TABLE_GROUPS` | 五张表的 table_id |
   | `LLM_API_KEY` | DeepSeek API Key（AI 分组用；可选 `LLM_API_URL`、`LLM_MODEL`） |
   | `MEMBER_PASSCODE` | 成员口令（站内「成员登录」用，解锁上传 / 贴链接 / 成员名册 / AI 分组） |
   | `MEMBER_TOKEN` | 随机长字符串（口令正确后发给浏览器的会话 token） |
   | `ALLOWED_ORIGIN` | `https://oao-photography.pages.dev`（同源调用其实用不到，留着收紧 CORS） |

3. `config.js` 里 `proxyUrl: window.location.origin`、`demo: false`（前端请求同源的 `/api/...`，自动带上站点登录 Cookie）。
4. 部署：`wrangler pages deploy . --project-name oao-photography --branch main`。**改了密钥后要重新部署一次才生效。**

两层登录：先过整站密码（SITE_PASSWORD，看站点），再在站内点「成员登录」输入 MEMBER_PASSCODE（写入 / 看名册 / AI 分组）。
「申请拍摄」表单和活动 / 照片 / 外链的读取只需要整站密码。

限制（免费版）：

- 单次请求体上限 100MB；照片以 base64 上传会放大约 1.37 倍，飞书单文件上限 20MB，代码里按 20MB 拦截。实测 8MB 照片可正常上传。
- 免费版每次请求 CPU 时间有限（约 10ms），但等待飞书 / DeepSeek 网络响应的时间**不计入**；base64 解码用原生 `Uint8Array.fromBase64`，开销很小。
- 每次请求最多 50 个子请求（AI 分组：1 次读成员 + 1 次模型 + 每组 1 次写留档，20 组以内够用）。
- 飞书 tenant_access_token 和附件临时地址按 isolate 缓存（不同 isolate 各自换一次，正常）。

### 2B（可选备用）：腾讯云函数 SCF

需要腾讯云实名认证。自 2024-04 起 SCF 按量计费；**API 网关触发器已于 2025-06-30 下线**，访问地址请用「函数 URL」。

#### 2.1 创建函数

1. 打开 [腾讯云 · 云函数 SCF](https://console.cloud.tencent.com/scf/)。
2. 新建函数 → **从头开始**。
3. 运行环境选 **Node.js 18.15**（或更高）。
4. 把 `cloud-function/index.js` 和 `package.json` 上传（或粘贴内容）。
5. 执行方法填 `index.main_handler`。

#### 2.2 配环境变量

在「函数配置 → 环境变量」里添加：

| 变量名 | 值 |
|---|---|
| `FEISHU_APP_ID` | 第 1 步的 App ID |
| `FEISHU_APP_SECRET` | 第 1 步的 App Secret |
| `BITABLE_APP_TOKEN` | 多维表格 app_token |
| `BITABLE_UPLOAD_PARENT_NODE` | （可选）上传附件用，默认等于 app_token；若直传照片报错，改成照片素材表的 table_id |
| `TABLE_ACTIVITIES` | 活动记录表 table_id |
| `TABLE_PHOTOS` | 照片素材表 table_id |
| `TABLE_LINKS` | 外链表 table_id |
| `TABLE_MEMBERS` | 成员表 table_id |
| `TABLE_GROUPS` | （可选）分组结果留档表 table_id；不填则分组结果不落库 |
| `MEMBER_PASSCODE` | 成员统一访问口令（自己定，如 `oao2026`） |
| `MEMBER_TOKEN` | 登录后签发用的随机长字符串（自己生成一串，如 `oao-session-xxxxxxxx`） |
| `ALLOWED_ORIGIN` | 站点域名；本地调试先填 `*` |
| `LLM_API_URL` | （可选）AI 分组用的模型接口地址，如 `https://api.deepseek.com/chat/completions` |
| `LLM_API_KEY` | （可选）模型 API Key。**只放这里，绝不写进前端任何文件** |
| `LLM_MODEL` | （可选）模型名，如 `deepseek-chat` |

> 最后三个不填也不影响其他功能，只是 `/api/group` 会返回 501「尚未配置大模型」。
> `callModel()` 已实现（DeepSeek）：只填 `LLM_API_KEY` 即可，地址和模型默认是 DeepSeek 的 `deepseek-chat`。函数超时请设为 60s，模型生成分组可能要十几秒。

#### 2.3 开启函数 URL，拿访问地址

> 旧版文档里的「API 网关触发器」已于 2025-06-30 下线，不要再用。

1. 函数详情 →「函数 URL」→ 创建，鉴权方式选「不鉴权」（接口自己有成员口令校验）。
2. 得到的地址就是 **proxyUrl**（`config.js` 里 `proxyUrl: "https://..."`，不含结尾 `/`）。
3. 「函数配置」里把执行超时设为 **60s**（AI 分组和上传照片都要等飞书 / 模型）。
4. 注意：走腾讯云时前端与后端不同源，`ALLOWED_ORIGIN` 必须填站点域名；
   而且整站密码锁只保护 Cloudflare 上的页面，函数 URL 本身是公开的（读接口游客可访问）。

---

## 第 3 步：接入前端

1. 打开 `config.js`：用 Cloudflare（2A）时填 `proxyUrl: window.location.origin`；
   用腾讯云（2B）时填函数 URL（不含结尾 `/`）。两种都要 `demo: false`：

   ```js
   window.OAO_CONFIG = {
     proxyUrl: window.location.origin,   // 或 "https://<腾讯云函数URL>"
     demo: false,
   };
   ```

2. 刷新页面。看到顶部出现「成员登录」，即接入成功。
3. 登录后出现「上传 / 贴链接」入口，即可开始录入。

---

## 本地联调（可选）

1. 把云函数的环境变量复制到 shell，然后：

   ```bash
   cd cloud-function
   node dev-server.js     # 监听 http://localhost:9000
   ```

2. `config.js` 里填 `proxyUrl: "http://localhost:9000"`（注意跨域已按 `*` 放开）。
3. 打开页面联调。

---

## 常见问题

- **提示 `获取 tenant_access_token 失败`**：App ID / Secret 填错，或应用版本未发布。
- **`飞书接口错误 [xxx]`**：多是权限未开通或未发布；核对 1.2。
- **上传失败**：飞书单文件上限 20MB（Cloudflare 免费版请求体上限 100MB，够用）；走腾讯云时受函数 URL 请求体上限约束，建议照片控制在 ~4MB。大视频走网盘链接。
- **附件图不显示**：确认附件下载权限已开；附件中转接口为 `/api/file/:file_token`。
