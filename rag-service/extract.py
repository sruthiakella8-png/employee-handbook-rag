"""
Turn an uploaded handbook file into chunks ready for embedding.

Supported: .pdf, .docx, .md, .markdown, .txt
Not supported: .doc (old Word), scanned PDFs (no text layer, would need OCR).

Plan
  1. Read the file into "blocks": headings and paragraphs, in order.
       - Markdown/text: your existing chunk_markdown is used first, unchanged.
       - PDF: headings are guessed from font size.   Word: from the Heading styles.
  2. If the file has recognisable headings -> one chunk per section.
     If not -> split by size (about 800 characters, small overlap, paragraph boundaries),
     each chunk labelled with the nearest heading, else "Page N" (PDF) or "Part N".

Every chunk is {"title": str, "text": str}, the same shape chunk_markdown returns.
"""

import io
import re
from collections import Counter

MAX_BYTES = 10 * 1024 * 1024
MAX_PDF_PAGES = 200
MIN_HEADINGS = 3        # fewer than this and we treat the file as "no headings"
MIN_TEXT_PER_PAGE = 25  # average characters per page below this = scanned PDF
TARGET = 800            # fallback chunk size in characters
HARD_MAX = 1500         # a section longer than this is split (MiniLM only reads ~1000 chars)
OVERLAP = 120
MIN_SECTION = 30        # a section with less text than this (a heading with a few words) is merged into its neighbour

EXTENSIONS = (".pdf", ".docx", ".md", ".markdown", ".txt")


class IngestError(Exception):
    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


# ---------------------------------------------------------------------------
# Readers: bytes -> blocks.  block = {"type": "heading"|"para", "level": int, "text": str, "page": int|None}
# ---------------------------------------------------------------------------
def _read_docx(raw):
    try:
        import docx
        from docx.table import Table
        from docx.text.paragraph import Paragraph
        d = docx.Document(io.BytesIO(raw))
    except Exception:
        raise IngestError("unreadable", "This Word file could not be opened. Is it a valid .docx?")

    # Pass 1: many real handbooks use bold, bigger text in the "Normal" style instead of Heading styles.
    # Learn the body font size, then treat short all-bold lines in clearly larger text as headings.
    sizes = Counter()
    for p in d.paragraphs:
        for r in p.runs:
            if r.text.strip() and r.font.size:
                sizes[r.font.size.pt] += len(r.text)
    body = sizes.most_common(1)[0][0] if sizes else 11
    if sizes and sizes.most_common(1)[0][1] < 0.3 * sum(sizes.values()):
        body = 11   # most text has no explicit size (inherits the default), so assume the usual 11 pt
    unsized = sum(len(r.text) for p in d.paragraphs for r in p.runs if r.text.strip() and not r.font.size)
    if unsized > sum(sizes.values()):
        body = 11
    bold_sizes = Counter()
    for p in d.paragraphs:
        runs = [r for r in p.runs if r.text.strip()]
        t = p.text.strip()
        if runs and all(r.bold for r in runs) and len(t) < 100 and "\t" not in t and not t.endswith((".", ",", ";")):
            sz = max((r.font.size.pt for r in runs if r.font.size), default=0)
            if sz >= body * 1.25:
                bold_sizes[sz] += 1
    big = sorted(bold_sizes, reverse=True)[:3]

    blocks = []
    for child in d.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            p = Paragraph(child, d)
            text = p.text.strip()
            if not text:
                continue
            style = (p.style.name if p.style is not None else "") or ""
            m = re.match(r"Heading\s*(\d)", style)
            runs = [r for r in p.runs if r.text.strip()]
            sz = max((r.font.size.pt for r in runs if r.font.size), default=0)
            if m:
                blocks.append({"type": "heading", "level": int(m.group(1)), "text": text, "page": None})
            elif style == "Title":
                blocks.append({"type": "heading", "level": 1, "text": text, "page": None})
            elif (runs and all(r.bold for r in runs) and sz in big and len(text) < 100
                  and "\t" not in text and not text.endswith((".", ",", ";"))):
                blocks.append({"type": "heading", "level": big.index(sz) + 1, "text": text, "page": None})
            elif (runs and all(r.bold for r in runs) and len(text) < 80
                  and re.match(r"^\d+(\.\d+)*\.?\s+\S", text) and not text.endswith(".")):
                blocks.append({"type": "heading", "level": len(big) + 1, "text": text, "page": None})
            else:
                blocks.append({"type": "para", "level": 0, "text": text, "page": None})
        elif tag == "tbl":
            rows = []
            for row in Table(child, d).rows:
                cells = []
                for c in row.cells:
                    t = " ".join(c.text.split())
                    if t and (not cells or cells[-1] != t):  # merged cells repeat their text
                        cells.append(t)
                if cells:
                    rows.append(" | ".join(cells))
            if rows:
                blocks.append({"type": "para", "level": 0, "text": "\n".join(rows), "page": None})
    return blocks


