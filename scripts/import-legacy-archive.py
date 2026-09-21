#!/usr/bin/env python3
"""Import the historical competition folders into the archive content tree.

The importer is intentionally a one-way, local publishing step:

* DOCX files become HTML-in-Markdown while keeping headings, paragraph
  alignment, inline emphasis, tables, and embedded images where possible.
* Character-card XLSX files use their author-prepared ``txt输出`` sheet when
  available.  The newer ``安娜·艾佛森`` workbook is read from its public
  ``简化卡``/``人物卡`` fields instead.  Player identifiers, QQ values, rule
  reference sheets, and formula errors are not published.
* Images are resized and encoded as WebP when Pillow can read them.  WMF/EMF
  assets stay as downloadable local-format assets because browsers do not
  consistently display them.
* Submissions published as ``.doc`` or ``.zip`` are expanded before rendering.
  Legacy binary ``.doc`` is converted through LibreOffice; a ``.zip`` becomes
  one work whose main document is followed by its supplements.

Two file-name conventions are supported.  2020-2024 folders use
``序号.标题-作者.docx``.  The 2025 folder uses the contest export form
``标题-作者-QQ.docx`` with no leading number, so works are numbered in the
order the source folder lists them.

The generated content is then handled by the normal Node build.  The source
Office files remain outside the website and are not uploaded by this script.

Usage (from the project root)::

    python scripts/import-legacy-archive.py --dry-run
    python scripts/import-legacy-archive.py --force
    python scripts/import-legacy-archive.py --force --years 2025

The default source root is the parent folder of this project (``F:\\dreamland``
in the current workspace).  Pass ``--source-root`` when moving the source
folders to another machine.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
import warnings
from collections import Counter
from pathlib import Path
from typing import Any, Iterable, Iterator
from zipfile import ZipFile

from docx import Document
from docx.document import Document as DocumentObject
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph
from openpyxl import load_workbook

try:
    from PIL import Image
except ImportError:  # pragma: no cover - reported in the CLI instead
    Image = None


warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_ROOT = PROJECT_ROOT.parent
CONTENT_ROOT = PROJECT_ROOT / "content"
REPORT_PATH = PROJECT_ROOT / "archive-import-report.json"

ARCHIVE_SOURCES = (
    {
        "year": 2020,
        "folder": "【暑期大赛】1. 人物卡大赛",
        "name": "人物卡大赛",
        "short_name": "2020 人物卡大赛",
        "kind": "xlsx",
        "intro": "第一届人物卡资料的可读封存：人物设定、能力、背景、物品与资产。",
    },
    {
        "year": 2021,
        "folder": "【暑期大赛】2. 怪物设计大赛",
        "name": "怪物设计大赛",
        "short_name": "2021 怪物设计大赛",
        "kind": "docx",
        "intro": "以原始投稿文档为底稿，封存怪物的叙事、形貌与设定。",
    },
    {
        "year": 2022,
        "folder": "【暑期大赛】3. 结社设计大赛",
        "name": "结社设计大赛",
        "short_name": "2022 结社设计大赛",
        "kind": "docx",
        "intro": "以原始投稿文档为底稿，封存结社的秘闻、组织与来历。",
    },
    {
        "year": 2023,
        "folder": "【暑期大赛】4. 神话历史设计大赛",
        "name": "神话历史设计大赛",
        "short_name": "2023 神话历史设计大赛",
        "kind": "docx",
        "intro": "以原始投稿文档为底稿，封存神话历史中的逸闻、记录与断片。",
    },
    {
        "year": 2024,
        "folder": "【暑假大赛】5.神话地理设计大赛",
        "name": "神话地理设计大赛",
        "short_name": "2024 神话地理设计大赛",
        "kind": "docx",
        "intro": "以原始投稿文档为底稿，封存地理志、游记与不可考的所在。",
    },
    {
        "year": 2025,
        "folder": "【暑假大赛】6.神话风俗设计大赛参赛文件",
        "name": "神话风俗设计大赛",
        "short_name": "2025 神话风俗设计大赛",
        "kind": "docx",
        "naming": "submission",
        "intro": "以原始投稿文档为底稿，封存岁时、祭仪与民间信仰的风俗志。",
    },
)

ANONYMOUS_NAMES = {"", "匿名", "无名", "未署名", "未见署名", "未知"}
ANONYMITY_PATTERN = re.compile(r"匿名|^匿$|无名")
MAX_IMAGE_DIMENSION = 1800
TITLE_OVERRIDES = {
    (2024, "垂死地终稿"): "垂死地",
    (2025, "【定稿】空洞神祇的祭典：凉山彝族村寨调查"): "空洞神祇的祭典：凉山彝族村寨调查",
    (2025, "伟大种族（←最终版）"): "伟大种族",
    (2025, "第三帝国的未竟之仪（绝对不改版）"): "第三帝国的未竟之仪",
    (2025, "无首的天使（错别字订正版）"): "无首的天使",
    (2025, "ISOLASJON（又勘误了一次……抱歉）"): "ISOLASJON",
}
# Slugs follow the public title.  Only names that cannot produce a readable
# slug, or that were already published under a source-derived slug, need an
# explicit replacement.
SLUG_OVERRIDES = {
    (2024, "垂死地终稿"): "垂死地终稿",
    (2025, "..."): "untitled",
}

LIBREOFFICE_CANDIDATES = (
    "soffice",
    "soffice.exe",
    r"C:\Program Files\LibreOffice\program\soffice.exe",
    r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "/usr/bin/soffice",
)


def scalar(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def json_scalar(value: Any) -> str:
    """Quote one frontmatter scalar in the project's simple parser format."""

    return json.dumps(scalar(value).replace("\r", " ").replace("\n", " "), ensure_ascii=False)


