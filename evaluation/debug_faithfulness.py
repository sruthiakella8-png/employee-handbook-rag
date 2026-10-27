"""
Show exactly why RAGAS gave an answer its faithfulness score.

RAGAS faithfulness works in two steps:
  1. it breaks the answer into small factual statements
  2. it asks the judge, for each statement, "is this supported by the retrieved sections?"
This prints both steps, including the judge's reason for every verdict, so you can
tell a genuinely unsupported claim from a judge mistake.

Run (evaluation environment active):
    python debug_faithfulness.py 15        # 15 = the question id from eval_set.json
"""

import asyncio
import json
import sys
from pathlib import Path

import score_answers as sa

HERE = Path(__file__).resolve().parent


async def main(question_id: int) -> None:
    answers = {a["id"]: a for a in json.loads(sa.ANSWERS.read_text())}
    if question_id not in answers:
        sys.exit(f"No question with id {question_id}.")
    rec = answers[question_id]

    _, faithfulness, _ = sa.build_judges()

    print(f"QUESTION: {rec['question']}")
    print(f"ANSWER:   {rec['answer']}\n")

    statements = await faithfulness._create_statements(rec["question"], rec["answer"])
    print("STATEMENTS extracted from the answer:")
    for s in statements:
        print(f"  - {s}")

    verdicts = await faithfulness._create_verdicts(statements, "\n".join(rec["contexts"]))
    print("\nJUDGE'S VERDICTS (1 = supported by the sections, 0 = not supported):")
    for v in verdicts.statements:
        print(f"  [{v.verdict}] {v.statement}\n       reason: {v.reason}")

    print("\nSECTIONS the judge was shown:")
    for text in rec["contexts"]:
        print("  " + text.replace("\n", "\n  ") + "\n")


if __name__ == "__main__":
    if len(sys.argv) != 2 or not sys.argv[1].isdigit():
        sys.exit("Usage: python debug_faithfulness.py <question id>")
    asyncio.run(main(int(sys.argv[1])))
