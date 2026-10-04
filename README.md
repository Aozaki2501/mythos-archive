# 幻梦境档案馆

历届「神话设计大赛」作品的阅读、检索、评分与评论站点。线上地址：<https://dreamland.l.cd>

收录 2020–2026 共七届、344 篇参赛作品。站点做成一座“档案馆”的样子：进门有梦门开场，作品按届别成卷，读者以“调查员”身份登录后可以评分、评论、收藏到书架，本届比赛的征文、评分、统计、公示四个阶段也在站内完成。

## 功能一览

- **阅读与检索**：按届别浏览、搜索、相似作品推荐、主题导读（几条串联历届作品的阅读路线）。
- **评分与评论**：本届按“传录 / 档案 / 综合”三个维度 1–5 分评分，附评分分布和评议下潜进度、成就。
- **公示页**：历届名次与评语；本届在公示阶段自动生成授奖与全部名次。
- **小女巫导览助手**：页面角落的导览角色，会根据当前页面说不同的台词。
- **管理后台**：作品正文在线编辑、阶段切换（需两位管理员先后确认）、作品除名、账号管理等。

## 技术栈

不依赖前端框架，也没有打包工具，尽量保持简单：

- 前端：原生 JavaScript + CSS（`viewer/`），构建时原样拷贝。
- 后端：单个 Node.js 文件（`server/index.cjs`），用 Node 自带的 `http` 和 `node:sqlite`，数据存在一个 SQLite 文件里。
- 内容：作品是 Markdown（`content/<年>/works/*.md`），构建时用 marked 渲染成 HTML。
- 部署：一台 VPS，Caddy 提供静态文件，并把 `/api` 请求转给后端。

## 本地运行

需要 **Node.js 24**（要用到内置的 `node:sqlite`）。

```bash
npm ci
npm run web       # 构建站点到 dist/web/，最后一行输出 "web out= .../dist/web/index.html" 才算成功
npm run preview   # 同时启动后端和静态预览，打开 http://127.0.0.1:18881
```

预览使用的数据库是 `data/dreamland.dev.db`，第一次运行会自动建表。

如果构建以退出码 127 结束，通常是环境变量 `NODE_OPTIONS` 里有东西干扰，清空它再重跑即可。

### 后端配置（环境变量）

| 变量 | 说明 |
| --- | --- |
| `PORT` | 后端端口，默认 `3000` |
| `DATABASE_PATH` | SQLite 文件路径 |
| `ADMIN_QQ` | 初始管理员的 QQ 号，多个用逗号分隔。**自己部署时务必设置**，否则会用代码里的默认名单 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM_NAME` | 发注册验证码用的邮箱（默认 QQ 邮箱 SMTP） |
| `CODE_TTL_MINUTES` / `CODE_RESEND_SECONDS` / `SMTP_DAILY_LIMIT` | 验证码有效期、重发间隔、每日发信上限 |

账号用 QQ 号注册，验证码发到对应的 QQ 邮箱。不配置 SMTP 就收不到验证码。

### 测试

每个测试会自己起一个临时数据库的后端进程：

```bash
node --test server/publication.test.cjs
node --test server/reading-guides.test.cjs
node scripts/test/spotlight.test.mjs
node scripts/test/rating-achievements.test.mjs
node scripts/test/search-recommendations.test.mjs
```

## 目录结构

```
content/<年>/           每届的 edition.json、作品 Markdown、附件、历届名次与评语
scripts/build-html.mjs  渲染作品，生成单文件离线版和 server/catalogue.json
scripts/build-web.mjs   组装线上站点 dist/web/（含每篇作品的独立链接页）
scripts/local-preview.mjs  本地预览
server/index.cjs        后端：唯一接口 POST /api，body 为 { action, payload }
viewer/                 前端：viewer.js 主程序、viewer.css 样式、梦门、小女巫、导读等
```

`dist/`、`data/`、`output/` 是构建产物或本地数据，不进仓库。

## 想改点什么之前

- `CLAUDE.md`：架构和易踩坑的地方，最全的一份说明。
- `design.md`：界面设计语言（配色变量、印章、档案卡等）。
- `开发与同步规范.md`：开发、发布和回滚流程。
- `普通用户使用指南.md`：站点怎么用。

改了 `viewer/` 下的脚本、样式或作品正文后，要同步修改 `scripts/build-web.mjs` 里的 `STATIC_VERSION`，否则浏览器会继续用旧缓存。

## 版权说明

- `content/` 中的参赛作品，版权归各位原作者所有，仅用于本档案馆的展示。转载或他用请先征得作者同意。
- 标题字体 `viewer/assets/dreamland-display-serif.woff2` 是思源宋体（Source Han Serif）的子集，遵循 SIL Open Font License 1.1，详见 `viewer/assets/` 下的许可文件。
