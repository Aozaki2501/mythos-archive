// 构建自托管静态站到 dist/web/
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const API_URL = process.env.ARCHIVE_API_URL || "/api";
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
const WITCH_EXPRESSION_ASSETS = [
  "witch-expression-eyes-closed.webp",
  "witch-expression-soft-smile.webp",
  "witch-expression-puzzled.webp",
  "witch-expression-half-lidded.webp",
  "witch-expression-surprised.webp",
];
const BRAND_URL = "./archive-brand.webp?v=20260921-brand";
const STATIC_VERSION = "20260929-atmosphere-v2";
const BUILD_DATE = STATIC_VERSION.slice(0, 8).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3");
const PUBLIC_ORIGIN = String(process.env.ARCHIVE_PUBLIC_ORIGIN || "").replace(/\/+$/, "");
const built = spawnSync(process.execPath, ["scripts/build-html.mjs"], {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env,
});
if (built.status !== 0) process.exit(built.status || 1);

const css = fs.readFileSync(path.join(ROOT, "viewer", "viewer.css"), "utf8");
const apiClient = fs.readFileSync(
  path.join(ROOT, "viewer", "mythos-client.js"),
  "utf8",
);
const guidesScript = fs.readFileSync(
  path.join(ROOT, "viewer", "archive-guides.js"),
  "utf8",
);
const js = fs.readFileSync(path.join(ROOT, "viewer", "viewer.js"), "utf8");
const dreamGateScript = fs.readFileSync(
  path.join(ROOT, "viewer", "dream-gate.js"),
  "utf8",
);
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
const isPublicEdition = (edition) =>
  edition && (edition.status === "archived" || edition.status === "published");
const webPayloadObject = {
  editions: (fullPayload.editions || []).filter(isPublicEdition).map((edition) => ({
    ...edition,
    works: (edition.works || []).map((work) => {
      const { html, sections, authorQQ, ...catalogueWork } = work;
      const anonymous =
        edition.status !== "archived" ||
        !catalogueWork.author ||
        catalogueWork.authorStatus === "anonymous" ||
        catalogueWork.author === "未见署名" ||
        catalogueWork.author === "匿名";
      if (anonymous) catalogueWork.author = edition.status === "archived" ? "匿名" : "未见署名";
      return catalogueWork;
    }),
  })),
};
const webPayload = JSON.stringify(webPayloadObject)
  .replace(/</g, "\\u003c")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");
const dataScript = `window.ARCHIVE_STATIC_VERSION = ${JSON.stringify(STATIC_VERSION)};\nwindow.ARCHIVE_BUILD_DATE = ${JSON.stringify(BUILD_DATE)};\nwindow.ARCHIVE_PUBLIC_ORIGIN = ${JSON.stringify(PUBLIC_ORIGIN)};\nwindow.ARCHIVE_DATA = JSON.parse(${JSON.stringify(webPayload)});\n`;

