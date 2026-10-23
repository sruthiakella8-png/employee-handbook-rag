def chunk_markdown(text: str) -> list[dict]:
    """Split a handbook into chunks, one per '### ' subsection.

    Returns a list of {"title": ..., "text": ...}. Same strategy as the Day 1
    script, so retrieval behaves the same way. If the file has no '### '
    headers, we fall back to splitting on blank lines so uploads of other
    layouts still produce something usable.
    """
    chunks = []

    sections = text.split("### ")
    for section in sections[1:]:  # skip anything before the first '###'
        title, _, body = section.strip().partition("\n")
        title, body = title.strip(), body.strip()
        if body:
            chunks.append({"title": title, "text": f"{title}\n{body}"})

    if chunks:
        return chunks

    # Fallback: paragraph-based chunking
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    for i, p in enumerate(paragraphs, start=1):
        chunks.append({"title": f"Section {i}", "text": p})
    return chunks
