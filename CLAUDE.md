# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

幻梦境档案馆（线上 https://dreamland.l.cd）：历届神话设计大赛作品的阅读、检索、评分与评论站点。自托管：静态前端 + 单文件 Node/SQLite API，部署在一台 VPS 上，由 Caddy 提供静态文件并把 `/api*` 转给后端。沟通与文档默认使用中文。

现行操作规范以 `开发与同步规范.md` 为准，基线说明见 `CURRENT-BASELINE.md`，历史作品导入见 `历史资料统一导入流程.md`，UI 设计语言见 `design.md`。文档里出现的 `F:\dreamland\...`、`mythos-archive-current`、CloudBase（`CLOUDBASE_ENV`、`cloudbase.iife.js`）均为历史内容，已不适用。

## 常用命令

```powershell
npm ci                    # Node 24（依赖 node:sqlite）
npm run web               # 构建 dist/web/（内部先跑 build-html）；成功的最后一行是 "web out= .../dist/web/index.html"
npm run preview           # 同时启动 API 与静态预览：http://127.0.0.1:18881，数据库 data/dreamland.dev.db
npm run api               # 仅启动 API（PORT 默认 3000；开发时先设 $env:DATABASE_PATH="data/dreamland.dev.db"）
node --check server/index.cjs
```

测试（均会自行起一个临时库的后端进程，按改动范围运行单个文件）：

```powershell
node --test server/publication.test.cjs
node --test server/reading-guides.test.cjs
node scripts/test/spotlight.test.mjs
node scripts/test/rating-achievements.test.mjs
node scripts/test/search-recommendations.test.mjs
```

构建若以退出码 127 结束，多半是 `NODE_OPTIONS` 里注入的 shim 让 `fs.cpSync` 崩溃：`Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue` 后重跑。不能因为旧的 `dist/web/index.html` 还在就判定构建成功。

## 架构

**构建管线**：`content/<年>/edition.json` + `content/<年>/works/*.md`（2020–2026 共 344 篇）→ `scripts/build-html.mjs`（marked 渲染，生成单文件离线版 `dist/幻梦境档案馆.html`，并写出 `server/catalogue.json`）→ `scripts/build-web.mjs` 从离线版中抽出 `ARCHIVE_DATA`，拼装 `dist/web/`：`index.html`（含梦门开场结构与启动失败面板）、各运行时脚本、`archive-data.js`、`archive-content/<届>/<篇>.html` 正文、`archive-assets/` 附件，以及 344 个深链接预渲染页 `<届别>/<三位编号>/index.html`（不带梦门，直接展示正文；改入口模板时要确认它们同步更新）。`dist/` 只是发布物，不要手改。

**前端**（`viewer/`，无框架、无打包，原样拷贝）：
- `viewer.js`：主应用（路由、阅读器、评分、评论、书架、管理后台等），体量很大，改之前先 grep 相关函数。
- `mythos-client.js`：API 客户端，所有请求都是 `POST /api`，body 为 `{ action, payload }`。文件名故意不以 `api` 开头——Caddy 的 `handle /api*` 会吞掉这类静态资源；改名需同步改 `build-web.mjs` 与预渲染替换逻辑。
- `dream-gate.js`（梦门开场）、`witch-assistant.js`（小女巫导览助手）、`archive-guides.js`（主题导读）；样式全部在 `viewer.css`（CSS 变量与明暗主题，新模块复用现有变量，见 `design.md`）。
- 登录 token 仍存于 `localStorage` 的 `mythos.cloud.token` 键，为保持旧会话有效，不要改名。

**启动链**（`viewer.js` 末尾）：`ensureAdminSeed() → cloudBootstrap() → showAuthGate()/hideAuthGate()`。`bootstrap` 请求超时 6 秒（`BOOT_TIMEOUT_MS`），失败走 `showBootError()`。`finishBoot()` 负责调用 `DreamGate.ready()` 让梦门退场，只能在真实启动状态处理完后调用。`hideAuthGate()` 给 `<html>` 加 `is-archive`，约 732 KB 的标题字体从此时才加载，不要把它移到登录页之前。写请求默认无超时，只读请求需要限时由调用方传 `{ timeoutMs }`。

**后端**（`server/index.cjs`）：单文件、原生 `http` + `node:sqlite`，唯一路由 `/api`，由 `handle(action, payload, auth, ctx)` 里的大 `switch` 分发（`bootstrap`、`login`、`register`、评分、评论、spotlight、发布/颁奖、管理员操作等）。表结构在启动时自动建立/补列。配置全部来自环境变量：`PORT`、`DATABASE_PATH`、`ADMIN_QQ`、`SMTP_*`、`CODE_TTL_MINUTES` 等。`.cjs` 扩展名只是为了兼容仓库的 `"type": "module"`；线上对应文件为 `/opt/dreamland/app/server/index.js`，服务名 `dreamland-api`。线上的 `server/catalogue.json` 只列 2026 届，与仓库版本不同属正常。

