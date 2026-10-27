"""
Step 2 of the full-pipeline evaluation: score the saved answers.

For each question it works out what actually happened:
  * answerable questions: correct / partly correct / incorrect / wrongly refused
  * out-of-scope questions: declined (by the cutoff or by the model) or answered anyway
and, for the answers that were given, it adds two RAGAS scores:
  * faithfulness      - is every claim in the answer supported by the retrieved sections?
  * answer relevancy  - does the answer actually address the question?

"Correct / partly / incorrect" and "declined" come from an LLM judge (a bigger
model than the one that wrote the answer) comparing the answer to the reference
answer in eval_set.json. The judge also gives a one-line reason, so you can
check its calls. Read those reasons: an LLM judge is useful, not infallible.

Groq's free tier has daily token limits. Scores are saved after every question,
so if you hit a limit just run the script again later and it carries on.
Each saved score remembers which answer it was computed for, so after running
generate_answers.py --fresh only the changed answers are re-scored.

Run (from the evaluation folder, evaluation environment active):
    python score_answers.py                 # score what is not scored yet, then report
    python score_answers.py --report-only   # just rebuild the report from saved scores

Output: results/scores.json, results/pipeline_results.json, results/pipeline_report.png
"""

import argparse
import asyncio
import json
import math
import os
import re
import sys
import time
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"
ANSWERS = RESULTS / "answers.json"
SCORES = RESULTS / "scores.json"

load_dotenv(HERE.parent / "rag-service" / ".env")  # for GROQ_API_KEY

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
# The judge should be a different (and stronger) model than the one being judged.
JUDGE_MODEL = os.getenv("JUDGE_MODEL", "openai/gpt-oss-120b")
# Groq gives every model its own daily token allowance. Answer relevancy is the easy job
# (write a question that an answer would address), so it runs on the second model to
# spread the load and stay inside the free tier.
RELEVANCY_MODEL = os.getenv("RELEVANCY_MODEL", "openai/gpt-oss-20b")
PAUSE_SECONDS = 10  # keeps us under Groq's tokens-per-minute limit
# Optional: "low", "medium" or "high". Lower means the judge thinks less, which uses far
# fewer of Groq's daily tokens. Unset = the model's default.
REASONING_EFFORT = os.getenv("JUDGE_REASONING_EFFORT")
EXTRA = {"reasoning_effort": REASONING_EFFORT} if REASONING_EFFORT else {}

CATEGORIES = ["direct", "paraphrase", "out_of_scope"]
LABELS = {"direct": "Direct", "paraphrase": "Paraphrased", "out_of_scope": "Out of scope"}

# outcome -> (legend label, colour)
OUTCOMES = {
    "correct": ("Correct", "#0072B2"),
    "partial": ("Partly correct", "#56B4E9"),
    "incorrect": ("Incorrect", "#D55E00"),
    "wrongly_refused": ("Wrongly refused", "#E69F00"),
    "declined_cutoff": ("Correctly declined (cutoff)", "#009E73"),
    "declined_model": ("Correctly declined (model)", "#8FD3B6"),
    "answered_anyway": ("Answered anyway", "#CC79A7"),
}

JUDGE_PROMPT = """You are grading an HR assistant's answer against a reference answer taken from the company handbook.

Question: {question}
Reference answer: {reference}
Assistant's answer: {answer}

Reply with JSON only, in exactly this form:
{{"declined": true or false, "matches_reference": "yes" or "partly" or "no", "reason": "one short sentence"}}

Rules:
- declined is true if the assistant says it does not have the information or cannot answer from the handbook (even if it adds a suggestion).
- matches_reference: do the key facts (numbers, limits, conditions) agree with the reference? "partly" means some key facts are right and others are missing or wrong. Ignore wording and formatting. If declined is true, use "no".
- If the reference says the topic is not covered in the handbook, declined should be true when the assistant admits it has no such information, and false if it states any policy or fact."""


# --------------------------------------------------------------------------
# Scoring (needs the Groq key; talks to the judge model)
# --------------------------------------------------------------------------
def parse_json(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.S)
        if not match:
            raise
        return json.loads(match.group(0))


def clean(value):
    """NaN is not valid JSON; store it as null."""
    if value is None:
        return None
    value = float(value)
    return None if math.isnan(value) else round(value, 4)


async def judge_answer(client, rec: dict) -> dict:
    prompt = JUDGE_PROMPT.format(
        question=rec["question"], reference=rec["reference_answer"], answer=rec["answer"]
    )
    resp = await client.chat.completions.create(
        model=JUDGE_MODEL,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0,
        max_tokens=2000,
        **EXTRA,
    )
    return parse_json(resp.choices[0].message.content)


