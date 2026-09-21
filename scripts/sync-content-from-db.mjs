// 把数据库 work_content 里的 2026 届正文回灌到 content/2026/works/*.md，
// 让「重新构建」与线上正文完全一致（否则构建等于降级）。
//
// 用法：
//   1) 先把线上正文导成本地 JSON：
//      ssh -i ./id_ed25519 root@dreamland.l.cd "node -e \"const {DatabaseSync}=require('node:sqlite');\
//        const db=new DatabaseSync('/opt/dreamland/data/dreamland.db',{readOnly:true});\
//        process.stdout.write(JSON.stringify(db.prepare('SELECT workId, body FROM work_content').all()));\"" > wc-dump.json
//   2) node scripts/sync-content-from-db.mjs ../wc-dump.json          # 写入源文件
//      node scripts/sync-content-from-db.mjs ../wc-dump.json --check  # 只校验，不改文件
//
// 原理：数据库里存的就是构建产物（HTML）。要把 HTML 还原成「能被 marked 重新渲染出同一份
// HTML」的源文件，标题是唯一麻烦点：
//   - markdown 标题会走 build-html.mjs 的 heading renderer，生成 id 并进右侧索引；
//     三级及以下标题只有带 {toc} 才进索引。
//   - 而 HTML 块里的 <h2> 会被原样透传，既不生成 id 也不进索引。
// 所以这里按「候选方案 + 逐篇渲染比对」来做：只有重新渲染与数据库正文逐字节一致才采用，
// 否则降级到更保守的方案，最后把无法还原的篇目报出来。
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

const ROOT = process.cwd();
const dumpPath = process.argv[2] || "../wc-dump.json";
const checkOnly = process.argv.includes("--check");
const debugArg = process.argv.find((a) => a.startsWith("--debug="));
const debugNo = debugArg ? Number(debugArg.split("=")[1]) : 0;

/* ---------- 与 scripts/build-html.mjs 保持一致的渲染逻辑 ---------- */

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
    const id = slugify(plain, used);
    let title = this.parser.parseInline(token.tokens);
    title = title.replace(/\s*\{\s*toc\s*\}\s*$/i, "").trim();
    if (token.depth === 2 || (token.depth >= 3 && flagged)) {
      sections.push({ id, title: plain, level: token.depth });
    }
    return `<h${token.depth} id="${id}">${title}</h${token.depth}>\n`;
  };

  const html = marked.parse(body, { async: false, renderer });
  return { html, sections };
}

/* ---------- HTML → 源文件正文 ---------- */

const HEADING_RE = /<h([2-6]) id="[^"]*">([\s\S]*?)<\/h\1>/g;

function headingSpans(html) {
  const spans = [];
  HEADING_RE.lastIndex = 0;
  let m;
  while ((m = HEADING_RE.exec(html)) !== null) {
    spans.push({
      start: m.index,
      end: m.index + m[0].length,
      level: Number(m[1]),
      text: m[2].trim(),
    });
  }
  return spans;
}

/** 把无属性的 <p> 还原成 markdown 段落（有属性的保留原始 HTML）。 */
function unwrapPlainParagraphs(src) {
  return src.replace(/<p>([\s\S]*?)<\/p>/g, (m, inner) => `\n\n${inner.trim()}\n\n`);
}

/** 按给定的标题还原标记拼出源文件正文。 */
function buildSource(html, spans, markdown) {
  let out = "";
  let cursor = 0;
  for (let i = 0; i < spans.length; i += 1) {
    const s = spans[i];
    out += html.slice(cursor, s.start);
    if (markdown[i]) {
      // 三级及以下标题要带 {toc} 才会进右侧索引
      out += "#".repeat(s.level) + " " + s.text + (s.level >= 3 ? " {toc}" : "");
    } else {
      out += html.slice(s.start, s.end);
    }
    cursor = s.end;
  }
  out += html.slice(cursor);
  return out;
}