def clean_title(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    return value or "未命名档案"


def parse_filename(stem: str) -> tuple[int, str, str, str]:
    """Return original number, title, public author, and author status."""

    match = re.match(r"^\s*(\d+)\s*[.、\s_-]*\s*(.+?)\s*$", stem)
    if not match:
        return 0, clean_title(stem), "未见署名", "anonymous"

    number = int(match.group(1))
    remainder = clean_title(match.group(2))
    title = remainder
    author = "未见署名"

    # Historical DOCX names use either ``title_author`` or ``title-author``.
    # Use the final separator so hyphens inside a title stay intact.
    for separator in ("_", "—", "–", "-"):
        position = remainder.rfind(separator)
        if position <= 0 or position >= len(remainder) - 1:
            continue
        candidate_title = clean_title(remainder[:position])
        candidate_author = clean_title(remainder[position + 1 :])
        if candidate_title and candidate_author:
            title = candidate_title
            author = candidate_author
            break

    if author in ANONYMOUS_NAMES:
        return number, title, ("匿名" if author else "未见署名"), "anonymous"
    return number, title, author, "named"


def restore_escaped_name(value: str) -> str:
    """Restore the ``%UXXXX`` escapes that download tools leave in file names.

    The 2025 export folder contains names such as ``%UD83E%UDD21ALL IS FAIR``
    (a surrogate pair standing for an emoji) and ``Sur Religiosite%U0301``
    (a combining accent).  Both are restored, then NFC-normalised.
    """

    def decode(match: re.Match[str]) -> str:
        units = [int(unit, 16) for unit in re.findall(r"%U([0-9A-Fa-f]{4})", match.group(0))]
        raw = b"".join(unit.to_bytes(2, "big") for unit in units)
        return raw.decode("utf-16-be", "replace")

    restored = re.sub(r"(?:%U[0-9A-Fa-f]{4})+", decode, value)
    return unicodedata.normalize("NFC", restored)


def classify_author(raw: str, forced_anonymous: bool = False) -> tuple[str, str]:
    """Return the public author name and its status."""

    name = raw.strip()
    if forced_anonymous:
        return "匿名", "anonymous"
    if not name or name in ANONYMOUS_NAMES:
        return "匿名", "anonymous"
    # ``寒王（匿）`` / ``硅酱（匿名）`` mark themselves anonymous in brackets.
    for marker in re.findall(r"[（(]([^）)]*)[）)]", name):
        if ANONYMITY_PATTERN.search(marker):
            return "匿名", "anonymous"
    if ANONYMITY_PATTERN.search(name):
        return "匿名", "anonymous"
    return name, "named"


def parse_submission_name(stem: str) -> tuple[str, str, str]:
    """Parse the 2025 ``标题-作者-QQ`` export names.

    Returns ``(title, author, author_status)``.  The trailing QQ segment is
    dropped, a ``（匿名）`` segment forces anonymity, and a missing author
    stays ``未见署名`` rather than being reported as anonymous.
    """

    text = restore_escaped_name(stem)
    separator = "-" if "-" in text else "_"
    segments = [segment.strip() for segment in text.split(separator) if segment.strip()]

    anonymous = False
    if segments and ANONYMITY_PATTERN.search(segments[-1]):
        anonymous = True
        segments.pop()
    if len(segments) > 1 and re.fullmatch(r"\d{3,}", segments[-1]):
        segments.pop()

    kept: list[str] = []
    for segment in segments:
        if ANONYMITY_PATTERN.search(segment):
            anonymous = True
            continue
        kept.append(segment)

    if not kept:
        return clean_title(text), "匿名", "anonymous"
    if len(kept) == 1:
        if anonymous:
            return clean_title(kept[0]), "匿名", "anonymous"
        return clean_title(kept[0]), "未见署名", "named"

    title = clean_title(separator.join(kept[:-1]))
    author, status = classify_author(kept[-1], anonymous)
    return title, author, status


def import_cache_dir() -> Path:
    cache = Path(tempfile.gettempdir()) / "dreamland-import-cache"
    cache.mkdir(parents=True, exist_ok=True)
    return cache


def find_libreoffice() -> str | None:
    for candidate in LIBREOFFICE_CANDIDATES:
        if candidate in {"soffice", "soffice.exe"}:
            located = shutil.which(candidate)
            if located:
                return located
            continue
        if Path(candidate).exists():
            return candidate
    return None


def convert_doc_to_docx(path: Path) -> Path:
    """Convert a legacy binary ``.doc`` so python-docx can read it."""

    binary = find_libreoffice()
    if binary is None:
        raise RuntimeError(f"找不到 LibreOffice，无法转换 {path.name}")
    cache = import_cache_dir()
    target = cache / (path.stem + ".docx")
    if target.exists() and target.stat().st_mtime >= path.stat().st_mtime:
        return target
    profile = cache / "lo-profile"
    result = subprocess.run(
        [
            binary,
            "--headless",
            "--norestore",
            f"-env:UserInstallation={profile.as_uri()}",
            "--convert-to",
            "docx",
            "--outdir",
            str(cache),
            str(path),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=300,
    )
    if not target.exists():
        detail = (result.stdout or "") + (result.stderr or "")
        raise RuntimeError(f"转换 {path.name} 失败: {detail.strip()[:200]}")
    return target


def expand_zip_item(path: Path) -> dict[str, Any]:
    """Treat one ``.zip`` submission as one work: main document plus supplements."""

    cache = import_cache_dir() / path.stem
    if cache.exists() and cache.stat().st_mtime < path.stat().st_mtime:
        shutil.rmtree(cache)
    if not cache.exists():
        cache.mkdir(parents=True, exist_ok=True)
        with ZipFile(path) as archive:
            archive.extractall(cache)
    documents = sorted(
        candidate
        for candidate in cache.rglob("*.docx")
        if not candidate.name.startswith("~$")
    )
    if not documents:
        raise RuntimeError(f"{path.name} 里没有可用的 DOCX")
    title = restore_escaped_name(path.stem)
    main = next((document for document in documents if document.stem in title), None)
    if main is None:
        main = max(documents, key=lambda document: len(document.stem))
    extras = [document for document in documents if document != main]
    return {
        "stem": path.stem,
        "paths": [main, *extras],
        "source": path.name,
        "size": path.stat().st_size,
        "extraDocuments": [document.stem for document in extras],
    }


def collect_source_items(source_dir: Path, spec: dict[str, Any]) -> list[dict[str, Any]]:
    """Return one entry per published work, expanding ``.doc`` and ``.zip`` files."""

    if spec["kind"] == "xlsx":
        return [
            {"stem": path.stem, "paths": [path], "source": path.name, "size": path.stat().st_size}
            for path in sorted(source_dir.glob("*.xlsx"))
        ]

    items: list[dict[str, Any]] = []
    for path in sorted(source_dir.iterdir()):
        if not path.is_file() or path.name.startswith("~$"):
            continue
        suffix = path.suffix.lower()
        if suffix == ".docx":
            items.append(
                {"stem": path.stem, "paths": [path], "source": path.name, "size": path.stat().st_size}
            )
        elif suffix == ".doc":
            items.append(
                {
                    "stem": path.stem,
                    "paths": [convert_doc_to_docx(path)],
                    "source": path.name,
                    "size": path.stat().st_size,
                }
            )
        elif suffix == ".zip":
            items.append(expand_zip_item(path))
    return items


def slugify(title: str, number: int, used: set[str]) -> str:
    base = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff·]+", "-", title).strip("-")
    base = base or "archive"
    slug = f"{number:02d}-{base}"
    original = slug
    suffix = 2
    while slug in used:
        slug = f"{original}-{suffix}"
        suffix += 1
    used.add(slug)
    return slug


def source_url(year: int, slug: str, filename: str) -> str:
    return "/".join(("archive-assets", str(year), slug, filename))


def escape_text(value: Any) -> str:
    text = html.escape(scalar(value), quote=False)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\n", "<br>\n")
    # Preserve deliberate spacing in short labels without allowing arbitrary
    # source HTML to enter the generated body.
    text = re.sub(r" {2,}", lambda m: "&nbsp;" * (len(m.group(0)) - 1) + " ", text)
    return text


def plain_text(value: Any) -> str:
    return re.sub(r"\s+", " ", scalar(value)).strip()


def html_paragraph(text: str, classes: Iterable[str] = ("doc-p",)) -> str:
    class_attr = " ".join(classes)
    return f'<p class="{html.escape(class_attr, quote=True)}">{escape_text(text)}</p>\n'


def normalize_markdown_blocks(body: str) -> str:
    """Keep generated HTML blocks separate from Markdown section headings."""

    return re.sub(r"\n(?=##\s)", "\n\n", body)


def safe_asset_name(stem: str, suffix: str, index: int) -> str:
    clean = re.sub(r"[^0-9A-Za-z_-]+", "-", stem).strip("-") or "asset"
    return f"{clean}-{index}{suffix}"


def optimize_image(blob: bytes, output_dir: Path, stem: str, index: int) -> str:
    """Write a browser-friendly image and return its file name."""

    if Image is None:
        raise RuntimeError("Pillow is required to optimize archive images")

    from io import BytesIO

    try:
        image = Image.open(BytesIO(blob))
        image.load()
        image.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
        filename = safe_asset_name(stem, ".webp", index)
        image.save(output_dir / filename, "WEBP", quality=84, method=6)
        return filename
    except Exception as error:
        # Some old Office formats (notably WMF/EMF) are not decoded by Pillow.
        # Let the caller keep the original suffix so the asset remains
        # downloadable instead of becoming an opaque .bin file.
        raise ValueError("image format is not browser-rasterizable") from error


class DocxContext:
    def __init__(self, doc: DocumentObject, year: int, slug: str, asset_dir: Path):
        self.doc = doc
        self.year = year
        self.slug = slug
        self.asset_dir = asset_dir
        self.image_by_rid: dict[str, str] = {}
        self.image_count = 0
        self.wmf_count = 0

    def store_relationship(self, rid: str, relationship: Any) -> str:
        if rid in self.image_by_rid:
            return self.image_by_rid[rid]
        try:
            target = relationship.target_part
        except (AttributeError, ValueError):
            return ""
        blob = target.blob
        suffix = Path(str(target.partname)).suffix.lower()
        self.image_count += 1
        try:
            filename = optimize_image(blob, self.asset_dir, "doc-image", self.image_count)
        except (RuntimeError, ValueError):
            filename = safe_asset_name("doc-image", suffix or ".bin", self.image_count)
            (self.asset_dir / filename).write_bytes(blob)
        if suffix in {".wmf", ".emf"} or filename.lower().endswith((".wmf", ".emf")):
            self.wmf_count += 1
        self.image_by_rid[rid] = filename
        return filename

    def image_for_run(self, run: Any) -> list[str]:
        urls: list[str] = []
        for blip in run._r.iter(qn("a:blip")):
            rid = blip.get(qn("r:embed"))
            if not rid:
                continue
            relationship = self.doc.part.rels.get(rid)
            if relationship is None:
                continue
            filename = self.store_relationship(rid, relationship)
            if not filename:
                continue
            urls.append(source_url(self.year, self.slug, filename))
        return urls

    def unreferenced_media(self) -> list[str]:
        urls: list[str] = []
        for rid, relationship in self.doc.part.rels.items():
            try:
                partname = str(relationship.target_part.partname).replace("\\", "/")
            except (AttributeError, ValueError):
                continue
            if not partname.startswith("/word/media/") or rid in self.image_by_rid:
                continue
            filename = self.store_relationship(rid, relationship)
            if not filename:
                continue
            urls.append(source_url(self.year, self.slug, filename))
        return urls


def run_html(run: Any) -> str:
    value = escape_text(run.text or "")
    if not value:
        return ""
    if run.font.superscript:
        value = f"<sup>{value}</sup>"
    elif run.font.subscript:
        value = f"<sub>{value}</sub>"
    if run.font.strike:
        value = f"<s>{value}</s>"
    if run.underline:
        value = f"<u>{value}</u>"
    if run.italic:
        value = f"<em>{value}</em>"
    if run.bold:
        value = f"<strong>{value}</strong>"
    color = run.font.color
    if color is not None and color.type and color.type.name == "RGB" and color.rgb:
        rgb = str(color.rgb)
        # Word often writes explicit black on every run.  It is the site's
        # default color, so omit it to keep the generated HTML compact.
        if re.fullmatch(r"[0-9A-Fa-f]{6}", rgb) and rgb.lower() != "000000":
            value = f'<span style="color:#{rgb}">{value}</span>'
    return value


def is_heading(paragraph: Paragraph) -> bool:
    text = plain_text(paragraph.text)
    if not text or len(text) > 80:
        return False
    style_name = plain_text(paragraph.style.name).lower() if paragraph.style else ""
    if style_name.startswith("heading") or style_name in {"title", "subtitle"}:
        return True
    runs = [run for run in paragraph.runs if run.text and run.text.strip()]
    if not runs:
        return False
    bold = all(run.bold is True for run in runs)
    sizes = [run.font.size.pt for run in runs if run.font.size is not None]
    return bold and bool(sizes) and max(sizes) >= 13


def paragraph_html(paragraph: Paragraph, context: DocxContext, allow_heading: bool = True) -> str:
    images: list[str] = []
    text_parts: list[str] = []
    for run in paragraph.runs:
        text_parts.append(run_html(run))
        images.extend(context.image_for_run(run))

    text = "".join(text_parts)
    if not text and paragraph.text:
        text = escape_text(paragraph.text)

    if not paragraph.text.strip() and not images:
        return '<div class="doc-spacer" aria-hidden="true"></div>\n'

    if allow_heading and is_heading(paragraph):
        # Use Markdown headings so the existing Node renderer can build the
        # stable right-side section index.
        heading = plain_text(paragraph.text).replace("\n", " ")
        result = f"## {heading}\n"
    else:
        classes = ["doc-p"]
        alignment = paragraph.alignment
        if alignment is not None:
            alignment_name = getattr(alignment, "name", str(alignment)).lower()
            if "center" in alignment_name:
                classes.append("doc-center")
            elif "right" in alignment_name:
                classes.append("doc-right")
        if paragraph.paragraph_format.first_line_indent is not None:
            if paragraph.paragraph_format.first_line_indent.pt <= 0:
                classes.append("doc-no-indent")
        result = f'<p class="{" ".join(classes)}">{text}</p>\n'

    for url in images:
        if url.lower().endswith((".wmf", ".emf")):
            result += (
                f'<p class="doc-image"><a href="{url}" download>下载原稿插图（{url.rsplit(".", 1)[-1].upper()}）</a></p>\n'
            )
        else:
            result += f'<p class="doc-image"><img src="{url}" alt="原稿插图" loading="lazy"></p>\n'
    return result


def table_html(table: Table, context: DocxContext) -> str:
    rows: list[str] = []
    for row in table.rows:
        cells: list[str] = []
        for cell in row.cells:
            cell_body = "".join(
                paragraph_html(paragraph, context, allow_heading=False)
                for paragraph in cell.paragraphs
            )
            cells.append(f"<td>{cell_body}</td>")
        rows.append("<tr>" + "".join(cells) + "</tr>")
    return '<div class="doc-table-wrap"><table><tbody>' + "".join(rows) + "</tbody></table></div>\n"


def iter_document_blocks(doc: DocumentObject) -> Iterator[Paragraph | Table]:
    body = doc.element.body
    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, doc)
        elif child.tag == qn("w:tbl"):
            yield Table(child, doc)


