from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db.models import Finding
from app.expiry import build_reminder, days_left, tier_for
from app.main import create_app
from app.routes.issues import get_today

TODAY = date(2026, 11, 17)
TIERS = {"urgent": 14, "soon": 30, "upcoming": 60}


def test_days_left_counts_whole_days_and_zero_means_valid_through_today() -> None:
    assert days_left(TODAY, TODAY) == 0
    assert days_left(TODAY + timedelta(days=9), TODAY) == 9
    assert days_left(TODAY - timedelta(days=1), TODAY) == -1


@pytest.mark.parametrize(
    ("days", "tier"),
    [
        (-400, "expired"),
        (-1, "expired"),
        (0, "urgent"),  # valid through today
        (14, "urgent"),
        (15, "soon"),
        (30, "soon"),
        (31, "upcoming"),
        (60, "upcoming"),
        (61, None),
        (500, None),
    ],
)
def test_tier_boundaries(days: int, tier: str | None) -> None:
    assert tier_for(days, **TIERS) == tier


def test_reminder_before_expiry_names_the_date_and_days() -> None:
    r = build_reminder(
        to="a@x.example",
        subcontractor="Exempelrör AB",
        project="Hamnen 4",
        requirement="Liability insurance",
        valid_until=TODAY + timedelta(days=9),
        days=9,
    )
    assert r.kind == "before_expiry"
    assert "2026-11-26" in r.subject and "in 9 days" in r.body
    assert "Exempelrör AB" in r.body and "Hamnen 4" in r.body


def test_reminder_uses_singular_for_one_day() -> None:
    r = build_reminder(
        to="a@x.example",
        subcontractor="A",
        project="P",
        requirement="R",
        valid_until=TODAY + timedelta(days=1),
        days=1,
    )
    assert "in 1 day." in r.body


def test_reminder_at_and_after_expiry() -> None:
    kwargs: dict[str, Any] = {
        "to": "a@x.example",
        "subcontractor": "A",
        "project": "P",
        "requirement": "R",
    }
    today = build_reminder(valid_until=TODAY, days=0, **kwargs)
    past = build_reminder(valid_until=TODAY - timedelta(days=3), days=-3, **kwargs)
    assert today.kind == past.kind == "at_expiry"
    assert "which is today" in today.body
    assert "which has ended" in past.body


def test_reminder_text_avoids_the_words_the_interface_may_not_use() -> None:
    banned = ["approved", "compliant", "qualified", "passed", "failed", "score"]
    for days in (30, 0, -5):
        r = build_reminder(
            to="a@x.example",
            subcontractor="A",
            project="P",
            requirement="R",
            valid_until=TODAY + timedelta(days=days),
            days=days,
        )
        text = f"{r.subject} {r.body}".lower()
        assert not [w for w in banned if w in text], days


# --- the route ---


