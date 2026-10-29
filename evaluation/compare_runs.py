"""
Before/after chart for the README: how the three evaluation runs compare.

Reads pipeline_results.json from each run folder (no network, no Groq tokens).

Run (from the evaluation folder):
    python compare_runs.py
    python compare_runs.py results_baseline results_run2 results      # same thing, explicit

Output: results/runs_comparison.png and a printed table.
"""

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

HERE = Path(__file__).resolve().parent
DEFAULT_FOLDERS = ["results_baseline", "results_run2", "results"]
NAMES = ["Run 1\nbaseline", "Run 2\ncutoff + prompt\n+ chunk fix", "Run 3\n+ top 5 sections"]

ANSWERABLE_OUTCOMES = [
    ("correct", "Correct", "#0072B2"),
    ("partial", "Partly correct", "#56B4E9"),
    ("incorrect", "Incorrect", "#D55E00"),
    ("wrongly_refused", "Wrongly refused", "#E69F00"),
]
DECLINED = {"declined_cutoff", "declined_model"}
CAT_COLORS = {"direct": "#0072B2", "paraphrase": "#009E73"}
CAT_LABELS = {"direct": "Direct", "paraphrase": "Paraphrased"}


def mean(values):
    values = [v for v in values if v is not None]
    return sum(values) / len(values) if values else float("nan")


def load(folder: str) -> list[dict]:
    path = HERE / folder / "pipeline_results.json"
    if not path.exists():
        sys.exit(f"{path} not found.")
    return json.loads(path.read_text())


def summarise(rows: list[dict]) -> dict:
    answerable = [r for r in rows if r["category"] != "out_of_scope"]
    out = {
        "n_answerable": len(answerable),
        "outcomes": {k: sum(r["outcome"] == k for r in answerable) for k, _, _ in ANSWERABLE_OUTCOMES},
        "oos_declined": sum(r["outcome"] in DECLINED for r in rows if r["category"] == "out_of_scope"),
        "oos_total": sum(r["category"] == "out_of_scope" for r in rows),
    }
    for metric in ("faithfulness", "answer_relevancy"):
        out[metric] = {
            c: mean([r.get(metric) for r in rows if r["category"] == c]) for c in ("direct", "paraphrase")
        }
    return out


def grouped_bars(ax, summaries, metric, title):
    width = 0.34
    x = np.arange(len(summaries))
    for j, cat in enumerate(("direct", "paraphrase")):
        vals = [s[metric][cat] for s in summaries]
        pos = x + (j - 0.5) * (width + 0.04)
        bars = ax.bar(pos, vals, width, label=CAT_LABELS[cat], color=CAT_COLORS[cat])
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, v + 0.015, f"{v:.2f}", ha="center", fontsize=9)
    ax.set_xticks(x)
    ax.set_xticklabels(NAMES[: len(summaries)], fontsize=8)
    ax.set_ylim(0, 1.3)
    ax.set_yticks([0, 0.2, 0.4, 0.6, 0.8, 1.0])
    ax.set_title(title, fontsize=10)
    ax.legend(frameon=False, fontsize=9, loc="upper center", ncol=2)


def main() -> None:
    folders = sys.argv[1:] or DEFAULT_FOLDERS
    summaries = [summarise(load(f)) for f in folders]

    print(f"{'':<22}" + "".join(f"{f:>18}" for f in folders))
    for key, label, _ in ANSWERABLE_OUTCOMES:
        print(f"{label:<22}" + "".join(f"{s['outcomes'][key]:>18}" for s in summaries))
    print(f"{'Out of scope declined':<22}" + "".join(f"{s['oos_declined']}/{s['oos_total']}".rjust(18) for s in summaries))
    for metric in ("faithfulness", "answer_relevancy"):
        for cat in ("direct", "paraphrase"):
            print(f"{metric + ' ' + cat:<22}" + "".join(f"{s[metric][cat]:>18.3f}" for s in summaries))

    fig, axes = plt.subplots(1, 3, figsize=(16, 5.6), gridspec_kw={"width_ratios": [1.1, 1, 1]})
    fig.suptitle("Nimbus HR Assistant: three evaluation runs on the same 32 questions", fontsize=13, fontweight="bold")

    ax = axes[0]
    x = np.arange(len(summaries))
    bottom = np.zeros(len(summaries))
    for key, label, color in ANSWERABLE_OUTCOMES:
        vals = np.array([s["outcomes"][key] for s in summaries], dtype=float)
        ax.bar(x, vals, 0.6, bottom=bottom, label=label, color=color, edgecolor="white", linewidth=1.2)
        for xi, v, b in zip(x, vals, bottom):
            if v:
                ax.text(xi + (0.36 if v < 2 else 0), b + v / 2, int(v), ha="left" if v < 2 else "center", va="center", color="#333333" if v < 2 else "white", fontweight="bold")
        bottom += vals
    ax.set_xticks(x)
    ax.set_xticklabels(NAMES[: len(summaries)], fontsize=8)
    ax.set_ylabel(f"Answerable questions (n={summaries[0]['n_answerable']})")
    ax.set_title("Answer quality (LLM judge)", fontsize=10)
    ax.legend(frameon=False, fontsize=8, loc="lower center", bbox_to_anchor=(0.5, -0.30), ncol=4, columnspacing=1.0, handlelength=1.2)

    grouped_bars(axes[1], summaries, "faithfulness", "Faithfulness (RAGAS)\nanswer is supported by the retrieved text")
    grouped_bars(axes[2], summaries, "answer_relevancy", "Answer relevancy (RAGAS)")

    declined = "  |  ".join(f"run {i + 1}: {s['oos_declined']}/{s['oos_total']}" for i, s in enumerate(summaries))
    fig.text(0.5, 0.01, f"Out-of-scope questions correctly declined: {declined}", ha="center", fontsize=9)

    for ax in axes:
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
    fig.tight_layout(rect=(0, 0.05, 1, 0.94))
    out = HERE / "results" / "runs_comparison.png"
    out.parent.mkdir(exist_ok=True)
    fig.savefig(out, dpi=160)
    print(f"\nSaved {out}")


if __name__ == "__main__":
    main()
