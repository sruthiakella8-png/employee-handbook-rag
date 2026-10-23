"""
Handbook RAG service (FastAPI)

Endpoints:
  GET  /health   quick check that the service is up
  POST /ingest   upload a handbook file -> chunk -> embed -> store in Postgres
  POST /query    ask a question -> retrieve chunks -> generate a grounded answer

Django owns the table definitions (handbook_document, handbook_chunk).
This service only reads and writes rows in them.

Run:  uvicorn main:app --reload --port 8001
Docs: http://127.0.0.1:8001/docs
"""

from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware

from fastapi import FastAPI, File, HTTPException, UploadFile
from groq import Groq
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

import config
from chunking import chunk_markdown
from db import pool

# Heavy objects live here so they are created ONCE at startup, not per request.
state = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open()
    print("Loading embedding model...")
    state["embedder"] = SentenceTransformer(config.EMBEDDING_MODEL)
    state["groq"] = Groq(api_key=config.GROQ_API_KEY)
    print("Ready.")
    yield
    pool.close()


app = FastAPI(title="Handbook RAG service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------
@app.post("/ingest")
def ingest(file: UploadFile = File(...)):
    raw = file.file.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(400, "Only UTF-8 text/markdown files are supported for now.")

    chunks = chunk_markdown(text)
    if not chunks:
        raise HTTPException(400, "No content found in the uploaded file.")

    embeddings = state["embedder"].encode([c["text"] for c in chunks])

    # Everything below runs in ONE transaction: if anything fails, nothing is
    # saved, so you never end up with a half-ingested handbook.
    with pool.connection() as conn:
        doc_id = conn.execute(
            """
            INSERT INTO handbook_document (file_name, status, chunk_count, uploaded_at)
            VALUES (%s, 'processing', 0, now())
            RETURNING id
            """,
            (file.filename,),
        ).fetchone()[0]

        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO handbook_chunk (document_id, section_title, text, embedding)
                VALUES (%s, %s, %s, %s)
                """,
                [
                    (doc_id, c["title"], c["text"], emb)
                    for c, emb in zip(chunks, embeddings)
                ],
            )

        # The newest upload becomes the active handbook; older ones are retired.
        conn.execute(
            "UPDATE handbook_document SET status = 'replaced' WHERE status = 'active'"
        )
        conn.execute(
            "UPDATE handbook_document SET status = 'active', chunk_count = %s WHERE id = %s",
            (len(chunks), doc_id),
        )

    return {"document_id": doc_id, "file_name": file.filename, "chunks": len(chunks)}


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------
class QueryRequest(BaseModel):
    question: str


SEARCH_SQL = """
    SELECT c.section_title, c.text, 1 - (c.embedding <=> %s) AS similarity
    FROM handbook_chunk c
    JOIN handbook_document d ON d.id = c.document_id
    WHERE d.status = 'active'
    ORDER BY c.embedding <=> %s
    LIMIT %s
"""


@app.post("/query")
def query(req: QueryRequest):
    question = req.question.strip()
    if not question:
        raise HTTPException(400, "Question cannot be empty.")

    q_emb = state["embedder"].encode(question)

    # <=> is pgvector's cosine distance, matching the HNSW index's operator class.
    with pool.connection() as conn:
        rows = conn.execute(SEARCH_SQL, (q_emb, q_emb, config.TOP_K)).fetchall()

    if not rows:
        return {
            "answer": "No handbook has been uploaded yet.",
            "sources": [],
        }
    if rows[0][2] < config.MIN_SIMILARITY:
        return {
            "answer": "I don't have that information in the handbook.",
            "sources": [],
        }

    context = "\n\n---\n\n".join(text for _, text, _ in rows)

    prompt = f"""You are an HR assistant. Answer the employee's question using
ONLY the handbook excerpts below. If the excerpts don't contain the answer,
say you don't have that information rather than guessing.

Handbook excerpts:
{context}

Employee question: {question}

Answer:"""

    response = state["groq"].chat.completions.create(
        model=config.GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
    )

    return {
        "answer": response.choices[0].message.content,
        "sources": [
            {"section_title": title, "similarity": round(float(sim), 3)}
            for title, _, sim in rows
        ],
    }
