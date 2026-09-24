# 当前开发基线

这个目录是当前自托管站点的开发基线。开发、同步和发布按 [开发与同步规范.md](开发与同步规范.md) 执行。

## 来源

- `content/`、`scripts/`：2026-09-17 的完整原始工程。其中 `content/2026/works/*.md` 在 2026-09-20 和 2026-09-24 两次按线上数据库 `work_content` 回灌过；同步工具是 `scripts/sync-content-from-db.mjs`，用法见脚本头部注释。
- `viewer/`：入口页面的模板、样式与交互代码，是页面和交互的唯一编辑入口。`viewer/dream-gate.js` 是启动开场，样式在 `viewer/viewer.css`，结构由 `scripts/build-web.mjs` 写入 `index.html`。
- `server/index.cjs`：从 VPS `/opt/dreamland/app/server/index.js` 同步的自托管 Node + SQLite 后端。扩展名仅为兼容本工程的 ES Module 前端构建配置；代码内容不变。

> 文档里出现的 `F:\dreamland\mythos-archive-current`、`F:\dreamland\...` 备份目录、单文件 `dist/web/index.html` 部署、`CLOUDBASE_ENV`、`cloudbase.iife.js`、`mythos-archive-current` 目录名都是历史内容，已经不再适用。

## 本地构建

```powershell
npm run web
```

输出是 `dist/web/`，包含 `index.html`、入口脚本与样式、`archive-data.js`、`archive-assets/` 附件，以及 344 个深链接预渲染页（`<届别>/<三位编号>/index.html`）。发布时必须整体对待，不能只替换 `index.html`。缓存与版本号规则见 [开发与同步规范.md](开发与同步规范.md) 的「静态资源缓存与版本号」；历史资料的完整导入、作者封存和附件策略见 [历史资料统一导入流程.md](历史资料统一导入流程.md)。

本地 API 可用 `npm run api` 启动。默认数据库位于 `data/dreamland.db`；开发时建议先指定独立路径，例如 `$env:DATABASE_PATH="data/dreamland.dev.db"`。

本地预览会同时启动 API 和静态页面，并将页面的 `/api` 转发到本地 API：

```powershell
npm run web
npm run preview
```

随后在本机浏览器打开 `http://127.0.0.1:18881`。按 `Ctrl+C` 会同时停止预览页和 API。

## 重要边界

- 线上 `work_content` 数据库表中的在线正文优先于 `content/` 中的 Markdown。2026-09-24 已把两者对齐：54 条记录里 52 篇的构建产物与数据库正文逐字节一致；`2025/44-第三帝国的未竟之仪` 与 `2026/27-星海之梦` 因渲染差异做不到逐字节一致，已回灌到最接近的版本，正文文字以线上为准。以后在管理后台改完正文，要用 `scripts/sync-content-from-db.mjs` 再对齐一次，否则重新构建会退化成旧版。
- 当前后端源码是 `server/index.cjs`；发布到 VPS 时文件名为 `/opt/dreamland/app/server/index.js`。
- 线上 `/opt/dreamland/app/server/catalogue.json` 只列 2026 届，与仓库里供构建用的版本不同，属正常差异。
