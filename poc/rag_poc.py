"""
Week 1, Day 1 — RAG Proof of Concept
=====================================
Goal: prove the full RAG loop works end to end, with no Django/FastAPI/React yet.

Pipeline:
  1. Load the handbook text
  2. Split it into chunks
  3. Embed each chunk (sentence-transformers, runs locally, free)
  4. Store the chunks + embeddings in ChromaDB (local vector database)
  5. Take a question -> embed it -> retrieve the most similar chunks
  6. Send the question + retrieved chunks to Groq (Llama 3.3) -> get a grounded answer

Before running:
  1. pip install -r requirements.txt
  2. Sign up free at https://console.groq.com and create an API key
  3. Create a file named ".env" in this same folder with one line:
         GROQ_API_KEY=your_key_here
"""

import os
from dotenv import load_dotenv
import chromadb
from sentence_transformers import SentenceTransformer
from groq import Groq

load_dotenv()  # reads GROQ_API_KEY from the .env file

# ---------------------------------------------------------------------------
# STEP 1: Load the handbook
# ---------------------------------------------------------------------------
with open("employee_handbook.md", "r", encoding="utf-8") as f:
    handbook_text = f.read()

print(f"Loaded handbook: {len(handbook_text)} characters\n")

# ---------------------------------------------------------------------------
# STEP 2: Chunk the document
# ---------------------------------------------------------------------------
# Simple strategy for Day 1: split on "###" subsection headers, since our
# handbook is already structured that way. Each chunk = one policy subsection.
# (We'll improve this chunking strategy later once we see how retrieval performs.)

raw_sections = handbook_text.split("### ")
chunks = []
for section in raw_sections[1:]:  # skip the text before the first "###"
    lines = section.strip().split("\n", 1)
    title = lines[0].strip()
    body = lines[1].strip() if len(lines) > 1 else ""
    chunk_text = f"{title}\n{body}"
    chunks.append(chunk_text)

print(f"Split handbook into {len(chunks)} chunks\n")
print("Example chunk:\n" + "-" * 50)
print(chunks[0])
print("-" * 50 + "\n")

# ---------------------------------------------------------------------------
# STEP 3: Embed the chunks
# ---------------------------------------------------------------------------
# all-MiniLM-L6-v2 is small, fast, free, and runs locally (no API call).
print("Loading embedding model (first run downloads it, ~80MB)...")
embedder = SentenceTransformer("all-MiniLM-L6-v2")

chunk_embeddings = embedder.encode(chunks).tolist()
print(f"Generated {len(chunk_embeddings)} embeddings, "
      f"each with {len(chunk_embeddings[0])} dimensions\n")

# ---------------------------------------------------------------------------
# STEP 4: Store chunks + embeddings in ChromaDB
# ---------------------------------------------------------------------------
chroma_client = chromadb.Client()  # in-memory for Day 1; we'll persist later
collection = chroma_client.get_or_create_collection(name="handbook")

collection.add(
    documents=chunks,
    embeddings=chunk_embeddings,
    ids=[f"chunk_{i}" for i in range(len(chunks))],
)
print("Stored all chunks in ChromaDB\n")

# ---------------------------------------------------------------------------
# STEP 5: Retrieve relevant chunks for a question
# ---------------------------------------------------------------------------
def retrieve(question: str, top_k: int = 3):
    question_embedding = embedder.encode([question]).tolist()
    results = collection.query(
        query_embeddings=question_embedding,
        n_results=top_k,
    )
    return results["documents"][0]  # list of top_k chunk texts


# ---------------------------------------------------------------------------
# STEP 6: Generate a grounded answer using Groq
# ---------------------------------------------------------------------------
groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

def answer_question(question: str):
    retrieved_chunks = retrieve(question)
    context = "\n\n---\n\n".join(retrieved_chunks)

    prompt = f"""You are an HR assistant. Answer the employee's question using
ONLY the handbook excerpts below. If the excerpts don't contain the answer,
say you don't have that information rather than guessing.

Handbook excerpts:
{context}

Employee question: {question}

Answer:"""

    response = groq_client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[{"role": "user", "content": prompt}],
    )

    return response.choices[0].message.content, retrieved_chunks


# ---------------------------------------------------------------------------
# Try it out
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    test_questions = [
        "How many sick leave days do I get?",
        "Can I work remotely full time?",
        "What happens to my unused leave if I resign?",
        "Does the company cover my gym membership?",
        "Does the company reimburse on first-class flight tickets in case any business/work trip is assigned to me?",
        "Does the company provide any pet-friendly services?",
        "What's the maternity leave policy and do I get paid during it?",
        "How much time off do new parents get?",
        "If I take unpaid leave, does my health insurance still cover me?",
        "If I've worked here for 8 months, how many annual leave days have I accrued?",
        "What is 7+7?",

    ]

    for q in test_questions:
        print("=" * 70)
        print(f"Q: {q}")
        answer, sources = answer_question(q)
        print(f"\nA: {answer}")
        print(f"\n[Retrieved from {len(sources)} chunks]")
        print()