async def score_one(rec: dict, client, faithfulness, relevancy) -> dict:
    if rec["cutoff_refused"]:
        out = {
            "declined": True,
            "declined_by": "cutoff",
            "matches_reference": "no",
            "reason": "Refused by the similarity cutoff, so the model was never called.",
        }
    else:
        verdict = await judge_answer(client, rec)
        declined = bool(verdict.get("declined"))
        out = {
            "declined": declined,
            "declined_by": "model" if declined else None,
            "matches_reference": verdict.get("matches_reference", "no"),
            "reason": verdict.get("reason", ""),
        }

    # RAGAS only makes sense for real answers to answerable questions.
    if rec["category"] != "out_of_scope" and not out["declined"]:
        f = await faithfulness.ascore(
            user_input=rec["question"], response=rec["answer"], retrieved_contexts=rec["contexts"]
        )
        r = await relevancy.ascore(user_input=rec["question"], response=rec["answer"])
        out["faithfulness"] = clean(f.value)
        out["answer_relevancy"] = clean(r.value)
    return out


def build_judges():
    from openai import AsyncOpenAI
    from ragas.embeddings import embedding_factory
    from ragas.llms import llm_factory
    from ragas.metrics.collections import AnswerRelevancy, Faithfulness

    key = os.getenv("GROQ_API_KEY")
    if not key:
        sys.exit("GROQ_API_KEY not found. It should be in rag-service/.env")

    # Groq speaks the OpenAI protocol, so the OpenAI client works with a different address.
    client = AsyncOpenAI(api_key=key, base_url=GROQ_BASE_URL, max_retries=8)
    llm = llm_factory(JUDGE_MODEL, client=client, max_tokens=3000, **EXTRA)
    relevancy_llm = llm_factory(RELEVANCY_MODEL, client=client, max_tokens=3000, **EXTRA)
    embeddings = embedding_factory("huggingface", "sentence-transformers/all-MiniLM-L6-v2")
    return client, Faithfulness(llm=llm), AnswerRelevancy(llm=relevancy_llm, embeddings=embeddings)


async def score_all(answers: list[dict], scores: dict, judges=None) -> dict:
    # A saved score only counts if it was computed for the CURRENT answer text.
    todo = [
        a for a in answers
        if scores.get(str(a["id"]), {}).get("answer") != a["answer"]
    ]
    if not todo:
        print("Everything is already scored.")
        return scores
    client, faithfulness, relevancy = judges or build_judges()

    for n, rec in enumerate(todo, start=1):
        try:
            scores[str(rec["id"])] = await score_one(rec, client, faithfulness, relevancy)
            scores[str(rec["id"])]["answer"] = rec["answer"]
        except Exception as e:  # noqa: BLE001  (keep going; failed ones are retried next run)
            msg = str(e)
            print(f"  ! question {rec['id']} failed: {msg[:700]}")
            if "per day" in msg.lower() or "tpd" in msg.lower():
                print("\nDaily Groq limit reached. Progress is saved; run again later to continue.")
                break
            continue
        SCORES.write_text(json.dumps(scores, indent=2, ensure_ascii=False))
        s = scores[str(rec["id"])]
        print(f"[{n:>2}/{len(todo)}] {rec['category']:<12} {rec['question'][:55]:<55} -> {outcome(rec, s)}")
        if not rec["cutoff_refused"]:
            await asyncio.sleep(PAUSE_SECONDS)
    return scores


# --------------------------------------------------------------------------
# Reporting (pure Python, no network)
# --------------------------------------------------------------------------
def outcome(rec: dict, sc: dict) -> str:
    if rec["category"] == "out_of_scope":
        if not sc["declined"]:
            return "answered_anyway"
        return "declined_cutoff" if sc.get("declined_by") == "cutoff" else "declined_model"
    if sc["declined"]:
        return "wrongly_refused"
    return {"yes": "correct", "partly": "partial"}.get(sc["matches_reference"], "incorrect")


def mean(values):
    values = [v for v in values if v is not None]
    return sum(values) / len(values) if values else float("nan")


def report(answers: list[dict], scores: dict) -> None:
    rows = []
    for a in answers:
        sc = scores.get(str(a["id"]))
        if sc is not None and sc.get("answer") == a["answer"]:
            rows.append({**a, **sc, "outcome": outcome(a, sc)})
    if not rows:
        print("Nothing scored yet.")
        return
    if len(rows) < len(answers):
        print(f"\nNote: {len(rows)} of {len(answers)} questions scored so far; run the script again to finish.")

    print("\nOutcomes by category")
    for cat in CATEGORIES:
        rs = [r for r in rows if r["category"] == cat]
        parts = []
        for key, (label, _) in OUTCOMES.items():
            k = sum(r["outcome"] == key for r in rs)
            if k:
                parts.append(f"{label}: {k}")
        print(f"  {LABELS[cat]:<13} (n={len(rs)})  " + ",  ".join(parts))

    print("\nRAGAS scores (answers that were given, 0 to 1, higher is better)")
    for cat in ("direct", "paraphrase"):
        rs = [r for r in rows if r["category"] == cat and r.get("faithfulness") is not None]
        if rs:
            print(
                f"  {LABELS[cat]:<13} n={len(rs):<3}"
                f" faithfulness {mean(r['faithfulness'] for r in rs):.3f}"
                f"   answer relevancy {mean(r['answer_relevancy'] for r in rs):.3f}"
            )

    problems = [r for r in rows if r["category"] != "out_of_scope" and r["outcome"] != "correct"]
    if problems:
        print("\nAnswerable questions that were not fully correct (judge's reason):")
        for r in problems:
            print(f"  [{OUTCOMES[r['outcome']][0]}] {r['question']}\n      {r['reason']}")

    low = [r for r in rows if r.get("faithfulness") is not None and r["faithfulness"] < 0.99]
    if low:
        print("\nAnswers with faithfulness below 1.0 (some claim not supported by the sections):")
        for r in low:
            print(f"  {r['faithfulness']:.2f}  {r['question']}")
            print(f"        answer: {r['answer'][:160]!r}")

    oos = [r for r in rows if r["category"] == "out_of_scope"]
    print("\nOut-of-scope answers, for you to read (the judge can be wrong):")
    for r in oos:
        print(f"  [{OUTCOMES[r['outcome']][0]}] {r['question']}")
        print(f"      -> {r['answer'][:200]!r}")

    make_figure(rows, RESULTS / "pipeline_report.png")
    (RESULTS / "pipeline_results.json").write_text(json.dumps(rows, indent=2, ensure_ascii=False))
    print(f"\nSaved {RESULTS / 'pipeline_report.png'} and pipeline_results.json")


