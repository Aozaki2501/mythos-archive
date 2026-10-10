// 把 content/ 下的所有届与作品打包成一个可直接双击打开的 HTML。
// 用法: node scripts/build-html.mjs
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content");
const VIEWER_DIR = path.join(ROOT, "viewer");
const BRAND_ASSET = path.join(VIEWER_DIR, "assets", "archive-brand.webp");
const DISPLAY_FONT_ASSET = path.join(
  VIEWER_DIR,
  "assets",
  "dreamland-display-serif.woff2",
);
const DISPLAY_FONT_LICENSE = path.join(
  VIEWER_DIR,
  "assets",
  "SOURCE-HAN-SERIF-LICENSE.txt",
);
const DISPLAY_FONT_NOTICE = path.join(
  VIEWER_DIR,
  "assets",
  "DREAMLAND-DISPLAY-FONT-NOTICE.txt",
);
const BRAND_URL = "./archive-brand.webp?v=20260921-brand";
const OUT_FILE =
  process.env.OUT_FILE ?? path.join(ROOT, "dist", "幻梦境档案馆.html");
const BUILD_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Hong_Kong",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).formatToParts(new Date()).reduce((parts, part) => {
  if (part.type !== "literal") parts[part.type] = part.value;
  return parts;
}, {});
const BUILD_DATE_LABEL = `${BUILD_DATE.year}.${BUILD_DATE.month}.${BUILD_DATE.day}`;

marked.setOptions({ gfm: true, breaks: false });

function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { data: {}, body: raw };

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!field) continue;
    const value = field[2].trim();
    data[field[1]] = value.replace(/^["']|["']$/g, "").replace(/\\"/g, '"');
  }
  return { data, body: raw.slice(match[0].length) };
}

function slugify(text, used) {
  const base =
    String(text)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w\u4e00-\u9fff-]+/g, "")
      .slice(0, 40) || "section";
  let id = "sec-" + base;
  let n = 2;
  while (used.has(id)) {
    id = "sec-" + base + "-" + n;
    n += 1;
  }
  used.add(id);
  return id;
}

/** 从 Markdown 抽出章节目录，并给标题注入稳定 id。
 *  默认只有二级标题（## 传录 / ## 档案 / ## 引文）进右侧索引。
 *  若要把三级及以下标题也放进索引，在标题末尾加 {toc}，例如：
 *    ### 一、物件描述 {toc}
 *  页面上不会显示 {toc} 字样。 */
function renderBody(body) {
  const used = new Set();
  const sections = [];
  const renderer = new marked.Renderer();

  renderer.heading = function (token) {
    const raw = String(token.text || "").trim();
    const flagged = /\{\s*toc\s*\}\s*$/i.test(raw);
    const plain = raw
      .replace(/\s*\{\s*toc\s*\}\s*$/i, "")
      .replace(/<[^>]+>/g, "")
      .trim();
    const sectionTitle = plain
      .replace(/&(?:emsp|ensp|nbsp);/gi, " ")
      .replace(/&#(?:8194|8195|160);/gi, " ")
      .replace(/&#x(?:2002|2003|00a0);/gi, " ")
      .trim();
    const id = slugify(sectionTitle, used);
    let title = this.parser.parseInline(token.tokens);
    title = title.replace(/\s*\{\s*toc\s*\}\s*$/i, "").trim();

    // 二级标题默认入索引；更细的标题需显式 {toc}
    if (token.depth === 2 || (token.depth >= 3 && flagged)) {
      sections.push({ id, title: sectionTitle, level: token.depth });
    }
    return `<h${token.depth} id="${id}">${title}</h${token.depth}>\n`;
  };

  const html = marked.parse(body, { async: false, renderer });
  return { html, sections };
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16)),
    );
}

function plainTextFromHtml(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  );
}

const EXCERPT_LABEL_RE = new RegExp(
  "^(" +
    "#+.*" +
    "|——.*——" +
    "|[一二三四五六七八九十百壹贰叁肆伍陆柒捌玖拾]+([、.．].{0,10})?" +
    "|第.{1,4}[章节幕场部卷].{0,10}" +
    "|part\\s*\\d+.*" +
    "|rating\\s*[:：].*" +
    "|人物表|采风|游记|目录" +
    ")$",
  "i",
);

function excerptFromHtml(html, title) {
  const paragraphs = [...String(html || "").matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)]
    .map((match) => plainTextFromHtml(match[1]).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  let text = "";
  for (const paragraph of paragraphs) {
    const isLabel =
      paragraph === title ||
      EXCERPT_LABEL_RE.test(paragraph) ||
      (paragraph.length <= 8 && !/[。！？…”」』]$/.test(paragraph));
    if (isLabel) continue;
    text += (text ? " " : "") + paragraph;
    if (text.length >= 90) break;
  }
  return text || paragraphs[0] || "";
}

