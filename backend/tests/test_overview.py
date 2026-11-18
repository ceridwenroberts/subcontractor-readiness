from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any, get_args

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db.models import Document, Finding
from app.main import create_app
from app.overview import Glance, ReqState, count_statuses, effective_status, glance_for
from app.routes.issues import get_today

TODAY = date(2026, 11, 17)
MANDATORY = ["VVS-01", "VVS-02", "VVS-03", "VVS-05", "VVS-07"]
OPTIONAL = ["VVS-04", "VVS-06"]


# --- pure rules ---


def state(
    code: str = "R",
    status: Any = "found",
    decided: bool = True,
    mandatory: bool = True,
    open_request: bool = False,
) -> ReqState:
    return ReqState(
        code=code,
        mandatory=mandatory,
        status=status,
        decided=decided,
        open_request=open_request,
    )


def test_effective_status_prefers_the_person_and_flags_a_date_that_ran_out() -> None:
    assert effective_status(None, "unclear", None, TODAY) == "unclear"
    assert effective_status("found", "missing", None, TODAY) == "found"
    past = TODAY - timedelta(days=1)
    assert effective_status("found", "found", past, TODAY) == "expired"
    assert effective_status(None, "partial", past, TODAY) == "expired"
    assert (
        effective_status(None, "found", TODAY, TODAY) == "found"
    )  # valid through today
    assert effective_status("missing", "found", past, TODAY) == "missing"


def test_glance_not_assessed_without_documents_or_findings() -> None:
    assert (
        glance_for([state(status=None, decided=False)], has_documents=True)
        == "not_assessed"
    )
    assert glance_for([state()], has_documents=False) == "not_assessed"


def test_glance_priority_open_request_then_awaiting_then_complete_or_gaps() -> None:
    assert glance_for([state(open_request=True)], True) == "new_upload_requested"
    assert glance_for([state(decided=False)], True) == "awaiting_decision"
    assert glance_for([state(), state("B")], True) == "documentation_complete"
    assert glance_for([state(), state("B", status="missing")], True) == "gaps_recorded"
    assert glance_for([state(), state("B", status="partial")], True) == "gaps_recorded"


def test_optional_requirements_do_not_block_documentation_complete() -> None:
    states = [state(), state("O", status="missing", decided=False, mandatory=False)]
    assert glance_for(states, True) == "documentation_complete"


def test_counts_are_plain_counts_per_status() -> None:
    counts = count_statuses(
        [state(), state("B", status="missing"), state("C", status=None)]
    )
    assert counts == {
        "found": 1,
        "partial": 0,
        "missing": 1,
        "unclear": 0,
        "expired": 0,
        "not_assessed": 1,
    }


# --- the route ---


