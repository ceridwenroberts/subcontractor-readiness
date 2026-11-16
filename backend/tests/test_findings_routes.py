from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.config import PROJECT_ROOT, Settings
from app.db.models import DecisionLog, Finding
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


def engagement_with_packet(client: TestClient) -> str:
    project = client.post(
        "/projects", json={"name": "Demo", "template_id": "vvs"}
    ).json()
    eid = client.post(
        f"/projects/{project['id']}/engagements",
        json={"subcontractor_name": "Exempelrör AB"},
    ).json()["id"]
    files = [
        ("files", (p.name, p.read_bytes(), "application/pdf"))
        for p in sorted(PACKET_3.glob("*.pdf"))
    ]
    assert client.post(f"/engagements/{eid}/documents", files=files).status_code == 201
    return eid


def count(client: TestClient, model: type) -> int:
    with client.app.state.session_factory() as db:
        return db.scalar(select(func.count()).select_from(model))


def test_assess_engagement_stores_one_finding_per_requirement(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    eid = engagement_with_packet(client)
    response = client.post(f"/engagements/{eid}/assess")
    assert response.status_code == 201
    findings = response.json()
    assert [f["requirement_code"] for f in findings] == [
        f"VVS-0{i}" for i in range(1, 8)
    ]
    by_code = {f["requirement_code"]: f for f in findings}
    assert by_code["VVS-03"]["ai_status"] == "expired"
    assert by_code["VVS-01"]["ai_status"] == "found"
    first = by_code["VVS-01"]
    assert first["provider_label"] == "Simulated"
    assert first["prompt_version"]
    assert first["human_status"] is None
    assert first["model_status"] == "found"
    assert first["evidence"][0]["document_name"] == "f-skatt.pdf"
    assert first["evidence"][0]["verified"] is True
    assert first["requirement_title"] == "F-skattsedel"


def test_list_findings_returns_the_same_stored_findings(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    eid = engagement_with_packet(client)
    assessed = client.post(f"/engagements/{eid}/assess").json()
    assert client.get(f"/engagements/{eid}/findings").json() == assessed


def test_reassessing_keeps_old_findings_and_lists_the_latest(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    eid = engagement_with_packet(client)
    first = client.post(f"/engagements/{eid}/assess").json()
    second = client.post(f"/engagements/{eid}/assess").json()
    assert len(second) == 7
    assert {f["id"] for f in first}.isdisjoint({f["id"] for f in second})
    assert count(client, Finding) == 14


def test_assess_without_documents_is_a_friendly_400(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    project = client.post("/projects", json={"name": "D", "template_id": "vvs"}).json()
    eid = client.post(
        f"/projects/{project['id']}/engagements", json={"subcontractor_name": "X"}
    ).json()["id"]
    response = client.post(f"/engagements/{eid}/assess")
    assert response.status_code == 400
    assert "Upload at least one document" in response.json()["message"]


def test_provider_failure_saves_nothing(tmp_path: Path) -> None:
    class Down:
        name, label, model = "ollama", "Local model", "tiny"

        def complete_json(self, *args: Any) -> dict[str, Any]:
            raise ProviderError("refused")

    client = make_client(tmp_path)
    eid = engagement_with_packet(client)
    client.app.state.provider = Down()
    response = client.post(f"/engagements/{eid}/assess")
    assert response.status_code == 503
    assert "Ollama" in response.json()["message"]
    assert count(client, Finding) == 0


def test_unknown_engagement_and_finding_are_404(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    assert client.post("/engagements/nope/assess").status_code == 404
    assert client.get("/engagements/nope/findings").status_code == 404
    body = {"status": "found", "comment": "x", "decided_by": "PM"}
    assert client.patch("/findings/nope", json=body).status_code == 404
    assert client.get("/findings/nope/decisions").status_code == 404


def _first_finding(client: TestClient) -> dict[str, Any]:
    eid = engagement_with_packet(client)
    return client.post(f"/engagements/{eid}/assess").json()[2]  # VVS-03, expired


def test_decision_sets_human_status_only_and_logs_it(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    finding = _first_finding(client)
    body = {
        "status": "partial",
        "comment": "Renewal letter seen.",
        "decided_by": "Test PM",
    }
    response = client.patch(f"/findings/{finding['id']}", json=body)
    assert response.status_code == 200
    updated = response.json()
    assert updated["human_status"] == "partial"
    assert updated["ai_status"] == finding["ai_status"] == "expired"  # untouched
    assert updated["model_status"] == finding["model_status"]

    log = client.get(f"/findings/{finding['id']}/decisions").json()
    assert len(log) == 1
    assert log[0]["old_human_status"] is None
    assert log[0]["new_human_status"] == "partial"
    assert log[0]["comment"] == "Renewal letter seen."
    assert log[0]["decided_by"] == "Test PM"


def test_second_decision_appends_and_records_the_old_status(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    fid = _first_finding(client)["id"]
    client.patch(
        f"/findings/{fid}",
        json={"status": "partial", "comment": "a", "decided_by": "PM"},
    )
    client.patch(
        f"/findings/{fid}", json={"status": "found", "comment": "b", "decided_by": "PM"}
    )
    log = client.get(f"/findings/{fid}/decisions").json()
    assert [(d["old_human_status"], d["new_human_status"]) for d in log] == [
        (None, "partial"),
        ("partial", "found"),
    ]
    assert count(client, DecisionLog) == 2


def test_decision_needs_a_comment_a_name_and_a_valid_status(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    fid = _first_finding(client)["id"]
    good = {"status": "found", "comment": "ok", "decided_by": "PM"}
    for bad in [
        {**good, "comment": ""},
        {**good, "decided_by": ""},
        {**good, "status": "approved"},
        {**good, "extra": 1},
    ]:
        assert client.patch(f"/findings/{fid}", json=bad).status_code == 422
    assert count(client, DecisionLog) == 0


def test_there_is_no_way_to_edit_or_delete_decisions_over_http(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    fid = _first_finding(client)["id"]
    client.patch(
        f"/findings/{fid}", json={"status": "found", "comment": "a", "decided_by": "PM"}
    )
    did = client.get(f"/findings/{fid}/decisions").json()[0]["id"]
    for method in ("put", "patch", "delete"):
        for url in (
            f"/findings/{fid}/decisions",
            f"/findings/{fid}/decisions/{did}",
            f"/decisions/{did}",
        ):
            assert getattr(client, method)(url).status_code in (404, 405)
    assert count(client, DecisionLog) == 1


def test_reassess_does_not_carry_over_or_lose_a_decision(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    eid = engagement_with_packet(client)
    old = client.post(f"/engagements/{eid}/assess").json()[0]
    client.patch(
        f"/findings/{old['id']}",
        json={"status": "found", "comment": "a", "decided_by": "PM"},
    )
    new = client.post(f"/engagements/{eid}/assess").json()[0]
    assert new["human_status"] is None  # a fresh finding needs a fresh decision
    assert len(client.get(f"/findings/{old['id']}/decisions").json()) == 1
