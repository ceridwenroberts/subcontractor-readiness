"""Run the eval packets through the real pipeline and score the result.

From the project root:
    backend/.venv/bin/python evals/run.py                      # provider from .env, verifier on and off
    backend/.venv/bin/python evals/run.py --runs 3 --verifier on
    LLM_PROVIDER=ollama OLLAMA_MODEL=qwen2.5:7b backend/.venv/bin/python evals/run.py

Prints three numbers per setting (PLAN.md section 13): overall accuracy, false `found`
rate (target: zero), and the `unclear` rate with how many were correct. Each run is
saved to evals/results/. Only Anthropic runs support quality claims. Scripted runs show
the plumbing works, and Ollama runs show rough numbers from a small local model.
"""

import argparse
import json
import sys
import time
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.assess import PROMPT_VERSION, DocumentText, assess_requirement
from app.config import Settings, get_settings
from app.ingest.extract import extract_pages
from app.ingest.redact import redact_pages
from app.providers import get_provider
from app.providers.base import LLMProvider
from app.templates import Template, load_templates
from app.verify import VERIFIER_PROMPT_VERSION

PACKETS_DIR = ROOT / "evals" / "packets"
RESULTS_DIR = ROOT / "evals" / "results"


@dataclass
class Row:
    packet: str
    code: str
    expected: str
    model_status: str
    ai_status: str
    verifier: str


def score(rows: list[Row]) -> dict[str, Any]:
    """The numbers. Pure function: no model, no files."""
    total = len(rows)
    not_found = [r for r in rows if r.expected != "found"]
    unclear = [r for r in rows if r.ai_status == "unclear"]
    false_found = [r for r in not_found if r.ai_status == "found"]
    model_false_found = [r for r in not_found if r.model_status == "found"]
    correct = sum(r.ai_status == r.expected for r in rows)
    return {
        "total": total,
        "accuracy": correct / total if total else 0.0,
        "model_accuracy": sum(r.model_status == r.expected for r in rows) / total if total else 0.0,
        "false_found": len(false_found),
        "false_found_rate": len(false_found) / len(not_found) if not_found else 0.0,
        "model_false_found": len(model_false_found),  # before the code checks and verifier
        "unclear": len(unclear),
        "unclear_rate": len(unclear) / total if total else 0.0,
        "unclear_correct": sum(r.expected == "unclear" for r in unclear),
        "missed_found": sum(r.expected == "found" and r.ai_status != "found" for r in rows),
    }


def load_packets(names: list[str] | None = None) -> list[tuple[str, dict[str, str], list[DocumentText]]]:
    packets = []
    for folder in sorted(p for p in PACKETS_DIR.iterdir() if p.is_dir()):
        if names and folder.name not in names:
            continue
        meta = json.loads((folder / "expected.json").read_text(encoding="utf-8"))
        docs = [
            DocumentText(id=f"doc{i}", pages=redact_pages(extract_pages(pdf.read_bytes())).pages)
            for i, pdf in enumerate(sorted(folder.glob("*.pdf")), start=1)
        ]
        packets.append((folder.name, meta["expected"], docs))
    return packets


def run_once(
    provider: LLMProvider,
    template: Template,
    packets: list[tuple[str, dict[str, str], list[DocumentText]]],
    use_verifier: bool,
) -> list[Row]:
    rows: list[Row] = []
    for name, expected, docs in packets:
        for req in template.requirements:
            r = assess_requirement(provider, req, docs, today=date.today(), use_verifier=use_verifier)
            rows.append(
                Row(name, req.code, expected[req.code], r.model_status, r.ai_status, r.verifier)
            )
    return rows


def result_path(provider: LLMProvider, use_verifier: bool, day: date) -> Path:
    model = provider.model.replace(":", "-").replace("/", "-")
    prompts = PROMPT_VERSION + (f"+{VERIFIER_PROMPT_VERSION}" if use_verifier else "-noverifier")
    return RESULTS_DIR / f"{day.isoformat()}_{provider.name}_{model}_{prompts}.json"


def pct(x: float) -> str:
    return f"{x * 100:.0f}%"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--runs", type=int, default=1, help="repeat each setting N times")
    parser.add_argument("--verifier", choices=["on", "off", "both"], default="both")
    parser.add_argument("--packets", nargs="*", help="packet folder names (default: all)")
    args = parser.parse_args()

    settings: Settings = get_settings()
    provider = get_provider(settings)
    template = load_templates(settings.templates_dir)["vvs"]
    packets = load_packets(args.packets)
    settings_to_run = {"on": [True], "off": [False], "both": [False, True]}[args.verifier]

    print(f"Provider: {provider.label} ({provider.name}, model {provider.model})")
    if provider.name != "anthropic":
        print("Not representative of production quality: no hosted-model eval has been run.")
    print(f"Packets: {', '.join(n for n, _, _ in packets)}   Runs per setting: {args.runs}\n")

    RESULTS_DIR.mkdir(exist_ok=True)
    for use_verifier in settings_to_run:
        runs = []
        for _ in range(args.runs):
            start = time.time()
            rows = run_once(provider, template, packets, use_verifier)
            runs.append({"seconds": round(time.time() - start, 1), "score": score(rows), "rows": [asdict(r) for r in rows]})

        accs = [r["score"]["accuracy"] for r in runs]
        label = "with verifier" if use_verifier else "without verifier"
        last = runs[-1]["score"]
        print(f"== {label} ==")
        print(f"  accuracy        {pct(min(accs))}-{pct(max(accs))} over {args.runs} run(s)  (last run: {pct(last['accuracy'])}; model alone: {pct(last['model_accuracy'])})")
        ff = [r["score"]["false_found"] for r in runs]
        print(f"  false found     {min(ff)}-{max(ff)} per run  (last run rate {pct(last['false_found_rate'])}; model alone {last['model_false_found']})")
        print(f"  unclear         {pct(last['unclear_rate'])} of requirements, {last['unclear_correct']} of {last['unclear']} correct; missed evidence: {last['missed_found']}")
        print(f"  time per run    {', '.join(str(r['seconds']) + 's' for r in runs)}\n")

        out = {
            "date": date.today().isoformat(),
            "provider": provider.name,
            "provider_label": provider.label,
            "model": provider.model,
            "prompt_version": PROMPT_VERSION,
            "verifier_prompt_version": VERIFIER_PROMPT_VERSION if use_verifier else None,
            "verifier": use_verifier,
            "packets": [n for n, _, _ in packets],
            "note": "Not representative of production quality." if provider.name != "anthropic" else "",
            "runs": runs,
        }
        path = result_path(provider, use_verifier, date.today())
        path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"  saved {path.relative_to(ROOT)}\n")


if __name__ == "__main__":
    main()
