"""
A free, instant check of the assistant's answers. No LLM judge, no Groq tokens.

For every question in answers.json it checks:
  * answerable questions: does the answer contain the key facts listed in key_facts.json
    (for example "12" for sick leave, "60" for the notice period), and was it NOT refused?
  * out-of-scope questions: did the assistant decline (by the cutoff or by saying it
    does not have the information)?

It is a coarse check by design. It cannot judge wording or completeness, and it can be
fooled by an answer that mentions the right number in the wrong way. That is why the
slower LLM judge and RAGAS (score_answers.py) are still worth running for final numbers.
What this gives you is a fast, repeatable regression test you can run after every change.

Run (from the evaluation folder, evaluation environment active):
    python quick_check.py                                   # check results/answers.json
    python quick_check.py results_run2/answers.json results/answers.json
                                                            # compare an older run with a newer one

Output: a printed report and results/quick_check.png
"""

import json
import re
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"
KEY_FACTS = HERE / "key_facts.json"

CATEGORIES = ["direct", "paraphrase", "out_of_scope"]
LABELS = {"direct": "Direct", "paraphrase": "Paraphrased", "out_of_scope": "Out of scope"}

# An answer counts as a refusal if one of these appears near its start.
DECLINE_PHRASES = [
    "don't have that information",
    "do not have that information",
    "don't have any information",
    "don't have information",
    "no information",
    "don't contain",
    "do not contain",
    "doesn't contain",
    "does not contain",
    "not mentioned",
    "isn't mentioned",
    "not covered",
    "doesn't mention",
    "does not mention",
    "couldn't find",
    "cannot find",
    "can't find",
    "no handbook",
]
DECLINE_WINDOW = 160  # only look at the start, so "the handbook doesn't specify which days" in the middle of a real answer is not a refusal


def normalise(text: str) -> str:
    t = text.lower()
    for ch in "‘’ʼ":
        t = t.replace(ch, "'")
    for ch in "‐‑‒–—−":
        t = t.replace(ch, "-")
    t = t.replace("₹", "")  # rupee sign
    t = re.sub(r"\brs\.?\s*(?=\d)", "", t)
    t = re.sub(r"(?<=\d),(?=\d)", "", t)  # 6,000 -> 6000 (also 5,00,000 -> 500000)
    t = re.sub(r"[*`_]", "", t)
    return re.sub(r"\s+", " ", t).strip()


def is_decline(rec: dict) -> bool:
    if rec.get("cutoff_refused"):
        return True
    start = normalise(rec["answer"])[:DECLINE_WINDOW]
    return any(p in start for p in DECLINE_PHRASES)


def check(rec: dict, facts: dict) -> dict:
    declined = is_decline(rec)
    if rec["category"] == "out_of_scope":
        return {"passed": declined, "declined": declined, "missing": []}
    required = facts.get(str(rec["id"]), [])
    answer = normalise(rec["answer"])
    missing = [f for f in required if not re.search(f, answer, re.I)]
    return {"passed": (not declined) and not missing, "declined": declined, "missing": missing}


def load(path: Path, facts: dict) -> dict[int, dict]:
    out = {}
    for rec in json.loads(path.read_text()):
        out[rec["id"]] = {**rec, **check(rec, facts)}
    return out


def summarise(name: str, run: dict[int, dict]) -> dict[str, tuple[int, int]]:
    print(f"\n=== {name} ===")
    result = {}
    for cat in CATEGORIES:
        rs = [r for r in run.values() if r["category"] == cat]
        ok = sum(r["passed"] for r in rs)
        result[cat] = (ok, len(rs))
        what = "declined" if cat == "out_of_scope" else "key facts present"
        print(f"  {LABELS[cat]:<13} {ok:>2} of {len(rs):<2} {what}")

    for r in run.values():
        if r["passed"]:
            continue
        if r["category"] == "out_of_scope":
            print(f"  ANSWERED ANYWAY: {r['question']}\n      -> {r['answer'][:200]!r}")
        elif r["declined"]:
            how = "by the cutoff" if r.get("cutoff_refused") else "by the model"
            print(f"  WRONGLY REFUSED ({how}): {r['question']}")
        else:
            print(f"  MISSING FACTS: {r['question']}\n      missing {r['missing']}\n      -> {r['answer'][:240]!r}")
    return result


def compare(a: dict[int, dict], b: dict[int, dict]) -> None:
    print("\n=== What changed between the two runs ===")
    changed = False
    for i in sorted(set(a) & set(b)):
        if a[i]["passed"] != b[i]["passed"]:
            changed = True
            arrow = "now PASSES" if b[i]["passed"] else "now FAILS "
            print(f"  {arrow}  {b[i]['question']}")
    if not changed:
        print("  No question changed between passing and failing.")


def make_figure(runs: list[tuple[str, dict[str, tuple[int, int]]]], path: Path) -> None:
    fig, ax = plt.subplots(figsize=(10, 2.2 + 1.3 * len(CATEGORIES) * len(runs) / 2))
    ypos, labels, y = [], [], 0
    for cat in CATEGORIES:
        for name, summary in runs:
            ok, n = summary[cat]
            ax.barh(y, ok / n, color="#0072B2", edgecolor="white", linewidth=1.5)
            ax.barh(y, (n - ok) / n, left=ok / n, color="#D55E00", edgecolor="white", linewidth=1.5)
            if ok:
                ax.text(ok / n / 2, y, str(ok), ha="center", va="center", color="white", fontweight="bold")
            if n - ok:
                ax.text(ok / n + (n - ok) / n / 2, y, str(n - ok), ha="center", va="center", color="white", fontweight="bold")
            ypos.append(y)
            labels.append(f"{LABELS[cat]}\n{name}" if len(runs) > 1 else f"{LABELS[cat]} (n={n})")
            y += 1
        y += 0.5
    ax.set_yticks(ypos)
    ax.set_yticklabels(labels, fontsize=9)
    ax.invert_yaxis()
    ax.set_xlim(0, 1)
    ax.xaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0))
    ax.set_title("Quick check: key facts present (answerable) or declined (out of scope)", fontsize=11, fontweight="bold")
    ax.legend(
        [plt.Rectangle((0, 0), 1, 1, color="#0072B2"), plt.Rectangle((0, 0), 1, 1, color="#D55E00")],
        ["Pass", "Fail"], loc="upper center", bbox_to_anchor=(0.5, -0.12), ncol=2, frameon=False,
    )
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)


def main() -> None:
    paths = [Path(p) for p in sys.argv[1:]] or [RESULTS / "answers.json"]
    if len(paths) > 2:
        sys.exit("Give one answers.json to check, or two to compare.")
    facts = json.loads(KEY_FACTS.read_text())
    runs, summaries = [], []
    for p in paths:
        if not p.exists():
            sys.exit(f"{p} not found.")
        run = load(p, facts)
        name = p.parent.name or p.name
        runs.append(run)
        summaries.append((name, summarise(name, run)))
    if len(runs) == 2:
        compare(runs[0], runs[1])
    RESULTS.mkdir(exist_ok=True)
    make_figure(summaries, RESULTS / "quick_check.png")
    print(f"\nSaved {RESULTS / 'quick_check.png'}")


if __name__ == "__main__":
    main()
