import io
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app.config import PROJECT_ROOT, Settings
from app.main import create_app
from app.providers.base import ProviderError
from app.routes.assess import display_name

PACKET_1 = PROJECT_ROOT / "evals" / "packets" / "01_complete"
PACKET_3 = PROJECT_ROOT / "evals" / "packets" / "03_expired_and_personnummer"


def make_client(tmp_path: Path, **overrides: Any) -> TestClient:
    settings = Settings(_env_file=None, uploads_dir=tmp_path / "uploads", **overrides)
    return TestClient(create_app(settings))


def pdf_file(path: Path) -> tuple[str, tuple[str, bytes, str]]:
    return ("files", (path.name, path.read_bytes(), "application/pdf"))


def blank_pdf() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def post(client: TestClient, files: list, code: str = "VVS-01", template: str = "vvs"):
    return client.post(f"/assess/{template}/{code}", files=files)


def test_assess_found_with_scripted_provider(tmp_path: Path) -> None:
    files = [pdf_file(p) for p in sorted(PACKET_1.glob("*.pdf"))]
    response = post(make_client(tmp_path), files)
    assert response.status_code == 200
    body = response.json()
    assert body["result"]["ai_status"] == "found"
    assert body["result"]["provider_label"] == "Simulated"
    assert body["result"]["evidence"][0]["verified"] is True
    assert [f["status"] for f in body["files"]] == ["accepted"] * 5
    assert body["files"][0]["document_id"] == "doc1"


def test_expired_insurance_is_reported_as_expired(tmp_path: Path) -> None:
    files = [pdf_file(p) for p in sorted(PACKET_3.glob("*.pdf"))]
    body = post(make_client(tmp_path), files, code="VVS-03").json()
    assert body["result"]["ai_status"] == "expired"


def test_nothing_is_written_to_disk(tmp_path: Path) -> None:
    post(make_client(tmp_path), [pdf_file(PACKET_1 / "f-skatt.pdf")])
    assert not (tmp_path / "uploads").exists()


def test_one_bad_file_does_not_discard_the_good_ones(tmp_path: Path) -> None:
    files = [
        pdf_file(PACKET_1 / "f-skatt.pdf"),
        ("files", ("notes.txt", b"hello", "text/plain")),
    ]
    response = post(make_client(tmp_path), files)
    assert response.status_code == 200
    reports = response.json()["files"]
    assert [r["status"] for r in reports] == ["accepted", "rejected"]
    assert reports[1]["code"] == "not_pdf"
    assert reports[1]["message"].startswith("notes.txt:")
    assert "PDF" in reports[1]["hint"]
    assert response.json()["result"]["ai_status"] == "found"


def test_no_usable_file_gives_400_with_reasons(tmp_path: Path) -> None:
    files = [("files", ("a.pdf", b"", "application/pdf"))]
    response = post(make_client(tmp_path), files)
    assert response.status_code == 400
    body = response.json()
    assert body["result"] is None
    assert body["files"][0]["code"] == "empty"
    assert body["files"][0]["hint"]


def test_oversized_file_is_rejected_with_the_limit_in_the_message(tmp_path: Path) -> None:
    files = [("files", ("big.pdf", b"%PDF-" + b"0" * (1024 * 1024 + 10), "application/pdf"))]
    response = post(make_client(tmp_path, max_file_mb=1), files)
    assert response.status_code == 400
    assert "1 MB" in response.json()["files"][0]["message"]


def test_too_many_files_and_no_files(tmp_path: Path) -> None:
    client = make_client(tmp_path, max_files=1)
    files = [pdf_file(PACKET_1 / "f-skatt.pdf"), pdf_file(PACKET_1 / "forsakring.pdf")]
    response = post(client, files)
    assert response.status_code == 400
    assert "between 1 and 1" in response.json()["message"]
    assert post(client, []).status_code == 400


def test_unknown_template_and_requirement_give_404(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    files = [pdf_file(PACKET_1 / "f-skatt.pdf")]
    assert post(client, files, template="nope").status_code == 404
    assert post(client, files, code="VVS-99").status_code == 404


def test_scanned_pdf_gets_a_visible_warning(tmp_path: Path) -> None:
    files = [("files", ("scan.pdf", blank_pdf(), "application/pdf"))]
    body = post(make_client(tmp_path), files).json()
    assert body["files"][0]["status"] == "accepted"
    assert "may be a scan" in body["files"][0]["warnings"][0]
    assert body["result"]["ai_status"] == "missing"


def test_redaction_is_reported_without_the_number(tmp_path: Path) -> None:
    response = post(make_client(tmp_path), [pdf_file(PACKET_3 / "behorigheter.pdf")])
    warnings = response.json()["files"][0]["warnings"]
    assert any("Personal numbers were hidden" in w for w in warnings)
    assert "19121212" not in response.text


def test_filename_is_shown_safely_and_never_used_as_a_path(tmp_path: Path) -> None:
    evil = ("files", ("../../etc/passwd.txt", b"hello", "text/plain"))
    response = post(make_client(tmp_path), [evil])
    assert response.json()["files"][0]["filename"] == "passwd.txt"
    assert not (tmp_path / "uploads").exists()


def test_errors_never_echo_document_text(tmp_path: Path) -> None:
    secret = b"%PDF-1.4 SECRET-DOCUMENT-TEXT not really a pdf"
    response = post(make_client(tmp_path), [("files", ("x.pdf", secret, "application/pdf"))])
    assert "SECRET-DOCUMENT-TEXT" not in response.text


def test_provider_down_gives_503_with_plain_advice(tmp_path: Path) -> None:
    class Down:
        name, label, model = "ollama", "Local model", "tiny"

        def complete_json(self, *args: Any) -> dict[str, Any]:
            raise ProviderError("refused")

    client = make_client(tmp_path)
    client.app.state.provider = Down()
    response = post(client, [pdf_file(PACKET_1 / "f-skatt.pdf")])
    assert response.status_code == 503
    assert "Ollama" in response.json()["message"]


def test_unexpected_failure_gives_generic_500(tmp_path: Path) -> None:
    class Broken:
        name, label, model = "x", "Simulated", "x"

        def complete_json(self, *args: Any) -> dict[str, Any]:
            raise RuntimeError("boom with SECRET-DOCUMENT-TEXT")

    client = make_client(tmp_path)
    client.app.state.provider = Broken()
    response = post(client, [pdf_file(PACKET_1 / "f-skatt.pdf")])
    assert response.status_code == 500
    assert "SECRET" not in response.text
    assert "Traceback" not in response.text


@pytest.mark.parametrize("name", ["", "   ", "\x01\x02"])
def test_unnamed_file_gets_a_placeholder_name(tmp_path: Path, name: str) -> None:
    files = [("files", (name or "blank", b"x", "text/plain"))]
    assert post(make_client(tmp_path), files).status_code == 400


def test_display_name_strips_paths_and_control_characters() -> None:
    assert display_name("C:\\Users\\pm\\f-skatt.pdf") == "f-skatt.pdf"
    assert display_name("a\x00b\x1b[31m.pdf") == "ab[31m.pdf"
    assert display_name("x" * 500) == "x" * 100
    assert display_name(None) == "(unnamed file)"
    assert display_name("\x01\x02") == "(unnamed file)"
