"""
Retrieval evaluation for the Nimbus handbook assistant.

For every question in eval_set.json this runs ONLY the retrieval half of the
pipeline (embed the question, search pgvector, take the top 3 chunks). It does
not call Groq, so it is free, fast and needs no login.

It reports:
  * hit@1 / hit@3 / recall@3: did retrieval find the right handbook section?
  * how the top-1 similarity score separates answerable from out-of-scope
    questions, and what each possible cutoff would do (false refusals vs
    false answers), so MIN_SIMILARITY can be chosen from data, not a guess.

Run (from the project root, with the rag-service environment active):
    cd eval
    python retrieval_eval.py

Output: results/retrieval_report.png and results/retrieval_results.json
"""

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # draw to files, no window needed
import matplotlib.pyplot as plt
import numpy as np

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"

# Always judge the top 3, whatever TOP_K the app uses, so results stay comparable over time.
EVAL_K = 3

CATEGORIES = ["direct", "paraphrase", "out_of_scope"]
LABELS = {"direct": "Direct", "paraphrase": "Paraphrased", "out_of_scope": "Out of scope"}
COLORS = {"direct": "#0072B2", "paraphrase": "#009E73", "out_of_scope": "#D55E00"}
MARKERS = {"direct": "o", "paraphrase": "s", "out_of_scope": "^"}

# Same query the live service uses (rag-service/main.py), minus nothing:
# only chunks from the ACTIVE document are searched.
SEARCH_SQL = """
    SELECT c.section_title, 1 - (c.embedding <=> %s) AS similarity
    FROM handbook_chunk c
    JOIN handbook_document d ON d.id = c.document_id
    WHERE d.status = 'active'
    ORDER BY c.embedding <=> %s
    LIMIT %s
"""


# --------------------------------------------------------------------------
# Part 1: run retrieval (needs the database and the embedding model)
# --------------------------------------------------------------------------
def run_retrieval(questions: list[dict]) -> list[dict]:
    sys.path.insert(0, str(HERE.parent / "rag-service"))
    import config  # noqa: E402  (loads rag-service/.env)
    from db import pool  # noqa: E402
    from sentence_transformers import SentenceTransformer  # noqa: E402

    print("Loading embedding model...")
    embedder = SentenceTransformer(config.EMBEDDING_MODEL)
    pool.open()

    records = []
    with pool.connection() as conn:
        for q in questions:
            emb = embedder.encode(q["question"])
            rows = conn.execute(SEARCH_SQL, (emb, emb, EVAL_K)).fetchall()
            records.append(
                {
                    **q,
                    "top_titles": [r[0] for r in rows],
                    "top_sims": [round(float(r[1]), 4) for r in rows],
                }
            )
    pool.close()
    return records, config.MIN_SIMILARITY


# --------------------------------------------------------------------------
# Part 2: scoring and reporting (pure Python, no database)
# --------------------------------------------------------------------------
def section_no(title: str) -> str:
    """'1.2 Sick Leave' -> '1.2'"""
    return title.split()[0]


def add_scores(records: list[dict]) -> None:
    for r in records:
        expected = set(r["expected_sections"])
        got = [section_no(t) for t in r["top_titles"]]
        if expected:
            r["hit1"] = got[0] in expected
            r["hit3"] = bool(expected & set(got))
            r["recall3"] = len(expected & set(got)) / len(expected)
        else:
            r["hit1"] = r["hit3"] = r["recall3"] = None


def mean(values):
    values = list(values)
    return sum(values) / len(values) if values else float("nan")


def print_summary(records: list[dict], cutoff: float) -> None:
    print(f"\n{'Category':<14}{'n':>4}{'hit@1':>9}{'hit@3':>9}{'recall@3':>11}{'median top-1 sim':>19}")
    for cat in CATEGORIES:
        rs = [r for r in records if r["category"] == cat]
        med = float(np.median([r["top_sims"][0] for r in rs]))
        if cat == "out_of_scope":
            print(f"{LABELS[cat]:<14}{len(rs):>4}{'-':>9}{'-':>9}{'-':>11}{med:>19.3f}")
        else:
            print(
                f"{LABELS[cat]:<14}{len(rs):>4}"
                f"{mean(r['hit1'] for r in rs):>9.0%}"
                f"{mean(r['hit3'] for r in rs):>9.0%}"
                f"{mean(r['recall3'] for r in rs):>11.0%}"
                f"{med:>19.3f}"
            )

    answerable = [r for r in records if r["category"] != "out_of_scope"]
    oos = [r for r in records if r["category"] == "out_of_scope"]
    false_refusals = [r for r in answerable if r["top_sims"][0] < cutoff]
    false_answers = [r for r in oos if r["top_sims"][0] >= cutoff]

    print(f"\nAt the current cutoff ({cutoff}):")
    print(f"  answerable questions wrongly refused : {len(false_refusals)} of {len(answerable)}")
    print(f"  out-of-scope questions sent to the LLM: {len(false_answers)} of {len(oos)}")
    for r in false_refusals:
        print(f"    refused  (sim {r['top_sims'][0]:.3f}): {r['question']}")
    for r in false_answers:
        print(f"    answered (sim {r['top_sims'][0]:.3f}): {r['question']}")

    misses = [r for r in answerable if not r["hit3"]]
    if misses:
        print("\nRetrieval misses (right section not in the top 3):")
        for r in misses:
            print(f"  {r['question']}  expected {r['expected_sections']}  got {[section_no(t) for t in r['top_titles']]}")
    if false_answers:
        print(
            "\nNote: out-of-scope questions above the cutoff still reach the model. "
            "The prompt must make it refuse; that is measured in the answer evaluation."
        )