def make_figure(rows: list[dict], path: Path) -> None:
    fig, (ax1, ax2) = plt.subplots(
        1, 2, figsize=(15, 5.4), gridspec_kw={"width_ratios": [1.25, 1]}
    )
    fig.suptitle("Full-pipeline evaluation: Nimbus handbook assistant", fontsize=14, fontweight="bold")

    # Left: what happened to every question, per category
    for i, cat in enumerate(CATEGORIES):
        rs = [r for r in rows if r["category"] == cat]
        left = 0.0
        for key, (label, color) in OUTCOMES.items():
            k = sum(r["outcome"] == key for r in rs)
            if not k:
                continue
            share = k / len(rs)
            ax1.barh(i, share, left=left, color=color, edgecolor="white", linewidth=1.5)
            ax1.text(
                left + share / 2, i, str(k), ha="center", va="center", fontsize=10,
                color="white" if key in ("correct", "incorrect", "answered_anyway", "declined_cutoff") else "#222222",
                fontweight="bold",
            )
            left += share
    ax1.set_yticks(range(len(CATEGORIES)))
    ax1.set_yticklabels([f"{LABELS[c]}\n(n={sum(r['category'] == c for r in rows)})" for c in CATEGORIES])
    ax1.invert_yaxis()
    ax1.set_xlim(0, 1)
    ax1.xaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0))
    ax1.set_title("What happened to each question (numbers are question counts)", fontsize=10)
    handles = [
        plt.Rectangle((0, 0), 1, 1, color=color)
        for key, (label, color) in OUTCOMES.items()
        if any(r["outcome"] == key for r in rows)
    ]
    names = [label for key, (label, _) in OUTCOMES.items() if any(r["outcome"] == key for r in rows)]
    ax1.legend(handles, names, loc="upper center", bbox_to_anchor=(0.5, -0.1), ncol=3, frameon=False, fontsize=9)

    # Right: RAGAS scores per answer
    metrics = [("faithfulness", "Faithfulness"), ("answer_relevancy", "Answer\nrelevancy")]
    cats = [("direct", "o", "#0072B2"), ("paraphrase", "s", "#009E73")]
    rng = np.random.default_rng(0)
    xticks, xlabels = [], []
    for m, (key, name) in enumerate(metrics):
        for c, (cat, marker, color) in enumerate(cats):
            vals = [r[key] for r in rows if r["category"] == cat and r.get(key) is not None]
            x0 = m * 3 + c
            if vals:
                ax2.scatter(x0 + rng.uniform(-0.12, 0.12, len(vals)), vals, marker=marker, color=color,
                            s=44, alpha=0.85, edgecolor="white", linewidth=0.6)
                ax2.hlines(np.mean(vals), x0 - 0.3, x0 + 0.3, color="#222222", linewidth=2)
                ax2.text(x0, 1.045, f"mean {np.mean(vals):.2f}", ha="center", fontsize=9)
            xticks.append(x0)
            xlabels.append(f"{name}\n{LABELS[cat]}")
    ax2.set_xticks(xticks)
    ax2.set_xticklabels(xlabels, fontsize=9)
    ax2.set_ylim(0, 1.1)
    ax2.set_ylabel("RAGAS score")
    ax2.set_title("Quality of the answers that were given (each dot is one question)", fontsize=10)

    for ax in (ax1, ax2):
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    fig.savefig(path, dpi=160)
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report-only", action="store_true")
    args = parser.parse_args()

    if not ANSWERS.exists():
        sys.exit("results/answers.json not found. Run generate_answers.py first.")
    answers = json.loads(ANSWERS.read_text())
    scores = json.loads(SCORES.read_text()) if SCORES.exists() else {}

    if not args.report_only:
        scores = asyncio.run(score_all(answers, scores))
    report(answers, scores)


if __name__ == "__main__":
    main()