def render_docx(path: Path, year: int, slug: str, asset_dir: Path) -> tuple[str, dict[str, Any]]:
    doc = Document(path)
    context = DocxContext(doc, year, slug, asset_dir)
    chunks: list[str] = []
    paragraph_count = 0
    table_count = 0
    for block in iter_document_blocks(doc):
        if isinstance(block, Paragraph):
            paragraph_count += 1
            chunks.append(paragraph_html(block, context))
        else:
            table_count += 1
            chunks.append(table_html(block, context))

    for url in context.unreferenced_media():
        if url.lower().endswith((".wmf", ".emf")):
            chunks.append(
                f'<p class="doc-image"><a href="{url}" download>下载原稿插图（{url.rsplit(".", 1)[-1].upper()}）</a></p>\n'
            )
        else:
            chunks.append(f'<p class="doc-image"><img src="{url}" alt="原稿插图" loading="lazy"></p>\n')
    return "".join(chunks), {
        "paragraphs": paragraph_count,
        "tables": table_count,
        "images": context.image_count,
        "wmf_images": context.wmf_count,
    }


def clean_export_line(value: Any) -> str:
    text = plain_text(value)
    if not text or text == "此处用于筛选":
        return ""
    # The workbook's B-column export includes a private player field in one
    # line.  It is deliberately removed rather than copied to the website.
    text = re.sub(r"\s*玩家:\s*[^\s，,]*", "", text).strip()
    if "#N/A" in text or "#REF!" in text:
        return ""
    return text