/** 还原标题：allAtOnce=true 时一次性全还原（标题之间互相影响，必须同进同退的场景），
 *  否则从左到右贪心，逐个确认「重新渲染仍与目标一致」才保留。 */
function tryConvert(html, unwrapPlain, allAtOnce) {
  const spans = headingSpans(html);
  const markdown = spans.map(() => allAtOnce);
  const normalize = (s) => s.replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n");
  const shape = (s) => normalize(unwrapPlain ? unwrapPlainParagraphs(s) : s);

  let best = shape(buildSource(html, spans, markdown));
  let bestExact = renderBody(best).html === html;

  if (!allAtOnce) {
    for (let i = 0; i < spans.length; i += 1) {
      markdown[i] = true;
      const candidate = shape(buildSource(html, spans, markdown));
      if (renderBody(candidate).html === html) {
        best = candidate;
        bestExact = true;
      } else {
        markdown[i] = false;
      }
    }
  }

  if (!best.endsWith("\n")) best += "\n";
  const final = renderBody(best);
  return { source: best, exact: final.html === html, sections: final.sections };
}

function htmlToSource(html) {
  const attempts = [
    tryConvert(html, false, false), // 贪心 + 保留原始 HTML 段落（最常见）
    tryConvert(html, false, true), // 全部标题一次性还原
    tryConvert(html, true, false), // 贪心 + 无属性段落还原成 markdown
    tryConvert(html, true, true), // 纯 markdown 正文
  ];
  if (debugNo) {
    for (const [i, a] of attempts.entries()) {
      console.log(
        `  [debug] 方案${i + 1} exact=${a.exact} sections=${JSON.stringify(a.sections.map((s) => s.title))}`,
      );
      if (!a.exact) {
        const rendered = renderBody(a.source).html;
        let k = 0;
        while (k < Math.min(rendered.length, html.length) && rendered[k] === html[k]) k++;
        console.log("    首个差异:", k);
        console.log("    目标:", JSON.stringify(html.slice(Math.max(0, k - 50), k + 80)));
        console.log("    产出:", JSON.stringify(rendered.slice(Math.max(0, k - 50), k + 80)));
      }
    }
  }
  const exact = attempts.filter((a) => a.exact);
  if (!exact.length) return attempts[0];
  // 多个方案都能还原时，取「章节索引最全」的那个（= 还原成 markdown 的标题最多）
  exact.sort((a, b) => b.sections.length - a.sections.length);
  return exact[0];
}

/* ---------- 主流程 ---------- */

const rows = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
let ok = 0;
const problems = [];

for (const row of rows) {
  const [year, slug] = row.workId.split("/");
  const file = path.join(ROOT, "content", year, "works", slug + ".md");
  if (debugNo) {
    const no = Number(slug.split("-")[0]);
    if (no !== debugNo) continue;
    console.log(`[debug] ${row.workId} bodyLen=${row.body.length}`);
  }
  const { source, exact } = htmlToSource(row.body);

  if (!fs.existsSync(file)) {
    problems.push(`${row.workId}: 找不到源文件 ${file}`);
    continue;
  }
  const raw = fs.readFileSync(file, "utf8");
  const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(raw);
  if (!fm) {
    problems.push(`${row.workId}: 源文件缺 frontmatter`);
    continue;
  }
  const next = fm[0] + source;
  if (!exact) problems.push(`${row.workId}: 无法还原成完全一致的 HTML`);

  if (checkOnly) {
    if (raw !== next) problems.push(`${row.workId}: 源文件与数据库不一致`);
    else ok += 1;
    continue;
  }
  if (raw === next) {
    ok += 1;
    continue;
  }
  fs.writeFileSync(file, next, "utf8");
  ok += 1;
  console.log(`更新 ${path.relative(ROOT, file)}  (${raw.length} → ${next.length} 字节)`);
}

console.log(`\n${checkOnly ? "校验" : "同步"}完成：${ok}/${rows.length} 篇`);
if (problems.length) {
  console.log("问题：");
  for (const p of problems) console.log("  -", p);
  process.exitCode = 1;
}
