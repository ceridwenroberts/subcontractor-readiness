"""The scripted provider plus the real pipeline reproduces each packet's expected.json.

This proves the plumbing (extract, redact, prompt, validate, code checks), not model quality.
"""

import json
from datetime import date
from pathlib import Path

import pytest

from app.assess import DocumentText, assess_requirement
from app.config import PROJECT_ROOT, Settings
from app.ingest.extract import extract_pages
from app.ingest.redact import redact_pages
from app.providers import get_provider
from app.templates import load_templates

PACKETS = sorted(p for p in (PROJECT_ROOT / "evals" / "packets").iterdir() if p.is_dir())
TEMPLATES = load_templates(PROJECT_ROOT / "templates")


@pytest.mark.parametrize("packet", PACKETS, ids=lambda p: p.name)
def test_scripted_provider_matches_expected_statuses(packet: Path) -> None:
    expected = json.loads((packet / "expected.json").read_text(encoding="utf-8"))
    docs = [
        DocumentText(id=f"doc{i}", pages=redact_pages(extract_pages(pdf.read_bytes())).pages)
        for i, pdf in enumerate(sorted(packet.glob("*.pdf")), start=1)
    ]
    provider = get_provider(Settings(_env_file=None))
    template = TEMPLATES[expected["template"]]
    actual = {
        req.code: assess_requirement(provider, req, docs, today=date(2026, 11, 16)).ai_status
        for req in template.requirements
    }
    assert actual == expected["expected"]