def _pdf_lines(page):
    """Group a page's characters into lines: (text, dominant font size, is_bold)."""
    words = page.extract_words(extra_attrs=["size", "fontname"], keep_blank_chars=False, use_text_flow=True)
    lines, cur, cur_top = [], [], None
    for w in words:
        if cur and abs(w["top"] - cur_top) > 2:
            lines.append(cur)
            cur = []
        if not cur:
            cur_top = w["top"]
        cur.append(w)
    if cur:
        lines.append(cur)
    out = []
    for ws in lines:
        text = " ".join(w["text"] for w in ws).strip()
        if not text:
            continue
        sizes = Counter(round(w["size"], 1) for w in ws for _ in w["text"])
        size = sizes.most_common(1)[0][0]
        bold = sum(len(w["text"]) for w in ws if "bold" in w["fontname"].lower()) > 0.6 * sum(len(w["text"]) for w in ws)
        gap = ws[0]["top"]
        out.append({"text": text, "size": size, "bold": bold, "top": gap, "bottom": ws[0]["bottom"]})
    return out


def _read_pdf(raw):
    import pdfplumber
    try:
        pdf = pdfplumber.open(io.BytesIO(raw))
    except Exception:
        raise IngestError("unreadable", "This PDF could not be opened. It may be damaged or password protected.")
    with pdf:
        n = len(pdf.pages)
        if n > MAX_PDF_PAGES:
            raise IngestError("too_long", f"This PDF has {n} pages. The limit is {MAX_PDF_PAGES}.")
        per_page = []
        try:
            for page in pdf.pages:
                per_page.append(_pdf_lines(page))
        except Exception:
            raise IngestError("unreadable", "This PDF could not be read.")
    total = sum(len(l["text"]) for p in per_page for l in p)
    if n == 0 or total / max(n, 1) < MIN_TEXT_PER_PAGE:
        raise IngestError("scanned", "This PDF has no readable text, so it looks scanned. Please upload a text-based PDF, a Word file or Markdown.")

    # Repeated header/footer lines (same text on many pages) and bare page numbers are noise.
    seen = Counter()
    for p in per_page:
        for t in {re.sub(r"\d+", "#", l["text"]) for l in p}:
            seen[t] += 1
    repeated = {t for t, c in seen.items() if n >= 2 and c >= max(2, 0.5 * n)}

    def noise(l):
        return re.sub(r"\d+", "#", l["text"]) in repeated or re.fullmatch(r"(page\s*)?\d{1,4}(\s*(of|/)\s*\d{1,4})?", l["text"].strip(), re.I)

    sizes = Counter()
    for p in per_page:
        for l in p:
            if not noise(l):
                sizes[l["size"]] += len(l["text"])
    body = sizes.most_common(1)[0][0] if sizes else 10
    big = sorted({s for s in sizes if s >= body * 1.12}, reverse=True)[:3]  # heading sizes, largest first

    def heading_level(l):
        t = l["text"]
        if len(t) > 110 or t.endswith((".", ",", ";")) and len(t) > 60:
            return 0
        if l["size"] in big:
            return big.index(l["size"]) + 1
        # same-size bold line, short, e.g. "4.2 Leave Policy" or "SICK LEAVE"
        if l["bold"] and len(t) < 80 and l["size"] >= body * 0.98 and (re.match(r"^\d+(\.\d+)*\.?\s+\S", t) or (t.isupper() and sum(c.isalpha() for c in t) >= 4 and not re.search(r"[\[\];:]", t))):
            return len(big) + 1
        return 0

    blocks = []
    for pno, lines in enumerate(per_page, start=1):
        prev_bottom, para = None, []

        def flush():
            if para:
                blocks.append({"type": "para", "level": 0, "text": " ".join(para), "page": pno})
                para.clear()

        for l in lines:
            if noise(l):
                continue
            lvl = heading_level(l)
            if lvl:
                flush()
                if blocks and blocks[-1]["type"] == "heading" and blocks[-1]["level"] == lvl and blocks[-1]["page"] == pno:
                    blocks[-1]["text"] += " " + l["text"]  # a heading that wrapped onto two lines
                else:
                    blocks.append({"type": "heading", "level": lvl, "text": l["text"], "page": pno})
            else:
                bullet = re.match(r"^([•\-–*▪●]|\d+[.)]|[a-z][.)])\s", l["text"])
                gap = prev_bottom is not None and (l["top"] - prev_bottom) > body * 0.9
                if para and (gap or bullet):
                    flush()
                para.append(l["text"])
            prev_bottom = l["bottom"]
        flush()
    return blocks