def make_figure(records: list[dict], cutoff: float, path: Path) -> None:
    answerable = [r for r in records if r["category"] != "out_of_scope"]
    oos = [r for r in records if r["category"] == "out_of_scope"]
    a_sims = np.array([r["top_sims"][0] for r in answerable])
    o_sims = np.array([r["top_sims"][0] for r in oos])

    fig, axes = plt.subplots(1, 3, figsize=(17, 5.2))
    fig.suptitle("Retrieval evaluation: Nimbus handbook assistant", fontsize=14, fontweight="bold")

    # (a) top-1 similarity by category
    ax = axes[0]
    rng = np.random.default_rng(0)
    for i, cat in enumerate(CATEGORIES):
        sims = [r["top_sims"][0] for r in records if r["category"] == cat]
        x = i + rng.uniform(-0.18, 0.18, len(sims))
        ax.scatter(x, sims, c=COLORS[cat], marker=MARKERS[cat], s=48, alpha=0.85, edgecolor="white", linewidth=0.6)
    ax.axhline(cutoff, color="#444444", linestyle="--", linewidth=1.2)
    ax.text(-0.45, cutoff + 0.008, f"cutoff {cutoff}", ha="left", va="bottom", fontsize=9, color="#444444")
    ax.set_xticks(range(len(CATEGORIES)))
    ax.set_xticklabels([LABELS[c] for c in CATEGORIES])
    ax.set_xlim(-0.5, 2.5)
    ax.set_ylabel("Top-1 cosine similarity")
    ax.set_title("Does the score separate answerable from out-of-scope?", fontsize=10)

    # (b) cutoff sweep
    ax = axes[1]
    thresholds = np.arange(0.10, 0.80, 0.01)
    false_refusal = [(a_sims < t).mean() for t in thresholds]
    false_answer = [(o_sims >= t).mean() for t in thresholds]
    ax.plot(thresholds, false_refusal, color=COLORS["direct"], linewidth=2, label="Answerable wrongly refused")
    ax.plot(thresholds, false_answer, color=COLORS["out_of_scope"], linewidth=2, linestyle="--", label="Out-of-scope sent to LLM")
    ax.axvline(cutoff, color="#444444", linestyle=":", linewidth=1.2)
    ax.set_xlabel("Similarity cutoff")
    ax.set_ylabel("Share of questions")
    ax.set_ylim(-0.02, 1.02)
    ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0))
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.16), fontsize=9, frameon=False)
    ax.set_title("What each cutoff would do", fontsize=10)

    # (c) hit rates
    ax = axes[2]
    cats = ["direct", "paraphrase"]
    width = 0.34
    for j, (key, name, color) in enumerate([("hit1", "hit@1", "#0072B2"), ("hit3", "hit@3", "#56B4E9")]):
        vals = [mean(r[key] for r in records if r["category"] == c) for c in cats]
        pos = np.arange(len(cats)) + (j - 0.5) * (width + 0.04)
        bars = ax.bar(pos, vals, width, label=name, color=color)
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, v + 0.02, f"{v:.0%}", ha="center", fontsize=9)
    ax.set_xticks(range(len(cats)))
    ax.set_xticklabels([LABELS[c] for c in cats])
    ax.set_ylim(0, 1.25)
    ax.set_yticks([0, 0.2, 0.4, 0.6, 0.8, 1.0])
    ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0))
    ax.legend(frameon=False, loc="upper center", ncol=2, fontsize=9)
    ax.set_title("Is the right section retrieved?", fontsize=10)

    for ax in axes:
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

    fig.tight_layout(rect=(0, 0, 1, 0.94))
    fig.savefig(path, dpi=160)
    plt.close(fig)


def analyze(records: list[dict], cutoff: float) -> None:
    RESULTS.mkdir(exist_ok=True)
    add_scores(records)
    print_summary(records, cutoff)
    make_figure(records, cutoff, RESULTS / "retrieval_report.png")
    (RESULTS / "retrieval_results.json").write_text(json.dumps(records, indent=2, ensure_ascii=False))
    print(f"\nSaved {RESULTS / 'retrieval_report.png'} and retrieval_results.json")


def main() -> None:
    questions = json.loads((HERE / "eval_set.json").read_text())
    records, cutoff = run_retrieval(questions)
    analyze(records, cutoff)


if __name__ == "__main__":
    main()
