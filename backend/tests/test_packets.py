"""Checks on the committed eval packets in evals/packets/.

Each packet runs through the Stage 2 pipeline (upload check, extract, redact),
so this is also a small integration test of those three slices.
"""

import importlib.util
import json
from pathlib import Path

import pytest

from app.config import PROJECT_ROOT, Settings
from app.ingest.extract import extract_pages
from app.ingest.redact import redact, redact_pages
from app.ingest.upload import check_pdf
from app.templates import load_templates

EVALS_DIR = PROJECT_ROOT / "evals"
PACKETS_DIR = EVALS_DIR / "packets"
PACKETS = sorted(p for p in PACKETS_DIR.iterdir() if p.is_dir())
STATUSES = {"found", "partial", "missing", "unclear", "expired"}


def test_there_are_packets() -> None:
    assert len(PACKETS) >= 3


@pytest.mark.parametrize("packet", PACKETS, ids=lambda p: p.name)
def test_expected_json_matches_its_template(packet: Path) -> None:
    meta = json.loads((packet / "expected.json").read_text(encoding="utf-8"))
    template = load_templates(PROJECT_ROOT / "templates")[meta["template"]]
    codes = {r.code for r in template.requirements}
    assert set(meta["expected"]) == codes  # every requirement, nothing extra
    assert set(meta["expected"].values()) <= STATUSES


@pytest.mark.parametrize("packet", PACKETS, ids=lambda p: p.name)
def test_packet_passes_upload_extract_and_redact(packet: Path) -> None:
    meta = json.loads((packet / "expected.json").read_text(encoding="utf-8"))
    pdfs = sorted(packet.glob("*.pdf"))
    assert pdfs

    total_redactions = 0
    for pdf in pdfs:
        data = pdf.read_bytes()
        checked = check_pdf(data, Settings())
        pages = extract_pages(data)
        assert len(pages) == checked.page_count
        assert all("SYNTETISKT TESTDOKUMENT" in page for page in pages)

        redacted, count = redact_pages(pages)
        total_redactions += count
        assert all(redact(page).count == 0 for page in redacted)  # nothing left over

    assert total_redactions == meta["expectedRedactions"]


def test_committed_packets_match_the_generator(tmp_path: Path) -> None:
    # If this fails, someone edited the generator without re-running it
    # (or edited a packet by hand). Run: backend/.venv/bin/python evals/make_packets.py
    spec = importlib.util.spec_from_file_location("make_packets", EVALS_DIR / "make_packets.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.build(tmp_path)

    committed = sorted(p.relative_to(PACKETS_DIR) for p in PACKETS_DIR.rglob("*") if p.is_file())
    generated = sorted(p.relative_to(tmp_path) for p in tmp_path.rglob("*") if p.is_file())
    assert committed == generated
    for rel in committed:
        assert (PACKETS_DIR / rel).read_bytes() == (tmp_path / rel).read_bytes(), rel