def section_heading(line: str) -> str:
    is_divider = bool(re.search(r"[—-]{3,}", line))
    compact = re.sub(r"[—\-\s]+", "", line)
    for keyword in ("战斗", "技能", "背景故事", "随身物品", "资产"):
        if (is_divider and keyword in compact) or compact == keyword:
            return keyword
    return ""


def extract_xlsx_images(path: Path, year: int, slug: str, asset_dir: Path) -> list[str]:
    urls: list[str] = []
    with ZipFile(path) as archive:
        image_index = 0
        for name in archive.namelist():
            if not name.startswith("xl/media/") or name.endswith("/"):
                continue
            image_index += 1
            blob = archive.read(name)
            suffix = Path(name).suffix.lower()
            try:
                filename = optimize_image(blob, asset_dir, "character-image", image_index)
            except (RuntimeError, ValueError):
                filename = safe_asset_name("character-image", suffix or ".bin", image_index)
                (asset_dir / filename).write_bytes(blob)
            urls.append(source_url(year, slug, filename))
    return urls


def render_standard_xlsx(wb: Any) -> tuple[str, dict[str, Any]]:
    ws = wb["txt输出"]
    lines: list[str] = []
    errors = 0
    for row in range(2, min(ws.max_row, 105) + 1):
        raw = ws.cell(row=row, column=2).value
        if raw is not None and "#N/A" in scalar(raw):
            errors += 1
        line = clean_export_line(raw)
        if not line:
            continue
        heading = section_heading(line)
        if heading:
            lines.append(f"## {heading}\n")
        else:
            lines.append(html_paragraph(line))
    return "".join(lines), {"export_cells": len(lines), "formula_errors": errors}


