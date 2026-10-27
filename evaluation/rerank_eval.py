"""
Would a reranker find the right handbook section more often than plain vector search?

How a reranker works: vector search is fast but rough. It compares the question and each
section as two separate summaries ("embeddings"). A reranker is a second, slower model that
reads the question TOGETHER with each candidate section and scores how well they match.
So we let vector search pull the 10 best candidates, then let the reranker pick the best 3.

This is an offline experiment. It does not touch the app: it only runs retrieval, so it is
free (no Groq tokens) and deterministic. It uses the 32 questions in eval_set.json plus
12 extra paraphrased questions in eval_set_extra.json (if that file is present), because 7
paraphrased questions is too few to tell a real improvement from luck.

It reports:
  * hit@1 / hit@3 for plain vector search and for vector search + reranker
  * recall@10: how often the right section is even among the 10 candidates (the ceiling
    for any reranker)
  * AUC: how well the top score separates answerable questions from out-of-scope ones
    (1.0 = perfectly, 0.5 = no better than a coin flip)

Run (evaluation environment active):
    python rerank_eval.py

Output: results/rerank_report.png and results/rerank_results.json
"""

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"

CANDIDATES = 10  # how many results vector search hands to the reranker
FINAL_K = 3  # how many sections the assistant actually uses
RERANK_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"  # small, free, runs locally

CATEGORIES = ["direct", "paraphrase", "out_of_scope"]
LABELS = {"direct": "Direct", "paraphrase": "Paraphrased", "out_of_scope": "Out of scope"}
COLORS = {"direct": "#0072B2", "paraphrase": "#009E73", "out_of_scope": "#D55E00"}
MARKERS = {"direct": "o", "paraphrase": "s", "out_of_scope": "^"}

SEARCH_SQL = """
    SELECT c.section_title, c.text, 1 - (c.embedding <=> %s) AS similarity
    FROM handbook_chunk c
    JOIN handbook_document d ON d.id = c.document_id
    WHERE d.status = 'active'
    ORDER BY c.embedding <=> %s
    LIMIT %s
"""


# --------------------------------------------------------------------------
# Part 1: collect candidates and rerank them (needs the database and models)
# --------------------------------------------------------------------------
def load_questions() -> list[dict]:
    questions = json.loads((HERE / "eval_set.json").read_text())
    extra = HERE / "eval_set_extra.json"
    if extra.exists():
        questions += json.loads(extra.read_text())
    return questions


def collect(questions: list[dict]) -> list[dict]:
    sys.path.insert(0, str(HERE.parent / "rag-service"))
    import config  # noqa: E402
    from db import pool  # noqa: E402
    from sentence_transformers import CrossEncoder, SentenceTransformer  # noqa: E402

    print("Loading models...")
    embedder = SentenceTransformer(config.EMBEDDING_MODEL)
    reranker = CrossEncoder(RERANK_MODEL)
    pool.open()

    records = []
    with pool.connection() as conn:
        for q in questions:
            emb = embedder.encode(q["question"])
            rows = conn.execute(SEARCH_SQL, (emb, emb, CANDIDATES)).fetchall()
            titles = [r[0] for r in rows]
            vec_scores = [float(r[2]) for r in rows]
            rr_scores = [float(s) for s in reranker.predict([(q["question"], r[1]) for r in rows])]
            records.append(
                {**q, "titles": titles, "vector_scores": vec_scores, "rerank_scores": rr_scores}
            )
    pool.close()
    return records


# --------------------------------------------------------------------------
# Part 2: scoring and reporting (pure Python, no database or models)
# --------------------------------------------------------------------------
def section_no(title: str) -> str:
    return title.split()[0]


def ranked(titles: list[str], scores: list[float]) -> list[str]:
    """section numbers ordered best-first by the given scores"""
    order = sorted(range(len(titles)), key=lambda i: -scores[i])
    return [section_no(titles[i]) for i in order]


def auc(positives: list[float], negatives: list[float]) -> float:
    """chance that a random answerable question outscores a random out-of-scope one"""
    wins = sum((p > n) + 0.5 * (p == n) for p in positives for n in negatives)
    return wins / (len(positives) * len(negatives))


def add_scores(records: list[dict]) -> None:
    for r in records:
        expected = set(r["expected_sections"])
        vec = ranked(r["titles"], r["vector_scores"])
        rer = ranked(r["titles"], r["rerank_scores"])
        r["vec_top"], r["rer_top"] = vec[:FINAL_K], rer[:FINAL_K]
        r["top_vec_score"] = max(r["vector_scores"])
        r["top_rer_score"] = max(r["rerank_scores"])
        if expected:
            r["vec_hit1"], r["rer_hit1"] = vec[0] in expected, rer[0] in expected
            r["vec_hit3"], r["rer_hit3"] = bool(expected & set(vec[:3])), bool(expected & set(rer[:3]))
            r["in_pool"] = bool(expected & set(vec))
        else:
            for k in ("vec_hit1", "rer_hit1", "vec_hit3", "rer_hit3", "in_pool"):
                r[k] = None


def mean(values):
    values = list(values)
    return sum(values) / len(values) if values else float("nan")


def rate(rs, key):
    return mean(r[key] for r in rs)


