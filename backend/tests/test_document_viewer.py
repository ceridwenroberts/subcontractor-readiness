from pathlib import Path

from fastapi.testclient import TestClient

from app.config import PROJECT_ROOT, Settings
from app.db.models import Document
from app.main import create_app

PACKET_3 = PROJECT_ROOT / "evals" / "packets" / "03_expired_and_personnummer"


def make_client(tmp_path: Path) -> TestClient:
    settings = Settings(
        _env_file=None,
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        uploads_dir=tmp_path / "uploads",
    )
    return TestClient(create_app(settings))


def upload(client: TestClient, name: str) -> str:
    pid = client.post("/projects", json={"name": "D", "template_id": "vvs"}).json()[
        "id"
    ]
    eid = client.post(
        f"/projects/{pid}/engagements", json={"subcontractor_name": "X"}
    ).json()["id"]
    pdf = PACKET_3 / name
    files = [("files", (name, pdf.read_bytes(), "application/pdf"))]
    return client.post(f"/engagements/{eid}/documents", files=files).json()["files"][0][
        "document_id"
    ]


def test_pages_return_redacted_text_only(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    did = upload(client, "behorigheter.pdf")
    response = client.get(f"/documents/{did}/pages")
    assert response.status_code == 200
    body = response.json()
    assert body["filename"] == "behorigheter.pdf"
    assert body["page_count"] == 2 == len(body["pages"])
    text = " ".join(body["pages"])
    assert "[PERSONNUMMER]" in text
    assert "19121212" not in response.text
    assert "Säker Vatten" in body["pages"][0]


def test_pages_carry_the_engagement_id_for_the_back_link(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    did = upload(client, "f-skatt.pdf")
    body = client.get(f"/documents/{did}/pages").json()
    assert client.get(f"/engagements/{body['engagement_id']}").status_code == 200


def test_original_file_is_served_as_a_pdf_with_safe_headers(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    did = upload(client, "f-skatt.pdf")
    response = client.get(f"/documents/{did}/file")
    assert response.status_code == 200
    assert response.content == (PACKET_3 / "f-skatt.pdf").read_bytes()
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert 'filename="document.pdf"' in response.headers["content-disposition"]
    assert (
        "f-skatt" not in response.headers["content-disposition"]
    )  # not the uploader's name


def test_unknown_document_is_404_for_both_endpoints(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    assert client.get("/documents/nope/pages").status_code == 404
    assert client.get("/documents/nope/file").status_code == 404


def test_a_tampered_stored_name_never_leaves_the_uploads_folder(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    did = upload(client, "f-skatt.pdf")
    secret = tmp_path / "secret.txt"
    secret.write_text("do not serve me")
    for bad in ["../secret.txt", "../../etc/passwd", "/etc/passwd", "not-a-uuid.pdf"]:
        with client.app.state.session_factory() as db:
            db.get(Document, did).stored_name = bad
            db.commit()
        response = client.get(f"/documents/{did}/file")
        assert response.status_code == 404, bad
        assert "do not serve me" not in response.text


def test_a_missing_file_on_disk_gives_a_friendly_404(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    did = upload(client, "f-skatt.pdf")
    for pdf in (tmp_path / "uploads").glob("*.pdf"):
        pdf.unlink()
    response = client.get(f"/documents/{did}/file")
    assert response.status_code == 404
    assert "no longer available" in response.json()["detail"]