def make_client(tmp_path: Path) -> TestClient:
    s = Settings(
        _env_file=None,
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        uploads_dir=tmp_path / "uploads",
    )
    app = create_app(s)
    app.dependency_overrides[get_today] = lambda: TODAY
    client = TestClient(app)
    token = client.post("/session", json={"user_id": "demo-pm"}).json()["token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client


def make_project(client: TestClient) -> str:
    return client.post(
        "/projects", json={"name": "Hamnen 4", "template_id": "vvs"}
    ).json()["id"]


def add_engagement(
    client: TestClient, project_id: str, name: str = "Exempelrör AB"
) -> str:
    r = client.post(
        f"/projects/{project_id}/engagements",
        json={"subcontractor_name": name, "contact_email": "k@exempel.example"},
    )
    return r.json()["id"]


def add_document(client: TestClient, engagement_id: str) -> None:
    with client.app.state.session_factory() as db:
        db.add(
            Document(
                engagement_id=engagement_id,
                original_filename="f.pdf",
                stored_name="x.pdf",
                sha256="0" * 64,
                page_count=1,
                pages_json=["text"],
                redaction_count=0,
                redaction_notes_json=[],
            )
        )
        db.commit()


def add_finding(
    client: TestClient,
    engagement_id: str,
    code: str,
    ai_status: str = "found",
    valid_until: date | None = None,
) -> str:
    with client.app.state.session_factory() as db:
        f = Finding(
            engagement_id=engagement_id,
            requirement_code=code,
            model_status=ai_status,
            ai_status=ai_status,
            evidence_json=[],
            valid_until=valid_until,
            notes="",
            provider="scripted",
            provider_label="Simulated",
            model="fixture",
            prompt_version="assess-v2",
            created_at=datetime(2026, 11, 1, tzinfo=UTC),
        )
        db.add(f)
        db.commit()
        return f.id


def decide(
    client: TestClient, finding_id: str, status: str = "found", **extra: Any
) -> None:
    r = client.patch(f"/findings/{finding_id}", json={"status": status, **extra})
    assert r.status_code == 200, r.text


def overview(client: TestClient, project_id: str) -> list[dict[str, Any]]:
    r = client.get(f"/projects/{project_id}/overview")
    assert r.status_code == 200
    return r.json()["engagements"]


def test_unknown_project_is_404(tmp_path: Path) -> None:
    assert make_client(tmp_path).get("/projects/nope/overview").status_code == 404


def test_new_subcontractor_is_not_assessed(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    p = make_project(client)
    add_engagement(client, p)
    [e] = overview(client, p)
    assert e["glance"] == "not_assessed" and e["document_count"] == 0
    assert e["counts"]["not_assessed"] == 7
    assert [c["status"] for c in e["requirements"]] == [None] * 7


def test_assessed_but_undecided_is_awaiting_decision(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    p = make_project(client)
    eng = add_engagement(client, p)
    add_document(client, eng)
    for code in MANDATORY + OPTIONAL:
        add_finding(client, eng, code)
    [e] = overview(client, p)
    assert e["glance"] == "awaiting_decision"
    assert e["awaiting_decision"] == 7
    assert e["counts"]["found"] == 7


def test_every_mandatory_requirement_decided_found_is_documentation_complete(
    tmp_path: Path,
) -> None:
    client = make_client(tmp_path)
    p = make_project(client)
    eng = add_engagement(client, p)
    add_document(client, eng)
    for code in MANDATORY:
        decide(client, add_finding(client, eng, code))
    [e] = overview(client, p)
    assert e["glance"] == "documentation_complete"
    cell = next(c for c in e["requirements"] if c["code"] == "VVS-01")
    assert cell["decided"] is True and cell["decided_by"] == "Test PM (demo)"


def test_a_person_confirming_missing_is_gaps_recorded(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    p = make_project(client)
    eng = add_engagement(client, p)
    add_document(client, eng)
    for code in MANDATORY:
        decide(client, add_finding(client, eng, code))
    # Replace one with a newer finding where the person confirms "missing".
    f = add_finding(client, eng, "VVS-01", ai_status="missing")
    with client.app.state.session_factory() as db:
        row = db.get(Finding, f)
        row.created_at = datetime(2026, 11, 2, tzinfo=UTC)
        db.commit()
    decide(client, f, "missing")
    [e] = overview(client, p)
    assert e["glance"] == "gaps_recorded"


def test_an_open_upload_request_wins_and_a_later_decision_closes_it(
    tmp_path: Path,
) -> None:
    client = make_client(tmp_path)
    p = make_project(client)
    eng = add_engagement(client, p)
    add_document(client, eng)
    f = add_finding(client, eng, "VVS-01", ai_status="missing")
    decide(
        client, f, "missing", reason="incomplete", request_upload={"send_email": False}
    )
    [e] = overview(client, p)
    assert e["glance"] == "new_upload_requested" and e["open_requests"] == 1
    decide(client, f, "missing", reason="other", comment="Checked by phone")
    [e] = overview(client, p)
    assert e["open_requests"] == 0 and e["glance"] != "new_upload_requested"


def test_a_date_that_has_run_out_shows_as_expired_even_after_a_decision(
    tmp_path: Path,
) -> None:
    client = make_client(tmp_path)
    p = make_project(client)
    eng = add_engagement(client, p)
    add_document(client, eng)
    for code in MANDATORY:
        until = TODAY - timedelta(days=3) if code == "VVS-03" else None
        decide(client, add_finding(client, eng, code, valid_until=until))
    [e] = overview(client, p)
    assert e["glance"] == "gaps_recorded"
    cell = next(c for c in e["requirements"] if c["code"] == "VVS-03")
    assert cell["status"] == "expired"


def test_newest_subcontractor_first_and_other_projects_are_left_out(
    tmp_path: Path,
) -> None:
    client = make_client(tmp_path)
    p = make_project(client)
    other = make_project(client)
    add_engagement(client, p, "First AB")
    add_engagement(client, p, "Second AB")
    add_engagement(client, other, "Elsewhere AB")
    names = [e["subcontractor_name"] for e in overview(client, p)]
    assert names == ["Second AB", "First AB"]


def test_the_overview_never_uses_the_words_the_interface_may_not_use() -> None:
    banned = ["approved", "compliant", "qualified", "pass", "fail", "score"]
    for key in get_args(Glance):
        assert not [w for w in banned if w in key], key


@pytest.mark.parametrize(
    "status", ["found", "partial", "missing", "unclear", "expired"]
)
def test_counts_keys_cover_every_status(status: str) -> None:
    assert status in count_statuses([])
