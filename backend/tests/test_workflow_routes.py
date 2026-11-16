import re
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import PROJECT_ROOT, Settings
from app.db.models import AppendOnlyError, DecisionLog, Document, Finding
from app.main import create_app

PACKET_3 = PROJECT_ROOT / "evals" / "packets" / "03_expired_and_personnummer"
UUID_PDF = re.compile(r"^[0-9a-f-]{36}\.pdf$")


def make_client(tmp_path: Path, **overrides: Any) -> TestClient:
    settings = Settings(
        _env_file=None,
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        uploads_dir=tmp_path / "uploads",
        **overrides,
    )
    return TestClient(create_app(settings))


def pdf_file(path: Path) -> tuple[str, tuple[str, bytes, str]]:
    return ("files", (path.name, path.read_bytes(), "application/pdf"))


def new_engagement(client: TestClient) -> str:
    project = client.post(
        "/projects", json={"name": "Demo", "template_id": "vvs"}
    ).json()
    engagement = client.post(
        f"/projects/{project['id']}/engagements",
        json={"subcontractor_name": "Exempelrör AB"},
    ).json()
    return engagement["id"]


# --- templates ---


def test_templates_list_and_placeholder_flag(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    listing = client.get("/templates").json()
    assert listing[0]["id"] == "vvs"
    assert listing[0]["placeholder"] is True
    detail = client.get("/templates/vvs").json()
    assert detail["placeholder"] is True
    assert len(detail["requirements"]) == 7
    assert detail["requirements"][0]["evidenceHints"]


def test_unknown_template_is_404(tmp_path: Path) -> None:
    assert make_client(tmp_path).get("/templates/nope").status_code == 404


# --- projects and engagements ---


def test_create_and_read_project_and_engagement(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    project = client.post("/projects", json={"name": " Demo ", "template_id": "vvs"})
    assert project.status_code == 201
    pid = project.json()["id"]
    assert project.json()["name"] == "Demo"

    engagement = client.post(
        f"/projects/{pid}/engagements",
        json={"subcontractor_name": "Exempelrör AB", "org_number": "556000-0000"},
    )
    assert engagement.status_code == 201
    eid = engagement.json()["id"]

    detail = client.get(f"/projects/{pid}").json()
    assert [e["id"] for e in detail["engagements"]] == [eid]
    assert (
        client.get(f"/engagements/{eid}").json()["subcontractor_name"]
        == "Exempelrör AB"
    )
    assert [p["id"] for p in client.get("/projects").json()] == [pid]


def test_project_needs_a_real_template_and_a_name(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    assert (
        client.post("/projects", json={"name": "x", "template_id": "nope"}).status_code
        == 404
    )
    assert (
        client.post("/projects", json={"name": "", "template_id": "vvs"}).status_code
        == 422
    )
    extra = {"name": "x", "template_id": "vvs", "admin": True}
    assert client.post("/projects", json=extra).status_code == 422


def test_unknown_ids_are_404(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    assert client.get("/projects/nope").status_code == 404
    assert client.get("/engagements/nope").status_code == 404
    assert client.get("/engagements/nope/documents").status_code == 404
    assert (
        client.post(
            "/projects/nope/engagements", json={"subcontractor_name": "x"}
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/engagements/nope/documents", files=[pdf_file(PACKET_3 / "f-skatt.pdf")]
        ).status_code
        == 404
    )


def test_data_survives_a_restart(tmp_path: Path) -> None:
    first = make_client(tmp_path)
    pid = first.post("/projects", json={"name": "Keep", "template_id": "vvs"}).json()[
        "id"
    ]
    assert make_client(tmp_path).get(f"/projects/{pid}").status_code == 200


# --- documents ---


def test_upload_stores_redacted_text_and_a_uuid_file(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    eid = new_engagement(client)
    response = client.post(
        f"/engagements/{eid}/documents", files=[pdf_file(PACKET_3 / "behorigheter.pdf")]
    )
    assert response.status_code == 201
    report = response.json()["files"][0]
    assert report["status"] == "accepted"
    assert report["document_id"]

    stored = [p.name for p in (tmp_path / "uploads").iterdir()]
    assert len(stored) == 1 and UUID_PDF.match(stored[0])
    assert "behorigheter" not in stored[0]

    with client.app.state.session_factory() as db:
        doc = db.scalars(select(Document)).one()
        text = " ".join(doc.pages_json)
        assert "19121212" not in text
        assert "[PERSONNUMMER]" in text
        assert doc.redaction_count == 1
        assert doc.original_filename == "behorigheter.pdf"
        assert doc.stored_name == stored[0]


def test_list_documents_has_no_text_and_keeps_warnings(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    eid = new_engagement(client)
    client.post(
        f"/engagements/{eid}/documents", files=[pdf_file(PACKET_3 / "behorigheter.pdf")]
    )
    response = client.get(f"/engagements/{eid}/documents")
    docs = response.json()
    assert docs[0]["filename"] == "behorigheter.pdf"
    assert docs[0]["page_count"] == 2
    assert any("Personal numbers were hidden" in w for w in docs[0]["warnings"])
    assert "Säker Vatten" not in response.text
    assert "19121212" not in response.text


def test_bad_file_is_reported_and_good_file_is_still_stored(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    eid = new_engagement(client)
    files = [
        pdf_file(PACKET_3 / "f-skatt.pdf"),
        ("files", ("x.txt", b"hello", "text/plain")),
    ]
    response = client.post(f"/engagements/{eid}/documents", files=files)
    assert response.status_code == 201
    statuses = [f["status"] for f in response.json()["files"]]
    assert statuses == ["accepted", "rejected"]
    assert len(client.get(f"/engagements/{eid}/documents").json()) == 1


def test_all_files_bad_gives_400_and_stores_nothing(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    eid = new_engagement(client)
    response = client.post(
        f"/engagements/{eid}/documents",
        files=[("files", ("x.txt", b"hello", "text/plain"))],
    )
    assert response.status_code == 400
    assert response.json()["files"][0]["hint"]
    assert client.get(f"/engagements/{eid}/documents").json() == []
    assert not (tmp_path / "uploads").exists()


def test_upload_with_no_files_or_too_many(tmp_path: Path) -> None:
    client = make_client(tmp_path, max_files=1)
    eid = new_engagement(client)
    assert client.post(f"/engagements/{eid}/documents", files=[]).status_code == 400
    two = [pdf_file(PACKET_3 / "f-skatt.pdf"), pdf_file(PACKET_3 / "forsakring.pdf")]
    response = client.post(f"/engagements/{eid}/documents", files=two)
    assert response.status_code == 400
    assert "between 1 and 1" in response.json()["message"]


# --- append-only DecisionLog ---


def _finding_and_decision(client: TestClient) -> tuple[str, str]:
    eid = new_engagement(client)
    with client.app.state.session_factory() as db:
        finding = Finding(
            engagement_id=eid,
            requirement_code="VVS-01",
            model_status="found",
            ai_status="found",
            provider="scripted",
            provider_label="Simulated",
            model="fixture",
            prompt_version="assess-v2",
        )
        db.add(finding)
        db.flush()
        decision = DecisionLog(
            finding_id=finding.id,
            new_human_status="found",
            comment="ok",
            decided_by="PM",
        )
        db.add(decision)
        db.commit()
        return finding.id, decision.id


def test_decision_log_rows_cannot_be_updated(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _, did = _finding_and_decision(client)
    with client.app.state.session_factory() as db:
        row = db.get(DecisionLog, did)
        row.comment = "changed"
        with pytest.raises(AppendOnlyError):
            db.commit()


def test_decision_log_rows_cannot_be_deleted(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _, did = _finding_and_decision(client)
    with client.app.state.session_factory() as db:
        db.delete(db.get(DecisionLog, did))
        with pytest.raises(AppendOnlyError):
            db.commit()


def test_finding_keeps_three_separate_statuses(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    fid, _ = _finding_and_decision(client)
    with client.app.state.session_factory() as db:
        finding = db.get(Finding, fid)
        assert finding.human_status is None
        finding.human_status = "partial"
        db.commit()
        db.refresh(finding)
        assert (finding.model_status, finding.ai_status, finding.human_status) == (
            "found",
            "found",
            "partial",
        )
