"""
Step 1 of the full-pipeline evaluation: collect the assistant's real answers.

Every question in eval_set.json is sent to the LIVE RAG service exactly the way
the web app sends it (log in to Django, then POST /query with the token). For
each question we save the answer, the sections it consulted, and the text of
those sections (RAGAS needs the text the model was shown).

Needs running: Django (port 8000) and the RAG service (port 8001).

Run (from the evaluation folder, with the evaluation environment active):
    python generate_answers.py            # resumes if a run was interrupted
    python generate_answers.py --fresh    # start over (do this after changing the pipeline)

Output: results/answers.json
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import psycopg
import requests

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"
ANSWERS = RESULTS / "answers.json"

sys.path.insert(0, str(HERE.parent / "rag-service"))
import config  # noqa: E402  (gives us DATABASE_URL and loads rag-service/.env)

DJANGO_URL = os.getenv("DJANGO_URL", "http://127.0.0.1:8000")
RAG_URL = os.getenv("RAG_URL", "http://127.0.0.1:8001")
EVAL_USER = os.getenv("EVAL_USER", "employee@nimbus.com")
EVAL_PASSWORD = os.getenv("EVAL_PASSWORD", "Employee@123")

# Groq's free tier allows about 8,000 tokens per minute, and every question
# uses roughly 1,500. A pause between questions keeps us under that.
PAUSE_SECONDS = 8
MAX_ATTEMPTS = 5


def login() -> str:
    r = requests.post(
        f"{DJANGO_URL}/api/auth/login/",
        json={"username": EVAL_USER, "password": EVAL_PASSWORD},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["access"]


def load_chunk_texts() -> dict[str, str]:
    """section title -> chunk text, for the ACTIVE handbook."""
    with psycopg.connect(config.DATABASE_URL) as conn:
        rows = conn.execute(
            """
            SELECT c.section_title, c.text
            FROM handbook_chunk c
            JOIN handbook_document d ON d.id = c.document_id
            WHERE d.status = 'active'
            """
        ).fetchall()
    return dict(rows)


def ask(question: str, state: dict) -> dict:
    for attempt in range(1, MAX_ATTEMPTS + 1):
        r = requests.post(
            f"{RAG_URL}/query",
            json={"question": question},
            headers={"Authorization": f"Bearer {state['token']}"},
            timeout=90,
        )
        if r.status_code == 200:
            return r.json()
        if r.status_code == 401:  # token expired mid-run
            state["token"] = login()
            continue
        wait = 15 * attempt  # usually Groq's rate limit surfacing as a 5xx
        print(f"    HTTP {r.status_code}; waiting {wait}s then retrying ({attempt}/{MAX_ATTEMPTS})")
        time.sleep(wait)
    raise RuntimeError(f"Gave up on: {question}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fresh", action="store_true", help="ignore saved answers and start over")
    args = parser.parse_args()

    questions = json.loads((HERE / "eval_set.json").read_text())
    RESULTS.mkdir(exist_ok=True)

    done: dict[int, dict] = {}
    if ANSWERS.exists() and not args.fresh:
        done = {r["id"]: r for r in json.loads(ANSWERS.read_text())}
        print(f"Resuming: {len(done)} of {len(questions)} already answered.")

    chunk_texts = load_chunk_texts()
    if not chunk_texts:
        sys.exit("No active handbook found in the database. Upload one on the Admin page first.")

    state = {"token": login()}

    for n, q in enumerate(questions, start=1):
        if q["id"] in done:
            continue
        data = ask(q["question"], state)
        titles = [s["section_title"] for s in data["sources"]]
        missing = [t for t in titles if t not in chunk_texts]
        if missing:
            sys.exit(f"Sections {missing} are not in the active handbook. Is a different document active?")

        done[q["id"]] = {
            **q,
            "answer": data["answer"],
            "sources": data["sources"],
            "contexts": [chunk_texts[t] for t in titles],
            "cutoff_refused": len(data["sources"]) == 0,
        }
        ordered = [done[i] for i in sorted(done)]
        ANSWERS.write_text(json.dumps(ordered, indent=2, ensure_ascii=False))
        print(f"[{n:>2}/{len(questions)}] {q['category']:<12} {len(titles)} sections  {q['question'][:60]}")
        time.sleep(PAUSE_SECONDS)

    print(f"\nDone. Saved {ANSWERS}")
    print("Next: python score_answers.py")


if __name__ == "__main__":
    main()
