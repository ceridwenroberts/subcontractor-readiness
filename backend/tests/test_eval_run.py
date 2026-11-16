import importlib.util
from datetime import date

import pytest

from app.config import PROJECT_ROOT, Settings
from app.providers import get_provider
from app.templates import load_templates

spec = importlib.util.spec_from_file_location("eval_run", PROJECT_ROOT / "evals" / "run.py")
assert spec and spec.loader
eval_run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(eval_run)
Row = eval_run.Row


def row(expected: str, ai: str, model: str | None = None) -> "Row":
    return Row("p", "VVS-01", expected, model or ai, ai, "not_run")


def test_perfect_run() -> None:
    s = eval_run.score([row("found", "found"), row("missing", "missing")])
    assert (s["accuracy"], s["false_found"], s["unclear"], s["missed_found"]) == (1.0, 0, 0, 0)


def test_false_found_counts_only_found_where_something_else_was_expected() -> None:
    rows = [row("missing", "found"), row("expired", "found"), row("missing", "missing"), row("found", "found")]
    s = eval_run.score(rows)
    assert s["false_found"] == 2
    assert s["false_found_rate"] == pytest.approx(2 / 3)  # 3 rows where found was wrong


def test_model_alone_is_scored_separately_from_the_final_status() -> None:
    # The model said found; code checks made it unclear.
    s = eval_run.score([row("missing", ai="unclear", model="found")])
    assert s["model_false_found"] == 1
    assert s["false_found"] == 0
    assert s["unclear"] == 1 and s["unclear_correct"] == 0


def test_unclear_correct_and_missed_evidence() -> None:
    s = eval_run.score([row("unclear", "unclear"), row("found", "unclear")])
    assert (s["unclear"], s["unclear_correct"], s["missed_found"]) == (2, 1, 1)


def test_empty_input_does_not_divide_by_zero() -> None:
    assert eval_run.score([])["accuracy"] == 0.0


def test_scripted_provider_reproduces_every_packet() -> None:
    provider = get_provider(Settings(_env_file=None))
    template = load_templates(PROJECT_ROOT / "templates")["vvs"]
    rows = eval_run.run_once(provider, template, eval_run.load_packets(), use_verifier=True)
    s = eval_run.score(rows)
    assert (s["accuracy"], s["false_found"]) == (1.0, 0)
    assert len({r.packet for r in rows}) >= 4  # includes the injection packet


def test_result_file_name_says_provider_model_and_prompts() -> None:
    provider = get_provider(Settings(_env_file=None, llm_provider="ollama", ollama_model="qwen2.5:7b"))
    day = date(2026, 11, 16)
    on = eval_run.result_path(provider, True, day).name
    off = eval_run.result_path(provider, False, day).name
    assert on == "2026-11-16_ollama_qwen2.5-7b_assess-v2+verify-v1.json"
    assert off == "2026-11-16_ollama_qwen2.5-7b_assess-v2-noverifier.json"
