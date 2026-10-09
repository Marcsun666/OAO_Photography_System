# Changelog — OAO Photography Club website

All dates are 2026 (Beijing time). The live site is <https://oao-photography.pages.dev> (password-locked). Details are in the [handover doc](OAO-Photography-v4-HANDOVER.md).

## v4.1 polish — 2026-10-09

Still v4.1 (same version name). A refinement pass: no new design language, and no features removed. Cloudflare deployment `7d104a88-1116-4c69-a858-375ded02409d`, git tag `v4.1`. Rollback target: `caccbb28` (tag `v4.1-backup`). Handover §18.7.

**Fixed**
- **Mobile tab bar:** the centre 邀请拍摄 tab stays readable when active, in light and dark mode and over dark sections.
- **Modals and sheets:** a denser glass fill, a blurred scrim, and solid fallbacks under 减少透明度.
- **Hero stats:** no more `0` tiles. They show 待开拍任务 / 照片素材 / 作品链接 / 招新, with friendly empty labels.
- **邀请拍摄 requests:** kept off the public timeline, stats and workspace counts, but still listed in 后台「拍摄申请」.
  - New Feishu field 活动记录.`来源` (成员录入 / 邀请拍摄) and a new status `待处理申请`.
  - `tools/feishu/migrate_requests.py` tags old rows.
- **Request → task:**
  - Contact and CAS lines are removed from the public 备注.
  - CAS-C and CAS-S are prefilled from the request (0.5–5, in 0.5 steps, default 1). A is shown for reference only.
- **Delivery** opens when the task time has passed **or** an admin marks it 已结束. Backend and frontend use the same rule.
- **恢复为已确认** works for cancelled applications. They are listed under 「已取消的报名」 and the 已取消 filter.
- **「在管理后台查看报名 →」** scrolls to the task and highlights it.
- **Upload window:** a new activity name creates the activity (member-authed), and 照片数 stays consistent.
- **Task editor:** no prefilled time. It has quick-pick chips and the time is required.
- **验收 can be undone** (back to 已交付, after a confirm).
- **AI 分组 is admin-only.** The server enforces it (403 for members), and the button is disabled with a hint.
- **Login modal** text mentions 报名.
- **Phone calendar:** past empty weeks are hidden; current and future empty weeks show 「本周暂无任务」.
- **Handover doc:** 「退出登录」 button text; the admin passcode format is described (the value is never written).

**Consistency**
- One status-colour map:
  - blue = 开放报名 / 已报名
  - green = 已安排 / 已确认 / 已转为任务
  - orange = 已交付
  - purple = 已验收
  - red = 已退回
  - grey = 已结束
  - struck-through grey = 已取消
  - yellow = 待处理申请
- Naming:
  - 加入我们 → 加入
  - Tab 成员 → 成员区
  - "Calendar Feel" → "Club Life"
  - Clearer labels for the upload, CAS and member areas
- Empty-state wording is unified (static HTML matches the JS text).
- Confirm dialogs for reversing actions, and a disabled-button style.
- Dark-mode, reduced-transparency and reduced-motion variants for every new style.

**Docs:** this changelog; tutorials in [`docs/tutorials/`](docs/tutorials/).

## v4.1 — 2026-10-09

Deployment `caccbb28-9462-42eb-8339-7f0e1f58dee5`. Kept as tag `v4.1-backup`. Handover §18.1–18.6.

- CAS 时间 on tasks (CAS-C / CAS-S, 0.5–5 h, default 1/1). Shown in the calendar, agenda, task detail and admin.
- 申请拍摄 renamed 邀请拍摄, with copy aimed at other clubs and teachers. Members sign up for tasks in the 拍摄日历.

## v4 — 2026-10-09

Deployment `522b752c-166e-4583-a01b-c6d5455c3f8e`, tag `v4`. Handover §17.

- 拍摄日历 with 29 term tasks, exam-week markers and a phone agenda view.
- 报名 → 确认 → 交付 (Baidu Netdisk link + 提取码) → 验收 workflow, with 我的任务 by 学号.
- A hidden admin dashboard, unlocked by the admin passcode in the normal login box.
- More AI features (caption polish, weekly brief, staffing, task drafts) under a hard ≤ ¥20/month budget.
- Automatic dark mode; fully transparent liquid glass.

## v3 — 2026-10-08 → 2026-10-09

Deployment `0d0d5be2`, tag `v3`. Handover §16.

- Style and flow refinement: Apple-like typography, liquid-glass navigation, mobile tab bar.
- Three review rounds on a preview before going to production.

## v2 — 2026-10-08

Tag/branch `v2`.

- Live backend: Feishu Bitable tables, and the backend ported to Cloudflare Pages Functions.
- Uploads with byte-identical download; DeepSeek AI 分组.
- Same-origin API behind the site password lock.

## v1 — until 2026-10-08

- Static site with demo data, behind the Cloudflare Pages password lock.
- WebP images and a system font stack.
- The backend existed only as a design (Tencent SCF).