def render_anna_xlsx(wb: Any) -> tuple[str, dict[str, Any]]:
    card = wb["人物卡"]
    simple = wb["简化卡"]

    def cell(sheet: Any, address: str) -> str:
        return plain_text(sheet[address].value)

    identity_fields = [
        cell(card, "E3"),
        cell(card, "M6"),
        (cell(card, "E6") + "岁") if cell(card, "E6") else "",
        cell(card, "E5"),
        cell(card, "M4"),
        ("现居：" + cell(card, "E7")) if cell(card, "E7") else "",
        (cell(card, "M7") + "人") if cell(card, "M7") else "",
    ]
    identity = "，".join(value for value in identity_fields if value)
    parts = ["## 角色概览\n", html_paragraph(identity)]

    stats = [
        ("STR", cell(card, "U3")),
        ("DEX", cell(card, "AA3")),
        ("POW", cell(card, "AG3")),
        ("CON", cell(card, "U5")),
        ("APP", cell(card, "AA5")),
        ("EDU", cell(card, "AG5")),
        ("SIZ", cell(card, "U7")),
        ("INT", cell(card, "AA7")),
        ("LUCK", cell(card, "AG7")),
        ("HP", f"{cell(card, 'E10')}/{cell(card, 'G10')}"),
        ("SAN", f"{cell(card, 'N10')}/{cell(card, 'P10')}"),
        ("MP", f"{cell(card, 'W10')}/{cell(card, 'Y10')}"),
        ("MOV", cell(card, "AF10")),
    ]
    stat_rows = "".join(f"<tr><th>{html.escape(label)}</th><td>{escape_text(value)}</td></tr>" for label, value in stats if value.strip("/") )
    parts.extend(["## 属性\n", f'<div class="doc-table-wrap"><table><tbody>{stat_rows}</tbody></table></div>\n'])

    skills: list[str] = []
    for row in range(3, 17):
        for name_col, value_col in (("N", "Q"), ("T", "W")):
            name = cell(simple, f"{name_col}{row}")
            value = cell(simple, f"{value_col}{row}")
            if name in {"技艺：", "科学：", "格斗：", "射击：", "语言："}:
                sub_name = cell(simple, f"O{row}") if name == "技艺：" else ""
                if sub_name:
                    name += sub_name
            if name and name not in {"0", "技能", "武器表", "资产", "背景故事"} and value not in {"", "0"}:
                skills.append(f"{name} {value}%")
    if skills:
        parts.append("## 技能\n<ul>" + "".join(f"<li>{escape_text(item)}</li>" for item in skills) + "</ul>\n")

    weapons: list[str] = []
    for row in range(12, 17):
        name = cell(simple, f"C{row}")
        if name and name != "0":
            kind = cell(simple, f"D{row}")
            chance = cell(simple, f"E{row}")
            damage = cell(simple, f"H{row}")
            suffix = "，".join(part for part in (kind, (chance + "%") if chance else "", damage) if part)
            weapons.append(name + ("（" + suffix + "）" if suffix else ""))
    if weapons:
        parts.append("## 武器\n<ul>" + "".join(f"<li>{escape_text(item)}</li>" for item in weapons) + "</ul>\n")

    background = [
        ("描述", cell(simple, "C28")),
        ("思想与信念", cell(simple, "C29")),
        ("重要之人", cell(simple, "C30")),
        ("意义非凡之地", cell(simple, "C31")),
        ("宝贵之物", cell(simple, "C32")),
        ("特质", cell(simple, "C33")),
        ("难言之隐", cell(simple, "C34")),
        ("伤口和疤痕", cell(simple, "C35")),
        ("恐惧症和狂躁症", cell(simple, "C36")),
        ("背景故事", cell(simple, "H28")),
    ]
    parts.append("## 背景\n")
    for label, value in background:
        if value and value != "0":
            parts.append(f'<p class="doc-p"><strong>{escape_text(label)}：</strong>{escape_text(value)}</p>\n')

    items = []
    for row in range(22, 27):
        for col in ("B", "E", "H", "K"):
            value = cell(simple, f"{col}{row}")
            if value and value not in {"0", "随身物品"}:
                items.append(value)
    assets = [
        ("生活水平", cell(simple, "E19")),
        ("消费水平", cell(simple, "G19")),
        ("其他资产", cell(simple, "I19")),
        ("当前现金", cell(simple, "K19") + (" " + cell(simple, "M19") if cell(simple, "M19") else "")),
    ]
    parts.append("## 物品与资产\n")
    if items:
        parts.append("<ul>" + "".join(f"<li>{escape_text(item)}</li>" for item in items) + "</ul>\n")
    for label, value in assets:
        if value.strip():
            parts.append(f'<p class="doc-p"><strong>{escape_text(label)}：</strong>{escape_text(value)}</p>\n')
    return "".join(parts), {"export_cells": len(skills) + len(background) + len(items), "formula_errors": 0}


