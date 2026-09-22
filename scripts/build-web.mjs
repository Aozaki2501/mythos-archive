// 构建云端静态站到 dist/web/
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const ENV_ID = process.env.CLOUDBASE_ENV || "";
const API_URL = process.env.CLOUDBASE_API_URL || "";
const BRAND_ASSET = path.join(ROOT, "viewer", "assets", "archive-brand.webp");
const WITCH_SCRIPT = path.join(ROOT, "viewer", "witch-assistant.js");
const WITCH_DESKTOP_ASSET = path.join(
  ROOT,
  "viewer",
  "assets",
  "witch-desktop-v2.webp",
);
const WITCH_CUBE_ASSET = path.join(
  ROOT,
  "viewer",
  "assets",
  "witch-cube-v1.webp",
);
const BRAND_URL = "./archive-brand.webp?v=20260921-brand";
const STATIC_VERSION = "20260921-witch-v5";
const PUBLIC_ORIGIN = String(process.env.ARCHIVE_PUBLIC_ORIGIN || "").replace(/\/+$/, "");
if (!ENV_ID || !API_URL) {
  console.error(
    "请先设置环境变量 CLOUDBASE_ENV 与 CLOUDBASE_API_URL 后再构建。详见《部署说明书》。",
  );
  process.exit(1);
}

const built = spawnSync(process.execPath, ["scripts/build-html.mjs"], {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env,
});
if (built.status !== 0) process.exit(built.status || 1);

// 确保浏览器 SDK 包存在
const vendorSrc = path.join(ROOT, "viewer", "vendor", "cloudbase.iife.js");
if (!fs.existsSync(vendorSrc)) {
  console.error("缺少 viewer/vendor/cloudbase.iife.js，请先打包 SDK");
  process.exit(1);
}

const css = fs.readFileSync(path.join(ROOT, "viewer", "viewer.css"), "utf8");
const cloudClient = fs.readFileSync(
  path.join(ROOT, "viewer", "cloud-client.js"),
  "utf8",
);
const js = fs.readFileSync(path.join(ROOT, "viewer", "viewer.js"), "utf8");
const witchScript = fs.readFileSync(WITCH_SCRIPT, "utf8");
const offline = fs.readFileSync(
  path.join(ROOT, "dist", "幻梦境档案馆.html"),
  "utf8",
);
const dataMatch =
  /window\.ARCHIVE_DATA = JSON\.parse\(([\s\S]*?)\);\s*<\/script>/.exec(
    offline,
  );
if (!dataMatch) throw new Error("无法从离线 HTML 提取 ARCHIVE_DATA");
const payloadLiteral = dataMatch[1];
const fullPayload = JSON.parse(JSON.parse(payloadLiteral));
const webPayloadObject = {
  editions: (fullPayload.editions || []).map((edition) => ({
    ...edition,
    works: (edition.works || []).map((work) => {
      const { html, sections, authorQQ, ...catalogueWork } = work;
      return catalogueWork;
    }),
  })),
};
const webPayload = JSON.stringify(webPayloadObject)
  .replace(/</g, "\\u003c")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");
const dataScript = `window.ARCHIVE_STATIC_VERSION = ${JSON.stringify(STATIC_VERSION)};\nwindow.ARCHIVE_DATA = JSON.parse(${JSON.stringify(webPayload)});\n`;

