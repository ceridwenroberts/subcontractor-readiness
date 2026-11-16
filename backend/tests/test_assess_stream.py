import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.config import PROJECT_ROOT, Settings
from app.db.models import Finding
from app.main import create_app
from app.providers.base import ProviderError

PACKET_3 = PROJECT_ROOT / "evals" / "packets" / "03_expired_and_personnummer"


def make_client(tmp_path: Path) -> TestClient:
    settings = Settings(
        _env_file=None,
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        uploads_dir=tmp_path / "uploads",
    )
    return TestClient(create_app(settings))


def engagement(client: TestClient, with_documents: bool = True) -> str:
    pid = client.post("/projects", json={"name": "D", "template_id": "vvs"}).json()[
        "id"
    ]
    eid = client.post(
        f"/projects/{pid}/engagements", json={"subcontractor_name": "X"}
    ).json()["id"]
    if with_documents:
        files = [
            ("files", (p.name, p.read_bytes(), "application/pdf"))
            for p in sorted(PACKET_3.glob("*.pdf"))
        ]
        client.post(f"/engagements/{eid}/documents", files=files)
    return eid


def events(response: Any) -> list[dict[str, Any]]:
    return [json.loads(line) for line in response.text.splitlines() if line.strip()]


def stored(client: TestClient) -> int:
    with client.app.state.session_factory() as db:
        return db.scalar(select(func.count()).select_from(Finding))


def test_stream_reports_each_requirement_then_the_findings(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    eid = engagement(client)
    response = client.post(f"/engagements/{eid}/assess/stream")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    seen = events(response)
    assert seen[0] == {"type": "start", "total": 7}
    working = [e for e in seen if e["type"] == "working"]
    assert [e["index"] for e in working] == list(range(1, 8))
    assert all(e["total"] == 7 and e["title"] for e in working)
    assert working[0]["code"] == "VVS-01"
    assert seen[-1]["type"] == "done"
    assert [e["type"] for e in seen[1:-1]] == ["working"] * 7


def test_stream_result_matches_the_stored_findings(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    eid = engagement(client)
    done = events(client.post(f"/engagements/{eid}/assess/stream"))[-1]
    assert done["findings"] == client.get(f"/engagements/{eid}/findings").json()
    assert {f["requirement_code"]: f["ai_status"] for f in done["findings"]}[
        "VVS-03"
    ] == "expired"
    assert stored(client) == 7


def test_stream_and_plain_assess_give_the_same_statuses(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    eid = engagement(client)
    plain = [f["ai_status"] for f in client.post(f"/engagements/{eid}/assess").json()]
    streamed = events(client.post(f"/engagements/{eid}/assess/stream"))[-1]["findings"]
    assert [f["ai_status"] for f in streamed] == plain


def test_provider_failure_ends_with_an_error_event_and_saves_nothing(
    tmp_path: Path,
) -> None:
    class Down:
        name, label, model = "ollama", "Local model", "tiny"

        def complete_json(self, *args: Any) -> dict[str, Any]:
            raise ProviderError("refused")

    client = make_client(tmp_path)
    eid = engagement(client)
    client.app.state.provider = Down()
    seen = events(client.post(f"/engagements/{eid}/assess/stream"))
    assert seen[-1]["type"] == "error" and seen[-1]["status"] == 503
    assert "Ollama" in seen[-1]["message"]
    assert not any(e["type"] == "done" for e in seen)
    assert stored(client) == 0


def test_unexpected_failure_gives_a_generic_error_event(tmp_path: Path) -> None:
    class Broken:
        name, label, model = "x", "Simulated", "x"

        def complete_json(self, *args: Any) -> dict[str, Any]:
            raise RuntimeError("boom with SECRET-DOCUMENT-TEXT")

    client = make_client(tmp_path)
    eid = engagement(client)
    client.app.state.provider = Broken()
    response = client.post(f"/engagements/{eid}/assess/stream")
    assert events(response)[-1]["status"] == 500
    assert "SECRET" not in response.text
    assert "Traceback" not in response.text
    assert stored(client) == 0


def test_problems_before_work_starts_are_plain_json_errors(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    assert client.post("/engagements/nope/assess/stream").status_code == 404
    eid = engagement(client, with_documents=False)
    response = client.post(f"/engagements/{eid}/assess/stream")
    assert response.status_code == 400
    assert "Upload at least one document" in response.json()["message"]