def _read_text(raw, name):
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise IngestError("unreadable", "This file isn't UTF-8 text. Save it as UTF-8, or upload a PDF or Word file.")
    return text


def _blocks_from_text(text):
    """Plain text / markdown without ### headings: treat '#' lines as headings, blank lines as paragraph breaks."""
    blocks = []
    for chunk in re.split(r"\n\s*\n", text):
        chunk = chunk.strip()
        if not chunk:
            continue
        m = re.match(r"^(#{1,6})\s+(.+?)\s*#*$", chunk)
        if m and "\n" not in chunk:
            blocks.append({"type": "heading", "level": len(m.group(1)), "text": m.group(2), "page": None})
        else:
            blocks.append({"type": "para", "level": 0, "text": chunk, "page": None})
    return blocks


# ---------------------------------------------------------------------------
# Chunkers: blocks -> [{"title", "text"}]
# ---------------------------------------------------------------------------
def _split_size(paras, title, target=TARGET):
    """Pack paragraphs into ~target-character pieces, breaking only between paragraphs
    (a single oversize paragraph is cut at sentence ends), with a short overlap."""
    pieces = []
    for p in paras:
        if len(p) <= HARD_MAX:
            pieces.append(p)
        else:
            sentences = re.split(r"(?<=[.!?])\s+", p)
            buf = ""
            for s in sentences:
                if buf and len(buf) + len(s) + 1 > target:
                    pieces.append(buf)
                    buf = ""
                buf = (buf + " " + s).strip()
            if buf:
                pieces.append(buf)
    chunks, buf = [], ""
    for p in pieces:
        if buf and len(buf) + len(p) + 2 > target:
            chunks.append(buf)
            tail = buf[-OVERLAP:]
            tail = tail[tail.find(" ") + 1:] if " " in tail else ""   # start overlap on a word boundary
            buf = (tail + "\n\n" + p).strip() if tail else p
        else:
            buf = (buf + "\n\n" + p).strip() if buf else p
    if buf:
        chunks.append(buf)
    return chunks


def _chunk_by_headings(blocks):
    sections, path = [], []   # path: [(level, text)]
    cur = {"title": "Introduction", "paras": []}
    for b in blocks:
        if b["type"] == "heading":
            if cur["paras"]:
                sections.append(cur)
            path = [(lv, t) for lv, t in path if lv < b["level"]] + [(b["level"], b["text"])]
            title = path[-1][1] if len(path) == 1 else f'{path[-2][1]} > {path[-1][1]}'
            cur = {"title": title, "paras": []}
        else:
            cur["paras"].append(b["text"])
    if cur["paras"]:
        sections.append(cur)

    sections = [s for s in sections if not TOC.search(s["title"])]   # a contents list is only noise to search

    # Merge tiny sections into the next one so we don't index a heading with one line of text.
    merged = []
    carry = None
    for s in sections:
        if carry:
            s = {"title": s["title"], "paras": [carry["title"]] + carry["paras"] + s["paras"]}
            carry = None
        if sum(map(len, s["paras"])) < MIN_SECTION:
            carry = s
        else:
            merged.append(s)
    if carry:
        if merged:
            merged[-1]["paras"] += [carry["title"]] + carry["paras"]
        else:
            merged.append(carry)

    chunks = []
    for s in merged:
        body = "\n\n".join(s["paras"])
        if len(body) <= HARD_MAX:
            chunks.append({"title": s["title"], "text": f'{s["title"]}\n\n{body}'})
        else:
            parts = _split_size(s["paras"], s["title"])
            for i, part in enumerate(parts, 1):
                title = s["title"] if i == 1 else f'{s["title"]} (part {i})'
                chunks.append({"title": title, "text": f"{s['title']}\n\n{part}"})
    return chunks