def make_client(tmp_path: Path, **settings: Any) -> TestClient:
    s = Settings(
        _env_file=None,
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        uploads_dir=tmp_path / "uploads",
        **settings,
    )
    app = create_app(s)
    app.dependency_overrides[get_today] = lambda: TODAY
    client = TestClient(app)
    token = client.post("/session", json={"user_id": "demo-pm"}).json()["token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client


def make_engagement(
    client: TestClient,
    name: str = "Exempelrör AB",
    contact: str | None = "k@exempel.example",
) -> str:
    pid = client.post(
        "/projects", json={"name": "Hamnen 4", "template_id": "vvs"}
    ).json()["id"]
    body: dict[str, Any] = {"subcontractor_name": name}
    if contact:
        body["contact_email"] = contact
    return client.post(f"/projects/{pid}/engagements", json=body).json()["id"]


def add_finding(
    client: TestClient,
    engagement_id: str,
    code: str = "VVS-03",
    ai_status: str = "found",
    valid_until: date | None = None,
    human_status: str | None = None,
    minutes: int = 0,
) -> str:
    with client.app.state.session_factory() as db:
        f = Finding(
            engagement_id=engagement_id,
            requirement_code=code,
            model_status=ai_status,
            ai_status=ai_status,
            human_status=human_status,
            evidence_json=[],
            valid_until=valid_until,
            notes="",
            provider="scripted",
            provider_label="Simulated",
            model="fixture",
            prompt_version="assess-v2",
            created_at=datetime(2026, 11, 1, tzinfo=UTC) + timedelta(minutes=minutes),
        )
        db.add(f)
        db.commit()
        return f.id


def issues(client: TestClient) -> list[dict[str, Any]]:
    response = client.get("/issues/expiring")
    assert response.status_code == 200
    return response.json()


def test_no_findings_means_no_issues(tmp_path: Path) -> None:
    assert issues(make_client(tmp_path)) == []


def test_lists_dates_inside_the_tiers_most_urgent_first(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    e = make_engagement(client)
    add_finding(client, e, "VVS-03", valid_until=TODAY + timedelta(days=50))
    add_finding(client, e, "VVS-05", valid_until=TODAY + timedelta(days=9))
    add_finding(
        client, e, "VVS-07", valid_until=TODAY - timedelta(days=4), ai_status="expired"
    )
    add_finding(
        client, e, "VVS-01", valid_until=TODAY + timedelta(days=400)
    )  # too far away
    got = issues(client)
    assert [(i["requirement_code"], i["tier"], i["days_left"]) for i in got] == [
        ("VVS-07", "expired", -4),
        ("VVS-05", "urgent", 9),
        ("VVS-03", "upcoming", 50),
    ]
    first = got[0]
    assert (
        first["subcontractor_name"] == "Exempelrör AB"
        and first["project_name"] == "Hamnen 4"
    )
    assert first["requirement_title"] == "Hot work certificate"


def test_a_date_that_ran_out_after_assessing_is_flagged_even_if_stored_as_found(
    tmp_path: Path,
) -> None:
    client = make_client(tmp_path)
    e = make_engagement(client)
    add_finding(client, e, ai_status="found", valid_until=TODAY - timedelta(days=1))
    assert issues(client)[0]["tier"] == "expired"
    assert issues(client)[0]["status"] == "found"


def test_only_the_latest_finding_per_requirement_counts(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    e = make_engagement(client)
    add_finding(client, e, valid_until=TODAY + timedelta(days=5), minutes=0)
    add_finding(
        client, e, valid_until=TODAY + timedelta(days=300), minutes=5
    )  # renewed
    assert issues(client) == []
    add_finding(client, e, valid_until=TODAY + timedelta(days=3), minutes=10)
    assert [i["days_left"] for i in issues(client)] == [3]


def test_findings_without_a_usable_date_are_left_out(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    e = make_engagement(client)
    add_finding(client, e, "VVS-03", valid_until=None)
    add_finding(
        client, e, "VVS-05", ai_status="missing", valid_until=TODAY + timedelta(days=5)
    )
    add_finding(
        client, e, "VVS-07", ai_status="unclear", valid_until=TODAY + timedelta(days=5)
    )
    assert issues(client) == []


def test_a_persons_decision_decides_whether_the_date_still_counts(
    tmp_path: Path,
) -> None:
    client = make_client(tmp_path)
    e = make_engagement(client)
    add_finding(
        client,
        e,
        "VVS-03",
        human_status="missing",
        valid_until=TODAY + timedelta(days=5),
    )
    add_finding(
        client,
        e,
        "VVS-05",
        human_status="partial",
        valid_until=TODAY + timedelta(days=5),
    )
    got = issues(client)
    assert [(i["requirement_code"], i["status"]) for i in got] == [
        ("VVS-05", "partial")
    ]


def test_reminder_draft_only_with_a_contact_address_and_is_a_draft(
    tmp_path: Path,
) -> None:
    client = make_client(tmp_path)
    with_mail = make_engagement(client, "Med Mail AB", "k@exempel.example")
    without = make_engagement(client, "Utan Mail AB", None)
    add_finding(client, with_mail, valid_until=TODAY + timedelta(days=9))
    add_finding(client, without, valid_until=TODAY + timedelta(days=9))
    by_name = {i["subcontractor_name"]: i for i in issues(client)}
    draft = by_name["Med Mail AB"]["reminder"]
    assert draft["to"] == "k@exempel.example" and draft["kind"] == "before_expiry"
    assert by_name["Utan Mail AB"]["reminder"] is None


def test_open_new_upload_request_is_marked(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    e = make_engagement(client)
    fid = add_finding(
        client, e, ai_status="expired", valid_until=TODAY - timedelta(days=2)
    )
    assert issues(client)[0]["new_upload_requested"] is False
    response = client.patch(
        f"/findings/{fid}",
        json={"status": "expired", "reason": "expired", "request_upload": {}},
    )
    assert response.status_code == 200
    assert issues(client)[0]["new_upload_requested"] is True


def test_the_tiers_come_from_config(tmp_path: Path) -> None:
    client = make_client(
        tmp_path, expiry_urgent_days=3, expiry_soon_days=6, expiry_upcoming_days=9
    )
    e = make_engagement(client)
    add_finding(client, e, "VVS-03", valid_until=TODAY + timedelta(days=5))
    add_finding(client, e, "VVS-05", valid_until=TODAY + timedelta(days=12))
    assert [(i["requirement_code"], i["tier"]) for i in issues(client)] == [
        ("VVS-03", "soon")
    ]


def test_tiers_must_be_in_order() -> None:
    with pytest.raises(ValueError):
        Settings(
            _env_file=None,
            expiry_urgent_days=30,
            expiry_soon_days=14,
            expiry_upcoming_days=60,
        )


def test_the_route_changes_nothing(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    e = make_engagement(client)
    add_finding(client, e, valid_until=TODAY + timedelta(days=5))
    before = client.get(f"/engagements/{e}/findings").json()
    issues(client)
    assert client.get(f"/engagements/{e}/findings").json() == before