def print_summary(records: list[dict]) -> None:
    print(f"\n{'Category':<14}{'n':>4}   {'hit@1':>14}   {'hit@3':>14}   {'recall@10':>9}")
    print(f"{'':<14}{'':>4}   {'vector → rerank':>14}   {'vector → rerank':>14}")
    for cat in ("direct", "paraphrase"):
        rs = [r for r in records if r["category"] == cat]
        print(
            f"{LABELS[cat]:<14}{len(rs):>4}   "
            f"{rate(rs, 'vec_hit1'):>6.0%} → {rate(rs, 'rer_hit1'):<5.0%}   "
            f"{rate(rs, 'vec_hit3'):>6.0%} → {rate(rs, 'rer_hit3'):<5.0%}   "
            f"{rate(rs, 'in_pool'):>9.0%}"
        )

    pos = [r for r in records if r["category"] != "out_of_scope"]
    neg = [r for r in records if r["category"] == "out_of_scope"]
    a_vec = auc([r["top_vec_score"] for r in pos], [r["top_vec_score"] for r in neg])
    a_rer = auc([r["top_rer_score"] for r in pos], [r["top_rer_score"] for r in neg])
    print(f"\nSeparating answerable from out-of-scope (AUC, 1.0 is perfect): vector {a_vec:.2f}, reranker {a_rer:.2f}")

    for label, hit in (("hit@3", "hit3"), ("hit@1", "hit1")):
        better = [r for r in pos if not r[f"vec_{hit}"] and r[f"rer_{hit}"]]
        worse = [r for r in pos if r[f"vec_{hit}"] and not r[f"rer_{hit}"]]
        print(f"\nReranker changed {label}: {len(better)} improved, {len(worse)} got worse")
        for r in better:
            print(f"  + {r['question']}")
        for r in worse:
            print(f"  - {r['question']}   (expected {r['expected_sections']}, reranked top {r['rer_top']})")

    missing = [r for r in pos if not r["in_pool"]]
    if missing:
        print(f"\nNot among the {CANDIDATES} candidates at all (no reranker can fix these):")
        for r in missing:
            print(f"  {r['question']}")
    return a_vec, a_rer


def make_figure(records: list[dict], a_vec: float, a_rer: float, path: Path) -> None:
    fig, axes = plt.subplots(1, 3, figsize=(17, 5.2), gridspec_kw={"width_ratios": [1, 1, 1.15]})
    fig.suptitle("Does a reranker find the right section more often?", fontsize=14, fontweight="bold")
    cats = ["direct", "paraphrase"]
    width = 0.34

    for ax, (key, title) in zip(axes[:2], [("hit1", "Right section ranked first (hit@1)"), ("hit3", "Right section in top 3 (hit@3)")]):
        for j, (prefix, name, color) in enumerate([("vec", "Vector search", "#0072B2"), ("rer", "Vector + reranker", "#E69F00")]):
            vals = [rate([r for r in records if r["category"] == c], f"{prefix}_{key}") for c in cats]
            pos = np.arange(len(cats)) + (j - 0.5) * (width + 0.04)
            bars = ax.bar(pos, vals, width, label=name, color=color)
            for b, v in zip(bars, vals):
                ax.text(b.get_x() + b.get_width() / 2, v + 0.02, f"{v:.0%}", ha="center", fontsize=9)
        n_labels = [f"{LABELS[c]}\n(n={sum(r['category'] == c for r in records)})" for c in cats]
        ax.set_xticks(range(len(cats)))
        ax.set_xticklabels(n_labels)
        ax.set_ylim(0, 1.25)
        ax.set_yticks([0, 0.2, 0.4, 0.6, 0.8, 1.0])
        ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0))
        ax.set_title(title, fontsize=10)
        ax.legend(frameon=False, loc="upper center", ncol=2, fontsize=9)

    ax = axes[2]
    rng = np.random.default_rng(0)
    for i, cat in enumerate(CATEGORIES):
        scores = [r["top_rer_score"] for r in records if r["category"] == cat]
        ax.scatter(i + rng.uniform(-0.18, 0.18, len(scores)), scores, c=COLORS[cat], marker=MARKERS[cat],
                   s=44, alpha=0.85, edgecolor="white", linewidth=0.6)
    ax.set_xticks(range(len(CATEGORIES)))
    ax.set_xticklabels([LABELS[c] for c in CATEGORIES])
    ax.set_xlim(-0.5, 2.5)
    ax.set_ylabel("Reranker top-1 score")
    ax.set_title(f"Separation of answerable from out-of-scope\nAUC: vector {a_vec:.2f}, reranker {a_rer:.2f} (1.0 = perfect)", fontsize=10)

    for ax in axes:
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    fig.savefig(path, dpi=160)
    plt.close(fig)


def analyze(records: list[dict]) -> None:
    RESULTS.mkdir(exist_ok=True)
    add_scores(records)
    a_vec, a_rer = print_summary(records)
    make_figure(records, a_vec, a_rer, RESULTS / "rerank_report.png")
    (RESULTS / "rerank_results.json").write_text(json.dumps(records, indent=2, ensure_ascii=False))
    print(f"\nSaved {RESULTS / 'rerank_report.png'} and rerank_results.json")


def main() -> None:
    analyze(collect(load_questions()))


if __name__ == "__main__":
    main()