def render_xlsx(path: Path, year: int, slug: str, asset_dir: Path) -> tuple[str, dict[str, Any]]:
    wb = load_workbook(path, data_only=True, read_only=False)
    if "txt输出" in wb.sheetnames:
        body, metrics = render_standard_xlsx(wb)
    elif "简化卡" in wb.sheetnames:
        body, metrics = render_anna_xlsx(wb)
    else:
        body = ""
        metrics = {"export_cells": 0, "formula_errors": 0}

    image_urls = extract_xlsx_images(path, year, slug, asset_dir)
    if image_urls:
        image_block = "".join(
            f'<figure class="doc-image"><img src="{url}" alt="人物卡所附图像" loading="lazy">'
            "<figcaption>人物卡所附图像</figcaption></figure>\n"
            for url in image_urls
        )
        body = image_block + body
    metrics["images"] = len(image_urls)
    return body, metrics


def frontmatter(number: int, title: str, author: str, author_status: str, source_format: str) -> str:
    return "\n".join(
        (
            "---",
            f"no: {number}",
            f"title: {json_scalar(title)}",
            f"author: {json_scalar(author)}",
            f"authorStatus: {json_scalar(author_status)}",
            f"sourceFormat: {json_scalar(source_format)}",
            "artifact: \"\"",
            "mythos: []",
            "genre: []",
            "---",
        )
    )