function writeArchiveContent(outputDir, payload) {
  const root = path.join(outputDir, "archive-content");
  fs.rmSync(root, { recursive: true, force: true });
  let files = 0;
  let bytes = 0;
  for (const edition of payload.editions || []) {
    if (!isPublicEdition(edition)) continue;
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
    edition.status !== "archived" ||
    !work.author ||
    work.authorStatus === "anonymous" ||
    work.author === "未见署名" ||
    work.author === "匿名";
  const author = anonymous ? "未见署名" : work.author || "未见署名";
  const status = edition.status === "archived" ? "已封存" : "当前收录";
  const excerpt = trimText(work.excerpt || "", 180);
  const authorNote = anonymous
    ? edition.status === "archived"
      ? "作者按本届公示规则匿名"
      : "作者身份将在结果公示时按获奖范围解封"
    : "";
  const editionLink = `/#/${encodeURIComponent(edition.slug)}`;
  const volumeNumber = Number(edition.year) - 2021;
  const volumeNames = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  const volumeLabel = volumeNames[volumeNumber]
    ? `第${volumeNames[volumeNumber]}卷`
    : `${edition.year} 卷`;
  const category = String(edition.shortName || edition.name || "")
    .replace(/^\d+\s*/, "")
    .replace(/设计大赛$/, "");
  const chars = Number(work.chars) || 0;
  const minutes = chars ? Math.max(1, Math.ceil(chars / 400)) : 0;
  const sectionCount = Array.isArray(work.sections) ? work.sections.length : 0;

  return `<div class="reader-frame prerender-reader">
  <div class="sheet">
    <header class="work-head">
      <nav class="work-backlinks" aria-label="文章位置">
        <a href="/">返回首页</a>
        <span>·</span>
        <a href="${editionLink}">返回本卷</a>
      </nav>
      <div class="work-card">
        <div class="work-card-top"><span class="work-card-label">幻梦境档案馆 · 馆藏卡</span><span class="work-card-number">No. ${escapeHtml(edition.year)} / ${escapeHtml(displayWorkNo(work))}</span></div>
        <div class="work-card-body">
          <p class="work-fileno"><span class="work-fileno-vol">${escapeHtml(volumeLabel)}</span><span class="work-fileno-slash">·</span><span class="work-fileno-no">${escapeHtml(category)}</span></p>
          <h1 class="work-title">${escapeHtml(work.title)}</h1>
          <div class="work-card-fields work-card-fields-primary">
            <div class="work-card-field"><span class="work-card-field-label">篇幅</span><strong class="work-card-field-value">${escapeHtml(chars)} 字${minutes ? ` · 约 ${minutes} 分钟` : ""}</strong></div>
          </div>
          <details class="work-meta-details">
            <summary>档案资料</summary>
            <div class="work-meta-details-body">
          <div class="work-card-fields work-card-fields-secondary">
            <div class="work-card-field"><span class="work-card-field-label">阶段</span><strong class="work-card-field-value">${escapeHtml(status)}</strong></div>
            <div class="work-card-field${anonymous ? " is-anonymous" : ""}"><span class="work-card-field-label">作者</span><strong class="work-card-field-value">${escapeHtml(anonymous ? "匿名" : author)}</strong></div>
            <div class="work-card-field"><span class="work-card-field-label">章节</span><strong class="work-card-field-value">${sectionCount ? `${sectionCount} 节` : "正文"}</strong></div>
          </div>
          ${authorNote ? `<p class="work-anon-note">${escapeHtml(authorNote)}</p>` : ""}
          ${excerpt ? `<p class="prerender-excerpt"><strong>首段：</strong>${escapeHtml(excerpt)}</p>` : ""}
            </div>
          </details>
        </div>
        <span class="work-card-hole" aria-hidden="true"></span>
      </div>
    </header>
    <div class="work-body${edition.slug === "2026" && Number(work.no) === 34 ? " work-no-indent" : ""}">${work.html || "<p>正文暂未发布。</p>"}</div>
    <div class="work-end-mark" role="separator"><div class="work-end-ornament" aria-hidden="true"><span>✦</span><span>✦</span><span>✦</span></div><div class="work-end-title">本篇完</div><p class="work-end-meta">${escapeHtml(edition.shortName)} · 档号 ${escapeHtml(displayWorkNo(work))} · ${escapeHtml(chars)} 字</p><p class="work-end-prompt">读完了？在下方留下你的评论 ↓</p></div>
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
    .replace(DREAM_GATE_MARKUP, "")
    .replace(BOOT_ERROR_MARKUP, "")
    .replace(
      '<div class="layout" id="layout" aria-hidden="true">',
      '<div class="layout" id="layout">',
    )
    .replace(
      '<main class="content" id="content"></main>',
      `<main class="content" id="content">${renderPrerenderArticle(edition, work)}</main>`,
    )
    .replace(
      `<script src="./mythos-client.js?v=${STATIC_VERSION}">`,
      `<script>window.ARCHIVE_INITIAL_ROUTE = ${JSON.stringify(route)};</script>\n<script src="./mythos-client.js?v=${STATIC_VERSION}">`,
    )
    .replaceAll('href="./', 'href="/')
    .replaceAll('src="./', 'src="/');
}

function writePrerenderPages(outputDir, payload, baseHtml) {
  let files = 0;
  let bytes = 0;
  for (const edition of payload.editions || []) {
    if (!isPublicEdition(edition)) continue;
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

/* 梦门开场：结构放在 body 最前面，控制器紧随其后立即接管，
   让开场在首帧就位，不先闪一下旧的启动转圈。
   prerender 的深链接页面不带这一段，直接展示正文。 */
const DREAM_GATE_MARKUP = `<section class="dream-gate" id="dream-gate" hidden tabindex="-1" role="dialog" aria-modal="true" aria-label="幻梦境开场" aria-labelledby="dream-gate-title">
  <div class="dream-gate__sky" aria-hidden="true"></div>
  <div class="dream-gate__stage" aria-hidden="true">
    <svg class="dream-gate__svg" viewBox="0 0 400 400" focusable="false">
      <defs>
        <clipPath id="dg-arch-clip"><path d="M152 300V178a48 48 0 0 1 96 0v122z"/></clipPath>
        <clipPath id="dg-leaf-left"><rect x="150" y="120" width="50" height="182"/></clipPath>
        <clipPath id="dg-leaf-right"><rect x="200" y="120" width="50" height="182"/></clipPath>
        <radialGradient id="dg-light" cx="50%" cy="62%" r="70%">
          <stop offset="0" stop-color="var(--dg-light-core)"/>
          <stop offset="1" stop-color="var(--dg-light)"/>
        </radialGradient>
        <linearGradient id="dg-leaf-paint" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#262e48"/>
          <stop offset="0.72" stop-color="#151b2b"/>
          <stop offset="1" stop-color="#3a2530"/>
        </linearGradient>
        <linearGradient id="dg-spill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--dg-light-core)" stop-opacity="0.5"/>
          <stop offset="1" stop-color="var(--dg-light-core)" stop-opacity="0"/>
        </linearGradient>
        <g id="dg-door-paint">
          <rect x="150" y="120" width="100" height="182" fill="url(#dg-leaf-paint)"/>
          <circle cx="200" cy="186" r="17" fill="var(--dg-text)"/>
          <circle cx="208" cy="181" r="15" fill="#262e48"/>
          <g stroke="var(--dg-text)" stroke-opacity="0.2" stroke-width="1">
            <path d="M160 262h80M163 272h74M166 282h68M169 292h62"/>
          </g>
        </g>
      </defs>

      <g class="dream-gate__starfield"></g>

      <!-- 星环后半圈：从拱门背后绕过 -->
      <path class="dream-gate__ring dream-gate__ring--back" pathLength="1"
            d="M34 262A170 50 -10 0 1 366 204"/>

      <!-- 拱门：门里是光，门扇上画着月与海 -->
      <g class="dream-gate__door">
        <g clip-path="url(#dg-arch-clip)">
          <rect class="dream-gate__light" x="150" y="120" width="100" height="182" fill="url(#dg-light)"/>
          <rect class="dream-gate__light-flat" x="150" y="120" width="100" height="182"/>
          <g class="dream-gate__leaf dream-gate__leaf--left" clip-path="url(#dg-leaf-left)"><use href="#dg-door-paint"/></g>
          <g class="dream-gate__leaf dream-gate__leaf--right" clip-path="url(#dg-leaf-right)"><use href="#dg-door-paint"/></g>
          <path class="dream-gate__seam" d="M200 130v170"/>
        </g>
        <path class="dream-gate__frame" pathLength="1" d="M152 300V178a48 48 0 0 1 96 0v122"/>
        <path class="dream-gate__frame dream-gate__frame--outer" pathLength="1" d="M143 300V178a57 57 0 0 1 114 0v122"/>
        <path class="dream-gate__spill" d="M152 301h96l52 60H100z" fill="url(#dg-spill)"/>
        <path class="dream-gate__step" d="M112 301h176M128 311h144"/>
      </g>

      <!-- 星环前半圈与小火车 -->
      <path class="dream-gate__ring dream-gate__ring--front" pathLength="1"
            d="M34 262A170 50 -10 0 0 366 204"/>
      <g class="dream-gate__steam"></g>
      <g class="dream-gate__train">
        <g class="dream-gate__car" data-car="0">
          <rect x="-9" y="-6" width="18" height="9" rx="2"/>
          <rect x="3" y="-11" width="4" height="6" rx="1"/>
          <circle cx="-5" cy="4" r="2" class="dream-gate__wheel"/><circle cx="5" cy="4" r="2" class="dream-gate__wheel"/>
        </g>
        <g class="dream-gate__car" data-car="1">
          <rect x="-8" y="-7" width="16" height="10" rx="2"/>
          <path d="M-5 -4h3v3h-3zM2 -4h3v3h-3z" class="dream-gate__window"/>
          <circle cx="-4" cy="4" r="2" class="dream-gate__wheel"/><circle cx="4" cy="4" r="2" class="dream-gate__wheel"/>
        </g>
        <g class="dream-gate__car" data-car="2">
          <rect x="-8" y="-7" width="16" height="10" rx="2"/>
          <path d="M-5 -4h3v3h-3zM2 -4h3v3h-3z" class="dream-gate__window"/>
          <circle cx="-4" cy="4" r="2" class="dream-gate__wheel"/><circle cx="4" cy="4" r="2" class="dream-gate__wheel"/>
        </g>
      </g>
    </svg>
  </div>
  <div class="dream-gate__copy">
    <div class="dream-gate__eyebrow">BEYOND THE WAKING WORLD</div>
    <h2 class="dream-gate__title" id="dream-gate-title">正在开启梦之门</h2>
    <div class="dream-gate__sub">翻过此页，梦境有了回声</div>
  </div>
  <div class="dream-gate__brand">幻梦境档案馆</div>
  <p class="dream-gate__hint">点击任意位置或按 Esc 跳过开场</p>
</section>
<script src="./dream-gate.js?v=${STATIC_VERSION}"></script>
<script>
/* 同一标签页只播放一次：后续刷新或跳转直接用静态启动态，
   不必为了重复看动画拖慢正常导航。存储不可用时照常播放。 */
(function () {
  try {
    if (sessionStorage.getItem("mythos.dreamGateShown")) return;
    sessionStorage.setItem("mythos.dreamGateShown", "1");
  } catch (error) {
    /* 隐私模式等禁用存储的场景，直接播放一次 */
  }
  window.DreamGate && window.DreamGate.show({ maxWait: 12000 });
})();
</script>`;

/* 启动失败面板：只挂在主入口。深链接的 prerender 页面正文是静态内容，
   不依赖接口，遇到接口异常时走原来的登录门兜底，不需要这块全屏面板。 */
const BOOT_ERROR_MARKUP = `<div class="boot-error" id="boot-error" hidden>
  <h2 class="boot-error-title">暂时打不开档案馆</h2>
  <p class="boot-error-copy" id="boot-error-copy"></p>
  <div class="boot-error-actions">
    <button type="button" class="btn" id="boot-error-retry">重试</button>
    <button type="button" class="btn-ghost" id="boot-error-gate">仍要进入登录页</button>
  </div>
</div>`;
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" type="image/webp" href="${BRAND_URL}">
<meta name="theme-color" content="#f5f4ef">
<title>幻梦境档案馆</title>
<meta name="description" content="幻梦境档案馆：文学期刊式的神话造物档案、阅读与评议空间。">
<meta name="color-scheme" content="light dark">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta name="mythos-build" content="2026-09-20-home-spotlight">
<script>
(function(){try{var t=localStorage.getItem("mythos.theme");if(!t&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)t="dark";var d=t==="dark";document.documentElement.dataset.theme=d?"dark":"light";var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",d?"#11141b":"#f5f4ef");}catch(e){}})();
</script>
<link rel="stylesheet" href="./viewer.css?v=${STATIC_VERSION}">
</head>
<body class="is-booting">
${DREAM_GATE_MARKUP}
<header class="site-bar" id="site-bar">
  <button type="button" class="site-brand" id="site-brand" aria-label="返回档案首页">
    <span class="site-brand-mark" aria-hidden="true"><img src="${BRAND_URL}" alt=""></span>
    <span class="site-brand-text">幻梦境档案馆</span>
  </button>
  <nav class="site-nav" id="site-nav" aria-label="主要导航">
    <button type="button" data-nav="spotlight">今日聚光</button>
    <button type="button" data-nav="catalogue">本届目录</button>
    <button type="button" data-nav="archive">历届档案</button>
    <button type="button" data-nav="results" hidden>投票公示</button>
  </nav>
  <div class="site-search" id="site-search">
    <div class="site-search-box">
      <span class="site-search-icon" aria-hidden="true">⌕</span>
      <input class="site-search-input" id="site-search-input" type="search" placeholder="搜索档案、作者或编号" aria-label="全馆搜索" autocomplete="off">
      <span class="site-search-key" aria-hidden="true">/</span>
    </div>
    <div class="site-search-panel" id="site-search-panel" hidden></div>
  </div>
  <button type="button" class="site-account-link" id="site-account-link">调查员入口</button>
<div class="top-tools" id="top-tools">
  <button type="button" class="top-more" id="top-more" aria-controls="top-menu" aria-expanded="false" aria-label="更多入口" title="更多入口">更多</button>
  <div class="top-menu" id="top-menu">
    <button type="button" class="top-results" id="top-results" hidden>投票公示</button>
    <button type="button" class="top-guide" id="top-guide">评议说明</button>
    <button type="button" class="top-reading" id="top-reading">我的阅读</button>
    <button type="button" class="top-notifications" id="top-notifications" hidden>站内通知 <span class="notification-count" id="notification-count" hidden></span></button>
    <div class="account-hud" id="account-hud" hidden></div>
    <button type="button" class="theme-toggle" id="theme-toggle" aria-label="切换到黑夜模式" title="切换到黑夜模式">☾ 黑夜</button>
  </div>
</div>
</header>
<div class="boot-splash" id="boot-splash">
  <div class="boot-splash-dot" aria-hidden="true"></div>
  <div class="boot-splash-title">正在开启梦之门…</div>
  <div class="boot-splash-sub">幻梦境档案馆</div>
</div>
<div class="public-mode-notice" id="public-mode-notice" role="status" aria-live="polite" hidden></div>
${BOOT_ERROR_MARKUP}
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

<script>
window.ARCHIVE_API_URL = ${JSON.stringify(API_URL)};
</script>
<script src="./archive-data.js?v=${STATIC_VERSION}"></script>
<script src="./archive-guides.js?v=${STATIC_VERSION}"></script>
<script src="./mythos-client.js?v=${STATIC_VERSION}"></script>
<script src="./purify.min.js?v=${STATIC_VERSION}"></script>
<script src="./witch-assistant.js?v=${STATIC_VERSION}"></script>
<script src="./viewer.js?v=${STATIC_VERSION}"></script>
</body>
</html>
`;

const outDir = path.join(ROOT, "dist", "web");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");
fs.writeFileSync(path.join(outDir, "viewer.css"), css, "utf8");
fs.writeFileSync(path.join(outDir, "archive-guides.js"), guidesScript, "utf8");
fs.writeFileSync(path.join(outDir, "mythos-client.js"), apiClient, "utf8");
fs.copyFileSync(path.join(ROOT, "node_modules", "dompurify", "dist", "purify.min.js"), path.join(outDir, "purify.min.js"));
fs.writeFileSync(path.join(outDir, "dream-gate.js"), dreamGateScript, "utf8");
fs.writeFileSync(path.join(outDir, "witch-assistant.js"), witchScript, "utf8");
fs.writeFileSync(path.join(outDir, "viewer.js"), js, "utf8");
fs.writeFileSync(path.join(outDir, "archive-data.js"), dataScript, "utf8");
const archiveContent = writeArchiveContent(outDir, fullPayload);
const prerenderPages = writePrerenderPages(outDir, fullPayload, html);
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
for (const assetName of [
  "dreamland-display-serif.woff2",
  "SOURCE-HAN-SERIF-LICENSE.txt",
  "DREAMLAND-DISPLAY-FONT-NOTICE.txt",
]) {
  const source = path.join(ROOT, "viewer", "assets", assetName);
  if (!fs.existsSync(source)) throw new Error(`缺少素材：${source}`);
  fs.copyFileSync(source, path.join(witchAssetDir, assetName));
}
fs.copyFileSync(
  WITCH_DESKTOP_ASSET,
  path.join(witchAssetDir, "witch-desktop-v2.webp"),
);
fs.copyFileSync(
  WITCH_CUBE_ASSET,
  path.join(witchAssetDir, "witch-cube-v1.webp"),
);
for (const assetName of WITCH_EXPRESSION_ASSETS) {
  const source = path.join(ROOT, "viewer", "assets", assetName);
  fs.copyFileSync(source, path.join(witchAssetDir, assetName));
}
fs.rmSync(path.join(outDir, "archive-brand.png"), { force: true });
console.log("web out=", path.join(outDir, "index.html"));
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