function countWpsWordsFromHtml(html) {
  const text = plainTextFromHtml(html);
  const han = text.match(/\p{Script=Han}/gu) || [];
  const nonHan = text.replace(/\p{Script=Han}/gu, " ");
  const words =
    nonHan.match(/[A-Za-z0-9]+(?:['’._:/-][A-Za-z0-9]+)*/g) || [];
  return han.length + words.length;
}

function readPublicationData(slug, filename, field) {
  const file = path.join(CONTENT_DIR, slug, filename);
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (
    data.schemaVersion !== 1 ||
    String(data.edition) !== slug ||
    !Array.isArray(data[field])
  ) {
    throw new Error(`公示数据格式错误：${file}`);
  }
  return data;
}

function validatePublicationLinks(slug, works, results, reviews) {
  const knownWorks = new Set(works.map((work) => work.slug));
  const rankedWorks = new Set();
  if (results && (!Number.isInteger(results.authorRevealRankLimit) || results.authorRevealRankLimit < 0)) {
    throw new Error(`作者公开名次上限无效：${slug}`);
  }
  for (const row of results?.rankings || []) {
    if (!knownWorks.has(row.workSlug) || rankedWorks.has(row.workSlug) || !Number.isInteger(row.rank) || row.rank < 1) {
      throw new Error(`公示排名与作品不匹配：${slug} / ${row.title || row.workSlug}`);
    }
    if (row.rank > results.authorRevealRankLimit && !row.award && row.author !== "匿名") {
      throw new Error(`超出公开名次的作者未匿名：${slug} / ${row.title || row.workSlug}`);
    }
    rankedWorks.add(row.workSlug);
  }
  for (const review of reviews?.reviews || []) {
    if (!knownWorks.has(review.workSlug) || !String(review.body || "").trim()) {
      throw new Error(`公示评语与作品不匹配：${slug} / ${review.workTitle || review.workSlug}`);
    }
  }
}

function applyPublicationAuthors(works, results) {
  if (!results) return;
  const rankingByWork = new Map(results.rankings.map((row) => [row.workSlug, row]));
  for (const work of works) {
    const publishedAuthor = rankingByWork.get(work.slug)?.author || "匿名";
    const anonymous = publishedAuthor === "匿名" || publishedAuthor === "未见署名";
    work.author = anonymous ? "匿名" : publishedAuthor;
    work.authorStatus = anonymous ? "anonymous" : "named";
    if (anonymous) work.authorQQ = "";
  }
}

function readEdition(slug) {
  const metaPath = path.join(CONTENT_DIR, slug, "edition.json");
  const meta = fs.existsSync(metaPath)
    ? JSON.parse(fs.readFileSync(metaPath, "utf8"))
    : {};

  const worksDir = path.join(CONTENT_DIR, slug, "works");
  const works = fs.existsSync(worksDir)
    ? fs
        .readdirSync(worksDir)
        .filter((name) => name.endsWith(".md"))
        .map((name) => {
          const raw = fs.readFileSync(path.join(worksDir, name), "utf8");
          const { data, body } = parseFrontmatter(raw);
          const { html, sections } = renderBody(body);
          const title = data.title || path.basename(name, ".md");
          return {
            slug: path.basename(name, ".md"),
            no: Number(data.no) || 0,
            title,
            author: data.author || "未见署名",
            authorStatus: data.authorStatus || "named",
            sourceFormat: data.sourceFormat || "markdown",
            authorQQ: String(data.authorQQ || data.author_qq || "").trim(),
            chars: countWpsWordsFromHtml(html),
            excerpt: data.excerpt || excerptFromHtml(html, title),
            sections,
            html,
          };
        })
        .sort((a, b) => a.no - b.no)
    : [];

  const results = readPublicationData(slug, "results.json", "rankings");
  const reviews = readPublicationData(slug, "reviews.json", "reviews");
  validatePublicationLinks(slug, works, results, reviews);
  applyPublicationAuthors(works, results);

  return {
    slug,
    year: meta.year ?? Number(slug) ?? 0,
    name: meta.name ?? slug,
    shortName: meta.shortName ?? slug,
    status: meta.status ?? "placeholder",
    intro: meta.intro ?? "",
    note: meta.note ?? "",
    sourceFormat: meta.sourceFormat ?? "",
    sourceFolder: meta.sourceFolder ?? "",
    awards: meta.awards ?? {},
    results,
    reviews,
    works,
  };
}

const editions = fs
  .readdirSync(CONTENT_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => readEdition(entry.name))
  .sort((a, b) => b.year - a.year);

function copyArchiveAssets(outputDir) {
  const targetRoot = path.join(outputDir, "archive-assets");
  let copiedFiles = 0;
  let copiedBytes = 0;
  for (const edition of editions) {
    const sourceRoot = path.join(CONTENT_DIR, edition.slug, "assets");
    if (!fs.existsSync(sourceRoot)) continue;
    const target = path.join(targetRoot, edition.slug);
    fs.mkdirSync(target, { recursive: true });
    for (const workEntry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
      if (!workEntry.isDirectory()) continue;
      const sourceWork = path.join(sourceRoot, workEntry.name);
      const targetWork = path.join(target, workEntry.name);
      fs.cpSync(sourceWork, targetWork, { recursive: true });
      const pending = [targetWork];
      while (pending.length) {
        const current = pending.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) pending.push(full);
          else {
            copiedFiles += 1;
            copiedBytes += fs.statSync(full).size;
          }
        }
      }
    }
  }
  return { copiedFiles, copiedBytes };
}

function copyBrandAsset(outputDir) {
  if (!fs.existsSync(BRAND_ASSET)) {
    throw new Error(`缺少品牌素材：${BRAND_ASSET}`);
  }
  const target = path.join(outputDir, "archive-brand.webp");
  fs.copyFileSync(BRAND_ASSET, target);
  fs.rmSync(path.join(outputDir, "archive-brand.png"), { force: true });
  return { target, bytes: fs.statSync(target).size };
}

function copyDisplayFontAssets(outputDir) {
  if (!fs.existsSync(DISPLAY_FONT_ASSET)) {
    throw new Error(`缺少标题字体素材：${DISPLAY_FONT_ASSET}`);
  }
  if (!fs.existsSync(DISPLAY_FONT_LICENSE)) {
    throw new Error(`缺少字体许可证：${DISPLAY_FONT_LICENSE}`);
  }
  if (!fs.existsSync(DISPLAY_FONT_NOTICE)) {
    throw new Error(`缺少字体说明：${DISPLAY_FONT_NOTICE}`);
  }
  const targetDir = path.join(outputDir, "assets");
  fs.mkdirSync(targetDir, { recursive: true });
  const fontTarget = path.join(targetDir, path.basename(DISPLAY_FONT_ASSET));
  const licenseTarget = path.join(targetDir, path.basename(DISPLAY_FONT_LICENSE));
  const noticeTarget = path.join(targetDir, path.basename(DISPLAY_FONT_NOTICE));
  fs.copyFileSync(DISPLAY_FONT_ASSET, fontTarget);
  fs.copyFileSync(DISPLAY_FONT_LICENSE, licenseTarget);
  fs.copyFileSync(DISPLAY_FONT_NOTICE, noticeTarget);
  return {
    fontBytes: fs.statSync(fontTarget).size,
    licenseBytes: fs.statSync(licenseTarget).size,
    noticeBytes: fs.statSync(noticeTarget).size,
  };
}

// 自托管 API 需要知道当前构建包含哪些作品，避免把客户端目录直接当成可写配置。
// 这是公开的作品编号清单，不包含正文、作者或评分数据。
const catalogueManifest = {
  version: 1,
  editions: Object.fromEntries(
    editions.map((edition) => [
      edition.slug,
      edition.works.map((work) => edition.slug + "/" + work.slug),
    ]),
  ),
};
const serverDir = path.join(ROOT, "server");
if (fs.existsSync(serverDir)) {
  fs.writeFileSync(
    path.join(serverDir, "catalogue.json"),
    JSON.stringify(catalogueManifest, null, 2) + "\n",
    "utf8",
  );
}

const css = fs.readFileSync(path.join(VIEWER_DIR, "viewer.css"), "utf8");
const js = fs.readFileSync(path.join(VIEWER_DIR, "viewer.js"), "utf8");

const payload = JSON.stringify({ editions })
  .replace(/</g, "\\u003c")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" type="image/webp" href="${BRAND_URL}">
<meta name="theme-color" content="#f5f4ef">
<title>幻梦境档案馆</title>
<meta name="description" content="幻梦境档案馆：文学期刊式的神话造物档案、阅读与评议空间。">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta name="mythos-build" content="2026-09-20-home-spotlight">
<script>
(function(){try{var t=localStorage.getItem("mythos.theme");if(!t&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)t="dark";var d=t==="dark";document.documentElement.dataset.theme=d?"dark":"light";var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",d?"#11141b":"#f5f4ef");}catch(e){}})();
</script>
<style>
${css}
</style>
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
    <button type="button" data-nav="search">全馆搜索</button>
    <button type="button" data-nav="results" hidden>投票公示</button>
  </nav>
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
window.ARCHIVE_BUILD_DATE = ${JSON.stringify(BUILD_DATE_LABEL)};
window.ARCHIVE_DATA = JSON.parse(${JSON.stringify(payload)});
</script>
<script>
${js}
</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, html, "utf8");
const archiveAssets = copyArchiveAssets(path.dirname(OUT_FILE));
const brandAsset = copyBrandAsset(path.dirname(OUT_FILE));
const displayFontAssets = copyDisplayFontAssets(path.dirname(OUT_FILE));

const totalWorks = editions.reduce((sum, e) => sum + e.works.length, 0);
const withYinwen = editions
  .flatMap((e) => e.works)
  .filter((w) => w.sections.some((s) => s.title === "引文"));
console.log(`editions=${editions.length} works=${totalWorks}`);
console.log(
  `archive assets=${archiveAssets.copiedFiles} files ${(archiveAssets.copiedBytes / 1024 / 1024).toFixed(2)} MB`,
);
console.log(`brand asset=${brandAsset.bytes} bytes`);
console.log(`display font=${displayFontAssets.fontBytes} bytes`);
console.log(
  `yinwen=${withYinwen.map((w) => w.no).join(",") || "none"}`,
);
console.log(`size=${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`);
console.log(`out=${OUT_FILE}`);
