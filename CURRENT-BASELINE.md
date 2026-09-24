# 当前开发基线

这个目录是当前自托管站点的开发基线。开发、同步和发布按 [开发与同步规范.md](开发与同步规范.md) 执行。

## 来源

- `content/`、`scripts/`：2026-09-17 的完整原始工程。其中 `content/2026/works/*.md` 已于 2026-09-20 按线上数据库 `work_content` 的正文重建，构建产物与线上正文逐字节一致（53/53）；重建前的旧转录稿备份在 `F:\dreamland\content-src-backup-20260920`。同步工具是 `scripts/sync-content-from-db.mjs`，用法见运维指南 4.6。
- `viewer/`：从 2026-09-19 的 VPS 生产页面回迁的当前 CSS、API 客户端和交互代码。
- `server/index.cjs`：从 VPS `/opt/dreamland/app/server/index.js` 同步的自托管 Node + SQLite 后端。扩展名仅为兼容本工程的 ES Module 前端构建配置；代码内容不变。

## 本地构建

```powershell
npm run web
```

输出是 `dist/web/`：包括 `index.html`、运行时文件和历史资料附件目录 `archive-assets/`。发布前必须先在本地审阅构建结果；本目录没有发布脚本，也不会自动连接 VPS。历史资料的完整导入、作者封存和附件策略见 [历史资料统一导入流程.md](历史资料统一导入流程.md)。

本地 API 可用 `npm run api` 启动。默认数据库位于 `data/dreamland.db`；开发时建议先指定独立路径，例如 `$env:DATABASE_PATH="data/dreamland.dev.db"`。

本地预览会同时启动 API 和静态页面，并将页面的 `/api` 转发到本地 API：

```powershell
npm run web
npm run preview
```

随后在本机浏览器打开 `http://127.0.0.1:18881`。按 `Ctrl+C` 会同时停止预览页和 API。

## 重要边界

- 线上 `work_content` 数据库表中的在线正文优先于 `content/` 中的 Markdown。2026-09-20 已把两者对齐（构建产物与数据库正文逐字节一致）；以后在管理后台改完正文，要用 `scripts/sync-content-from-db.mjs` 再对齐一次，否则重新构建会退化成旧版。
- 当前后端源码是 `server/index.cjs`；发布到 VPS 时文件名为 `/opt/dreamland/app/server/index.js`。