**公示页**：`renderResults` 在历届（`content/<年>/results.json`、`reviews.json`）和本届（`getEditionInsights` + `getEditionAwards`，公示后读 `edition_publications` 快照）之间分流，但「授奖」和「全部名次」两块分别共用 `renderAwardGallery` 和 `renderResultsRankList`。维度数不固定：历届两项，本届三项（`DIMENSIONS`：传录/档案/综合）。公开接口只返回综合分，本届各维度的均分由 `distributions` 里的 1–5 分票数折算（`dimensionAveragesOf`）。

## 新功能气氛自检（来自《幻梦境档案馆-气氛审查与改进》）

- 颜色只用 CSS 变量（`--bg`/`--panel`/`--text`/`--accent`/卷色），不用金色、纯白、纯黑；边角用 `--radius`（2px 直角），不用圆角胶囊。
- 标题用 `--display-font`，序号和分数用 `--archive-number-font`。重要状态用印章，不用色块标签；外壳用档案卡的卡头（「幻梦境档案馆 · …」+ 档号或日期）。
- 印章一律用 `viewer.js` 开头的 SVG 生成函数（`createInkSeal` 白文方印、`createRatedSeal`、`createSpotlightSeal`、`createAwardSeal` 朱文竖印、`createBoxSeal` 朱文横印、`createResultsStatusMark` 圆章），它们都套了 `#ink` 墨迹滤镜；不要用 CSS 边框或实心色块画章。
- 图表颜色只用已校验的变量：评分维度条 `--dim-1/2/3`（分类色），1–5 分分布 `--rating-1…5`（同一色相由浅到深，夜间反向）。新增或调整时先跑 dataviz 技能的 `validate_palette.js`。
- 一个区域只放一个实心主按钮。同一个状态只说一次。最重要的内容放在第一屏。文案用档案馆口吻（调查员、档案、卷、封存、解封）。空状态要有一句话和一个去处，小女巫在该页要有对应的台词组。
- 验收：390px 宽下无需横向滑动；过一遍黑夜模式和「减少动态效果」；征文/评分/统计/公示四个阶段，游客/调查员/管理员三种身份，各走一遍。
- 要看本届公示效果，需要一个已进入「公示」的测试库（两位管理员依次 `adminConfirmEditionPhase`，流程见 `server/publication.test.cjs`），再用 `DATABASE_PATH` 指向它运行 `npm run preview`。不要连接线上库。

## 数据归属（易踩坑）

- **作品正文**：线上管理后台编辑的 `work_content` 表优先于 `content/` 的 Markdown。发布可能覆盖正文的版本之前，先只读导出线上 `workId, body` 到仓库外的 JSON，再用 `node scripts/sync-content-from-db.mjs <dump.json>`（加 `--check` 只校验）回灌 `content/2026/works/`，否则重新构建会让正文退化。导出文件不要提交，用完删除。
- **账号、评分、评论、设置**只在线上 SQLite / 管理后台，绝不用本地库覆盖线上。
- **历史作品（2020–2025）**由 `scripts/import-legacy-archive.py`（Python 3.10+，python-docx/openpyxl/Pillow）从仓库外的原始 DOCX/XLSX 导入；用 `--dry-run` 先盘点，`--force --years <年>` 按年重建，不要在沙箱里跑全量 `--force`。

## 缓存与版本号

线上 Caddy 对带 `?v=` 的资源返回 `immutable` 一年缓存，HTML 为 `no-cache`。**修改 `viewer/` 下任何脚本/样式或正文后，必须同步更新 `scripts/build-web.mjs` 里的 `STATIC_VERSION`**，否则线上看起来“没生效”。未版本化的素材（如 `assets/witch-*.webp`）不要直接套长缓存。

## 提交与发布

- 远程：`origin` = GitHub `Aozaki2501/mythos-archive`。开发前看 `git status --short --branch`，不要覆盖他人未提交的文件。不要提交 `data/`、`dist/`、`output/`、数据库转储或凭据（均已在 `.gitignore`）。
- 没有自动发布脚本，推送 Git 不等于上线。发布步骤（先备份 VPS 站点和数据库；先传资源再传 HTML；重新生成 `index.html.gz`；后端变更后重启 `dreamland-api`）、回滚方式和历次发布记录都在 `开发与同步规范.md`。部署到 VPS 属于生产变更，须先征得用户同意。

## 仓库外的相关目录（`K:\AI\幻梦境网站\`）

上级目录是工作区而非代码仓库：`mythos-archive-vps-current/` 是线上站点快照（发布前比对用），`outputs/` 存放 VPS 快照、审查与原型（视觉提案 `outputs/visual-proposal-2026-09-24/`），`dream-gate-demo.html` 是梦门原型，`神话造物群活/`、`排名文档/`、`评委语/` 是原始参赛资料；`mythos-archive/`、`mythos-archive-deploy/` 是早期 CloudBase 版本，已过时，不要在其中开发。`ssh/` 含私钥，勿读取或外传其内容。
