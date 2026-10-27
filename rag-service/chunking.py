import re
def chunk_markdown(text: str) -> list[dict]:
    """Split a handbook into chunks, one per '### ' subsection.

    A '#' or '##' heading ends the current chunk, so the next section's
    heading never leaks into the previous chunk. If the file has no '### '
    headers, we fall back to splitting on blank lines.
    """
    chunks, title, lines = [], None, []

    def flush():
        body = "\n".join(lines).strip()
        if title is not None and body:
            chunks.append({"title": title, "text": f"{title}\n{body}"})

    for line in text.splitlines():
        if line.startswith("### "):
            flush()
            title, lines = line[4:].strip(), []
        elif re.match(r"#{1,2} ", line):  # a higher-level heading ends the chunk
            flush()
            title, lines = None, []
        elif title is not None:
            lines.append(line)
    flush()

    if chunks:
        return chunks

    # Fallback: paragraph-based chunking
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    for i, p in enumerate(paragraphs, start=1):
        chunks.append({"title": f"Section {i}", "text": p})
    return chunks