def clear_generated_dir(path: Path) -> None:
    """Clear only a verified generated child directory."""

    if not path.exists():
        return
    if path.parent != CONTENT_ROOT / path.parent.name or path.name not in {"works", "assets"}:
        raise RuntimeError(f"拒绝清理非导入目录: {path}")
    for child in path.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def import_edition(spec: dict[str, Any], source_root: Path, force: bool, dry_run: bool) -> dict[str, Any]:
    source_dir = source_root / spec["folder"]
    if not source_dir.is_dir():
        raise FileNotFoundError(f"找不到历史资料目录: {source_dir}")

    year = int(spec["year"])
    edition_dir = CONTENT_ROOT / str(year)
    works_dir = edition_dir / "works"
    assets_dir = edition_dir / "assets"
    if not dry_run:
        edition_dir.mkdir(parents=True, exist_ok=True)
        if force:
            clear_generated_dir(works_dir)
            clear_generated_dir(assets_dir)
        works_dir.mkdir(parents=True, exist_ok=True)
        assets_dir.mkdir(parents=True, exist_ok=True)

    items = collect_source_items(source_dir, spec)
    used_slugs: set[str] = set()
    report: dict[str, Any] = {
        "year": year,
        "sourceFolder": spec["folder"],
        "sourceBytes": sum(item["size"] for item in items),
        "sourceFiles": len(items),
        "naming": spec.get("naming", "numbered"),
        "skipped": [],
        "works": [],
        "warnings": [],
    }

    for index, item in enumerate(items, start=1):
        if spec["kind"] == "docx" and "参赛文件" in item["stem"]:
            report["skipped"].append(
                {"source": item["source"], "reason": "投稿格式模板，不作为作品上架"}
            )
            continue
        if spec.get("naming") == "submission":
            # The 2025 export carries no submission number; keep the folder's
            # own order so the archive numbering stays reproducible.
            source_title, author, author_status = parse_submission_name(item["stem"])
            number = index
        else:
            number, source_title, author, author_status = parse_filename(item["stem"])
        title = TITLE_OVERRIDES.get((year, source_title), source_title)
        # Keep the source-derived slug stable when only the public title changes,
        # so existing historical links continue to resolve.
        slug = slugify(SLUG_OVERRIDES.get((year, source_title), title), number, used_slugs)
        work_asset_dir = assets_dir / slug
        if not dry_run:
            work_asset_dir.mkdir(parents=True, exist_ok=True)
            metrics: dict[str, Any] = {}
            chunks: list[str] = []
            for position, document in enumerate(item["paths"]):
                if spec["kind"] == "docx":
                    chunk, part_metrics = render_docx(document, year, slug, work_asset_dir)
                else:
                    chunk, part_metrics = render_xlsx(document, year, slug, work_asset_dir)
                for key, value in part_metrics.items():
                    if isinstance(value, int):
                        metrics[key] = metrics.get(key, 0) + value
                if position and not chunk.lstrip().startswith("## "):
                    # A supplementary document without its own heading still
                    # needs a section entry in the right-hand index.
                    chunk = f"## {restore_escaped_name(document.stem)}\n\n" + chunk
                elif not position and len(item["paths"]) > 1 and not chunk.lstrip().startswith("## "):
                    # Label the main document too, so a bundled work reads as
                    # two named parts instead of a loose supplement.
                    chunk = f"## {title}\n\n" + chunk
                chunks.append(chunk)
            body = normalize_markdown_blocks("\n".join(chunks))
            target = works_dir / f"{slug}.md"
            target.write_text(
                frontmatter(number, title, author, author_status, spec["kind"])
                + "\n"
                + body.strip()
                + "\n",
                encoding="utf-8",
            )
        else:
            metrics = {}

        if author_status != "named":
            report["warnings"].append(f"{item['source']}: 未发现可公开的作者署名")
        report["works"].append(
            {
                "no": number,
                "slug": slug,
                "title": title,
                "author": author,
                "authorStatus": author_status,
                "source": item["source"],
                "sourceBytes": item["size"],
                "documents": len(item["paths"]),
                **metrics,
            }
        )

    edition_meta = {
        "year": year,
        "name": spec["name"],
        "shortName": spec["short_name"],
        "status": "archived",
        "intro": spec["intro"],
        "note": "历史资料已封存；正文按原稿转录，作者署名按来源文件标注。",
        "sourceFormat": spec["kind"],
        "sourceFolder": spec["folder"],
    }
    if not dry_run:
        (edition_dir / "edition.json").write_text(
            json.dumps(edition_meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    report["edition"] = edition_meta
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="将历史大赛 DOCX/XLSX 转为网站可审核的封存内容")
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE_ROOT)
    parser.add_argument("--force", action="store_true", help="清理并重建所选年份的导入目录")
    parser.add_argument("--dry-run", action="store_true", help="只盘点，不写入 content/ 或报告")
    parser.add_argument(
        "--years",
        type=int,
        nargs="+",
        help="只处理指定年份，例如 --years 2025；省略则处理全部历届",
    )
    args = parser.parse_args()

    if Image is None:
        print("缺少 Pillow，无法处理历史图片。", file=sys.stderr)
        return 2

    specs = ARCHIVE_SOURCES
    if args.years:
        wanted = set(args.years)
        specs = tuple(spec for spec in ARCHIVE_SOURCES if int(spec["year"]) in wanted)
        missing = wanted - {int(spec["year"]) for spec in specs}
        if missing:
            print(f"没有这些年份的导入配置: {sorted(missing)}", file=sys.stderr)
            return 2

    reports: list[dict[str, Any]] = []
    try:
        for spec in specs:
            report = import_edition(spec, args.source_root, args.force, args.dry_run)
            reports.append(report)
            print(
                f"{report['year']}: files={report['sourceFiles']} "
                f"source={report['sourceBytes']} bytes "
                f"warnings={len(report['warnings'])}"
            )
    except Exception as error:
        print(f"导入失败: {type(error).__name__}: {error}", file=sys.stderr)
        return 1

    if not args.dry_run:
        # A ``--years`` run only rebuilds part of the archive, so keep the
        # recorded entries for the years it did not touch.
        merged: dict[int, dict[str, Any]] = {}
        if args.years and REPORT_PATH.exists():
            try:
                previous = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
                for edition in previous.get("editions", []):
                    merged[int(edition["year"])] = edition
            except (ValueError, KeyError, TypeError):
                merged = {}
        for report in reports:
            merged[int(report["year"])] = report
        REPORT_PATH.write_text(
            json.dumps(
                {
                    "generatedAt": __import__("datetime").datetime.now().astimezone().isoformat(),
                    "sourceRoot": str(args.source_root),
                    "editions": [merged[year] for year in sorted(merged)],
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print("report=", REPORT_PATH)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