function writeArchiveContent(outputDir, payload) {
  const root = path.join(outputDir, "archive-content");
  fs.rmSync(root, { recursive: true, force: true });
  let files = 0;
  let bytes = 0;
  for (const edition of payload.editions || []) {
    for (const work of edition.works || []) {
      const dir = path.join(root, edition.slug);
      fs.mkdirSync(dir, { recursive: true });
      const target = path.join(dir, `${work.slug}.html`);
      fs.writeFileSync(target, work.html || "", "utf8");
      files += 1;
      bytes += fs.statSync(target).size;
    }
  }
  return { files, bytes };
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function trimText(value, limit = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function displayWorkNo(work) {
  return String(work && work.no != null ? work.no : "").padStart(3, "0");
}

function articlePath(edition, work) {
  return `/${encodeURIComponent(edition.slug)}/${displayWorkNo(work)}`;
}

function publicUrl(pathname) {
  return `${PUBLIC_ORIGIN}${pathname}` || pathname;
}

function renderPrerenderArticle(edition, work) {
  const anonymous =
    !work.author ||
    work.authorStatus === "anonymous" ||
    work.author === "未见署名" ||
    work.author === "匿名";
  const author = work.author || "未见署名";
  const status = edition.status === "archived" ? "已封存" : "当前收录";
  const excerpt = trimText(work.excerpt || "", 180);
  const authorNote = anonymous
    ? edition.status === "archived"
      ? "历史资料未载明作者，按原件封存"
      : "身份将在结果公示后解封"
    : "";
  const editionLink = `/#/${encodeURIComponent(edition.slug)}`;

  return `<div class="reader-frame prerender-reader">
  <div class="sheet">
    <header class="work-head">
      <nav class="work-backlinks" aria-label="文章位置">
        <a href="/">返回首页</a>
        <span>·</span>
        <a href="${editionLink}">返回本卷</a>
      </nav>
      <p class="work-fileno"><span class="work-fileno-vol">${escapeHtml(edition.year)} 卷</span><span class="work-fileno-slash">/</span><span class="work-fileno-no">${escapeHtml(displayWorkNo(work))}</span></p>
      <h1 class="work-title">${escapeHtml(work.title)}</h1>
      <p class="work-meta"><span class="work-meta-author">${escapeHtml(author)}</span><span class="work-meta-sep">·</span><span class="work-meta-chars">约 ${escapeHtml(work.chars)} 字</span></p>
      ${authorNote ? `<p class="work-anon-note">${escapeHtml(authorNote)}</p>` : ""}
      <p class="work-provenance"><span class="work-provenance-edition">${escapeHtml(edition.shortName)}</span><span class="work-provenance-sep">·</span><span class="work-provenance-phase">${escapeHtml(status)}</span></p>
      ${excerpt ? `<p class="prerender-excerpt"><strong>首段：</strong>${escapeHtml(excerpt)}</p>` : ""}
    </header>
    <div class="work-body">${work.html || "<p>正文暂未发布。</p>"}</div>
  </div>
</div>`;
}

function renderPrerenderPage(baseHtml, edition, work) {
  const pathname = articlePath(edition, work);
  const title = `${work.title} · ${edition.shortName} | 幻梦境档案馆`;
  const description = trimText(
    work.excerpt || `${edition.shortName} · ${work.title}`,
    180,
  );
  const canonical = publicUrl(pathname);
  const route = `#/${edition.slug}/${encodeURIComponent(work.slug)}`;
  const socialMeta = `
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${escapeHtml(publicUrl("/archive-brand.webp"))}">
<meta property="og:site_name" content="幻梦境档案馆">
<meta name="twitter:card" content="summary">
`;

  return baseHtml
    .replace('<title>幻梦境档案馆</title>', `<title>${escapeHtml(title)}</title>`)
    .replace(
      '<meta name="description" content="幻梦境档案馆：文学期刊式的神话造物档案、阅读与评议空间。">',
      `<meta name="description" content="${escapeHtml(description)}">`,
    )
    .replace("</head>", `${socialMeta}</head>`)
    .replace('<body class="is-booting">', "<body>")
    .replace(
      '<div class="layout" id="layout" aria-hidden="true">',
      '<div class="layout" id="layout">',
    )
    .replace(
      '<main class="content" id="content"></main>',
      `<main class="content" id="content">${renderPrerenderArticle(edition, work)}</main>`,
    )
    .replace(
      `<script src="./cloud-client.js?v=${STATIC_VERSION}">`,
      `<script>window.ARCHIVE_INITIAL_ROUTE = ${JSON.stringify(route)};</script>\n<script src="./cloud-client.js?v=${STATIC_VERSION}">`,
    )
    .replaceAll('href="./', 'href="/')
    .replaceAll('src="./', 'src="/');
}

function writePrerenderPages(outputDir, payload, baseHtml) {
  let files = 0;
  let bytes = 0;
  for (const edition of payload.editions || []) {
    const editionDir = path.join(outputDir, edition.slug);
    fs.rmSync(editionDir, { recursive: true, force: true });
    for (const work of edition.works || []) {
      const targetDir = path.join(editionDir, displayWorkNo(work));
      fs.mkdirSync(targetDir, { recursive: true });
      const target = path.join(targetDir, "index.html");
      const page = renderPrerenderPage(baseHtml, edition, work);
      fs.writeFileSync(target, page, "utf8");
      files += 1;
      bytes += Buffer.byteLength(page);
    }
  }
  return { files, bytes };
}

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" type="image/webp" href="${BRAND_URL}">
<title>幻梦境档案馆</title>
<meta name="description" content="幻梦境档案馆：文学期刊式的神话造物档案、阅读与评议空间。">
<meta name="color-scheme" content="light dark">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta name="mythos-build" content="2026-09-20-home-spotlight">
<script>
(function(){try{var t=localStorage.getItem("mythos.theme");if(!t&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)t="dark";document.documentElement.dataset.theme=t==="dark"?"dark":"light";}catch(e){}})();
</script>
<link rel="stylesheet" href="./viewer.css?v=${STATIC_VERSION}">
</head>
<body class="is-booting">
<header class="site-bar" id="site-bar">
  <button type="button" class="site-brand" id="site-brand" aria-label="返回档案首页">
    <span class="site-brand-mark" aria-hidden="true"><img src="${BRAND_URL}" alt=""></span>
    <span class="site-brand-text">幻梦境档案馆</span>
  </button>
  <nav class="site-nav" id="site-nav" aria-label="主要导航">
    <button type="button" data-nav="spotlight">今日聚光</button>
    <button type="button" data-nav="catalogue">本届目录</button>
    <button type="button" data-nav="archive">历届档案</button>
    <button type="button" data-nav="guide">评议说明</button>
    <button type="button" data-nav="search">全馆搜索</button>
  </nav>
  <button type="button" class="site-account-link" id="site-account-link">调查员入口</button>
</header>
<div class="top-tools" id="top-tools">
  <button type="button" class="top-more" id="top-more" aria-controls="top-menu" aria-expanded="false" aria-label="更多操作">⋯</button>
  <div class="top-menu" id="top-menu">
    <button type="button" class="top-global-search" id="top-global-search">全馆搜索</button>
    <button type="button" class="top-jump" id="top-jump" hidden>↓ 投票区</button>
    <div class="account-hud" id="account-hud" hidden></div>
    <button type="button" class="theme-toggle" id="theme-toggle" aria-label="切换到黑夜模式" title="切换到黑夜模式">☾ 黑夜</button>
  </div>
</div>
<div class="boot-splash" id="boot-splash">
  <div class="boot-splash-dot" aria-hidden="true"></div>
  <div class="boot-splash-title">正在开启梦之门…</div>
  <div class="boot-splash-sub">幻梦境档案馆</div>
</div>
<div class="auth-gate" id="auth-gate" hidden></div>
<div class="modal-root" id="modal-root" hidden></div>
<div class="toast-root" id="toast-root" role="status" aria-live="polite" aria-atomic="true" hidden></div>
<button type="button" class="sidebar-backdrop" id="sidebar-backdrop" hidden aria-label="关闭目录"></button>

<div class="layout" id="layout" aria-hidden="true">
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-head">
      <h1 class="site-title">幻梦境档案馆</h1>
      <p class="site-sub" id="site-sub">历届参赛作品合集</p>
      <select class="edition-select" id="edition-select" aria-label="选择届别"></select>
      <input class="search-box" id="search" type="search" placeholder="搜索标题或编号" aria-label="搜索作品">
    </div>
    <div class="account-bar" id="account-bar"></div>
    <nav class="toc" id="toc" aria-label="作品目录"></nav>
  </aside>
  <button class="sidebar-toggle" id="sidebar-toggle" type="button" aria-controls="sidebar" aria-expanded="true" title="收起目录">‹</button>
  <main class="content" id="content"></main>
</div>
<nav class="hud-pager" id="hud-pager" aria-label="上下篇" hidden>
  <button class="hud-btn hud-prev" id="hud-prev" type="button" aria-label="上一篇" disabled>‹</button>
  <button class="hud-btn hud-next" id="hud-next" type="button" aria-label="下一篇" disabled>›</button>
</nav>
<nav class="mobile-bar" id="mobile-bar" aria-label="翻页与目录">
  <button class="mobile-bar-btn mobile-bar-prev" id="mobile-bar-prev" type="button" aria-label="上一篇" disabled>‹ 上一篇</button>
  <button class="mobile-bar-btn mobile-bar-toc" id="mobile-bar-toc" type="button" aria-controls="sidebar" aria-expanded="false">☰ 目录</button>
  <button class="mobile-bar-btn mobile-bar-next" id="mobile-bar-next" type="button" aria-label="下一篇" disabled>下一篇 ›</button>
</nav>

<script src="./cloudbase.iife.js"></script>
<script>
window.ARCHIVE_CLOUD = {
  envId: ${JSON.stringify(ENV_ID)},
  apiUrl: ${JSON.stringify(API_URL)}
};
</script>
<script src="./archive-data.js?v=${STATIC_VERSION}"></script>
<script src="./cloud-client.js?v=${STATIC_VERSION}"></script>
<script src="./witch-assistant.js?v=${STATIC_VERSION}"></script>
<script src="./viewer.js?v=${STATIC_VERSION}"></script>
</body>
</html>
`;

const outDir = path.join(ROOT, "dist", "web");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");
fs.writeFileSync(path.join(outDir, "viewer.css"), css, "utf8");
fs.writeFileSync(path.join(outDir, "cloud-client.js"), cloudClient, "utf8");
fs.writeFileSync(path.join(outDir, "witch-assistant.js"), witchScript, "utf8");
fs.writeFileSync(path.join(outDir, "viewer.js"), js, "utf8");
fs.writeFileSync(path.join(outDir, "archive-data.js"), dataScript, "utf8");
const archiveContent = writeArchiveContent(outDir, fullPayload);
const prerenderPages = writePrerenderPages(outDir, fullPayload, html);
fs.copyFileSync(vendorSrc, path.join(outDir, "cloudbase.iife.js"));
const archiveAssets = path.join(ROOT, "dist", "archive-assets");
if (fs.existsSync(archiveAssets)) {
  fs.cpSync(archiveAssets, path.join(outDir, "archive-assets"), { recursive: true });
}
if (!fs.existsSync(BRAND_ASSET)) throw new Error(`缺少品牌素材：${BRAND_ASSET}`);
fs.copyFileSync(BRAND_ASSET, path.join(outDir, "archive-brand.webp"));
if (!fs.existsSync(WITCH_DESKTOP_ASSET)) {
  throw new Error(`缺少小女巫桌面素材：${WITCH_DESKTOP_ASSET}`);
}
if (!fs.existsSync(WITCH_CUBE_ASSET)) {
  throw new Error(`缺少小女巫方块素材：${WITCH_CUBE_ASSET}`);
}
const witchAssetDir = path.join(outDir, "assets");
fs.mkdirSync(witchAssetDir, { recursive: true });
fs.copyFileSync(
  WITCH_DESKTOP_ASSET,
  path.join(witchAssetDir, "witch-desktop-v2.webp"),
);
fs.copyFileSync(
  WITCH_CUBE_ASSET,
  path.join(witchAssetDir, "witch-cube-v1.webp"),
);
fs.rmSync(path.join(outDir, "archive-brand.png"), { force: true });
console.log("web out=", path.join(outDir, "index.html"));
console.log("envId=", ENV_ID);
console.log("apiUrl=", API_URL);
console.log(
  "catalogue payload=",
  (Buffer.byteLength(webPayload) / 1024).toFixed(1),
  "KB (full=",
  (Buffer.byteLength(JSON.stringify(fullPayload)) / 1024 / 1024).toFixed(2),
  "MB)",
);
console.log(
  "archive content=",
  archiveContent.files,
  "files",
  (archiveContent.bytes / 1024 / 1024).toFixed(2),
  "MB",
);
console.log(
  "prerender pages=",
  prerenderPages.files,
  "files",
  (prerenderPages.bytes / 1024 / 1024).toFixed(2),
  "MB",
);
console.log("size=", (Buffer.byteLength(html) / 1024 / 1024).toFixed(2), "MB");
console.log("witch asset=", path.join(witchAssetDir, "witch-desktop-v2.webp"));
console.log("witch cube=", path.join(witchAssetDir, "witch-cube-v1.webp"));