def _chunk_by_size(blocks):
    """No usable headings: size-based chunks, labelled with the nearest heading, else the page, else 'Part N'."""
    chunks = []
    flat = []   # (paragraph text, nearest heading, page)
    heading = None
    for b in blocks:
        if b["type"] == "heading":
            heading = b["text"]
        else:
            flat.append((b["text"], heading, b["page"]))
    # pack paragraph by paragraph so each chunk knows where it started
    cur, cur_len, cur_label, cur_page = [], 0, None, None
    for text, h, pg in flat:
        pieces = [text] if len(text) <= HARD_MAX else _split_size([text], None)
        for p in pieces:
            if cur and cur_len + len(p) + 2 > TARGET:
                chunks.append((cur, cur_label, cur_page))
                tail = cur[-1][-OVERLAP:]
                tail = tail[tail.find(" ") + 1:] if " " in tail else ""
                cur, cur_len = ([tail] if tail else []), len(tail)
                cur_label, cur_page = h, pg
            if not cur:
                cur_label, cur_page = h, pg
            cur.append(p)
            cur_len += len(p) + 2
    if cur:
        chunks.append((cur, cur_label, cur_page))
    out, used = [], Counter()
    for i, (paras, h, pg) in enumerate(chunks, 1):
        title = h or (f"Page {pg}" if pg else f"Part {i}")
        used[title] += 1
        if used[title] > 1:
            title = f"{title} (part {used[title]})"   # keep source labels distinguishable
        out.append({"title": title, "text": "\n\n".join(paras)})
    return out


def _demote_title_levels(blocks):
    """A top heading level used only once or twice is the document title (cover page), not a section.
    Left in, it would become the parent of every section, so turn it into plain text."""
    while True:
        counts = Counter(b["level"] for b in blocks if b["type"] == "heading")
        if len(counts) < 2:
            return blocks
        top = min(counts)
        positions = [i for i, b in enumerate(blocks) if b["type"] == "heading" and b["level"] == top]
        on_cover = counts[top] <= 5 and positions[-1] < 0.1 * len(blocks)   # all clustered at the very start
        if counts[top] > 2 and not on_cover:
            return blocks
        for b in blocks:
            if b["type"] == "heading" and b["level"] == top:
                b["type"] = "para"


TOC = re.compile(r"table of contents?|^contents$", re.I)


def blocks_to_chunks(blocks):
    blocks = _demote_title_levels(blocks)
    headings = [b for b in blocks if b["type"] == "heading"]
    # Headings count only if the file has several and they actually have text under them.
    if len(headings) >= MIN_HEADINGS:
        chunks = _chunk_by_headings(blocks)
        if len(chunks) >= 2:
            return chunks, "sections"
    return _chunk_by_size(blocks), "size"


# ---------------------------------------------------------------------------
# Entry point used by /ingest
# ---------------------------------------------------------------------------
def extract_chunks(filename, raw, chunk_markdown):
    """Returns (chunks, method) where method is 'markdown', 'sections' or 'size'."""
    name = (filename or "").lower()
    if name.endswith(".doc"):
        raise IngestError("unsupported", "Old .doc files aren't supported. Save it as .docx or PDF and upload again.")
    if not name.endswith(EXTENSIONS):
        raise IngestError("unsupported", "Unsupported file type. Upload a PDF, Word (.docx), Markdown or text file.")
    if not raw:
        raise IngestError("empty", "The file is empty.")
    if len(raw) > MAX_BYTES:
        raise IngestError("too_large", f"The file is larger than {MAX_BYTES // (1024 * 1024)} MB.", 413)

    if name.endswith((".md", ".markdown", ".txt")):
        text = _read_text(raw, name)
        if not text.strip():
            raise IngestError("empty", "The file is empty.")
        chunks = chunk_markdown(text)           # your existing splitter, unchanged
        if len(chunks) >= 2:
            return chunks, "markdown"
        blocks = _blocks_from_text(text)
    elif name.endswith(".docx"):
        blocks = _read_docx(raw)
    else:
        blocks = _read_pdf(raw)

    if not blocks:
        raise IngestError("empty", "No readable text was found in the file.")
    chunks, method = blocks_to_chunks(blocks)
    if not chunks:
        raise IngestError("empty", "No readable text was found in the file.")
    return chunks, method
