# OAO 摄影社 · 社团活动记录站

OAO 摄影社的「**内部工具 + 对外传播平台**」一体站：对外展示社团活动成果、照片合集与 B 站/小红书入口；对内提供活动记录、照片素材、百度网盘资料库的在线管理。

> **接手这个项目？先读 [`HANDOVER-v2.md`](HANDOVER-v2.md)**（v2 现状、架构、密钥清单、迁移步骤）。历史记录见 [`HANDOVER.md`](HANDOVER.md) —— 当前实际进度、已知的坑、以及几件需要拍板的事。

- 前端：原生 HTML + CSS + JavaScript（无构建、无框架），沿用现有玻璃拟态设计。
- 数据：飞书多维表格（Bitable）作为在线数据库。
- 中间层：Cloudflare Pages Functions（`functions/api/` + `cloud-function/index.js`），保存密钥并转发飞书 API；腾讯云函数为可选备用。

## 目录结构

```
index.html          页面（全部 section 与登录/上传弹窗）
styles.css          全局样式 + 设计变量
script.js           画廊瀑布流、灯箱预览、招新表单
app.js              数据层：登录、读库渲染、上传/贴链接、活动记录写入、成员资料与技能标签
config.js           前端配置（proxyUrl 等）
functions/          Cloudflare Pages 密码锁（_middleware.js：品牌登录页 + 30 天签名 Cookie）
cloud-function/     后端逻辑（Cloudflare Pages Functions 与腾讯云函数共用；dev-server.js 本地调试）
tools/              build-deploy.sh（生成部署目录）、feishu/（建表与校验脚本）
HANDOVER-v2.md      v2 交接文档（英文，最新）
PLAN.md             修改计划书
HANDOVER.md         交接说明：实际进度、已知限制、待决策事项
SETUP.md            部署与配置步骤（飞书 / 腾讯云）
assets/             图片素材（brand / events 为压缩后的 WebP；media 不部署）
assets-originals/   brand / events 的原图（不部署，换图时从这里重新导出）
```

## 快速开始

### 1. 只看静态效果（零依赖）

直接双击打开 `index.html`，或：

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

未配置 `config.js` 里的 `proxyUrl` 时，站点运行在**静态回退模式**：沿用原有写死内容，`app.js` 不会请求后端。

> 想先预览「数据驱动模式」长什么样、又还没部署后端？把 `config.js` 里的 `demo` 改为 `true` 即可：用内置示例数据渲染全部区块，登录/上传/贴链接都能点（写操作只模拟成功、不真正保存），接入真实后端后再改回 `false`。

### 2. 接入真实数据（完整功能）

按 `SETUP.md` 完成三步：

1. 创建飞书应用 + 多维表格（拿 App ID / App Secret / app_token / table_id）；
2. 把 `cloud-function/` 部署到腾讯云函数，配好环境变量；
3. 把云函数地址填进 `config.js` 的 `proxyUrl`，重新打开页面。

配置完成后，页面会自动切换到**数据驱动模式**：hero 统计、工作台、时间线、素材库、照片合集全部读库渲染；顶部出现“成员登录”，登录后可上传照片或贴网盘链接。

## 设计系统速览

- 风格：**Apple 结构 + Sequoia 配色**——白底、纯黑文字、绿 `#007354` 取代 Apple 的蓝；居中大字、胶囊按钮、白/浅灰交替分区、圆角卡片。
- 颜色（`styles.css` 开头唯一的 `:root`，改配色只改这一处）：`--bg #ffffff`、`--surface #f5f5f7`、`--text #000000`、`--text-muted #6e6e73`、`--accent #1d1d1f`（交互色是中性近黑，颜色留给照片；Sequoia 绿 `#007354` 用在登录页）。
- 字体：**只用系统字体，不加载 Web 字体**——苹果设备 SF Pro（`-apple-system`）+ PingFang SC，Windows 微软雅黑，安卓 Noto Sans SC。PingFang / SF Pro 授权不允许自托管，只能按名字调用。
- 图片：WebP（质量 80，长边 ≤1600px），文件名全小写；原图在 `assets-originals/`。
- 圆角：**随尺寸递增**的阶梯 `--r-1..--r-6`（10/13/16/22/30/40），胶囊用 `--r-pill`；大面用 `corner-shape: squircle`（连续曲率），胶囊保持 `round`。
- 输入框：**无边框填充式**，高 44 / 字 17 / 圆角 12，聚焦转白底 + 绿环。
- 导航：**通栏半透明条**（44px 高、内容居中在 1024px 容器、项目均匀铺开、12px 字、无实心按钮），内容从下面穿过。
- **样式是「底层 + 一个覆盖层」**：覆盖层从 `styles.css` 里「Apple 结构 + Sequoia 配色」大标题开始，分若干小节。改风格改覆盖层对应的小节，不要再往文件末尾叠新层；无障碍覆盖必须留在最末尾。2026-10-08 已删掉被完全覆盖的声明和无用选择器（渲染逐元素比对不变），详见 `HANDOVER.md` 第二十四节。

## 常用组件（改首页时优先复用）

`.button`（`.primary`/`.ghost`）、`.eyebrow`/`.kicker`/`.panel-label`、`.section-heading`、`.hero-rail`、`.strip`，以及 `.record-card`/`.board-panel`/`.archive-card`/`.video-card-item` 这一套卡片。

## 测试

无需真实后端即可离线验证两端逻辑（均 mock 掉网络）：

```bash
node cloud-function/test.js   # 云函数路由/鉴权/上传/附件中转
node frontend.test.js         # app.js 数据渲染（连接/静态/演示三种模式）
node integration.test.js      # 前后端字段名 + DOM id + 文档 一致性契约
node design.test.js           # 配色 WCAG 对比度 + CSS 完整性
```

`config.js` 的 `proxyUrl` 留空时站点运行在静态回退模式，不请求后端；填上云函数地址后自动切换为数据驱动模式。
