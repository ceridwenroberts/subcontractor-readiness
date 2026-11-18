import sqlite3
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.config import PROJECT_ROOT, Settings
from app.db.models import AppendOnlyError, DecisionLog, UploadRequest
from app.main import create_app
from app.upload_requests import REASONS, build_draft, is_fictional_address

PACKET_3 = PROJECT_ROOT / "evals" / "packets" / "03_expired_and_personnummer"
BANNED = [
    "approved",
    "compliant",
    "qualified",
    "rejected",
    "failed",
    "does not pass",
    "score",
]


def make_client(tmp_path: Path) -> TestClient:
    settings = Settings(
        _env_file=None,
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        uploads_dir=tmp_path / "uploads",
    )
    client = TestClient(create_app(settings))
    token = client.post("/session", json={"user_id": "demo-pm"}).json()["token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client


def setup_engagement(
    client: TestClient,
    name: str = "Exempelrör AB",
    contact: str | None = "kontakt@exemplet.example",
) -> tuple[str, list[dict[str, Any]]]:
    pid = client.post(
        "/projects", json={"name": "Hamnen 4", "template_id": "vvs"}
    ).json()["id"]
    body: dict[str, Any] = {"subcontractor_name": name}
    if contact:
        body["contact_email"] = contact
    eid = client.post(f"/projects/{pid}/engagements", json=body).json()["id"]
    files = [
        ("files", (p.name, p.read_bytes(), "application/pdf"))
        for p in sorted(PACKET_3.glob("*.pdf"))
    ]
    client.post(f"/engagements/{eid}/documents", files=files)
    return eid, client.post(f"/engagements/{eid}/assess").json()


def expired(findings: list[dict[str, Any]]) -> dict[str, Any]:
    return next(f for f in findings if f["ai_status"] == "expired")  # VVS-03


def count(client: TestClient, model: type) -> int:
    with client.app.state.session_factory() as db:
        return db.scalar(select(func.count()).select_from(model))


def request_upload(reason: str = "expired", send_email: bool = False) -> dict[str, Any]:
    """Body fields for asking for a new upload: the reason belongs to the decision itself."""
    return {"reason": reason, "request_upload": {"send_email": send_email}}


def patch(client: TestClient, fid: str, **body: Any):
    return client.patch(f"/findings/{fid}", json=body)


# --- the comment rule ---


def test_confirming_the_shown_result_needs_no_comment(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _, findings = setup_engagement(client)
    found = next(f for f in findings if f["ai_status"] == "found")
    response = patch(client, found["id"], status="found")
    assert response.status_code == 200
    log = client.get(f"/findings/{found['id']}/decisions").json()
    assert log[0]["comment"] == "" and log[0]["new_human_status"] == "found"


def test_changing_the_result_needs_a_reason_from_the_list(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _, findings = setup_engagement(client)
    found = next(f for f in findings if f["ai_status"] == "found")
    response = patch(client, found["id"], status="partial")
    assert response.status_code == 422
    assert "reason" in response.json()["detail"]
    assert count(client, DecisionLog) == 0
    # A standard reason is enough: no typed text is needed.
    ok = patch(client, found["id"], status="partial", reason="incomplete")
    assert ok.status_code == 200
    log = client.get(f"/findings/{found['id']}/decisions").json()
    assert log[0]["reason"] == "incomplete"
    assert (log[0]["old_human_status"], log[0]["new_human_status"]) == (None, "partial")


def test_typed_text_is_required_only_for_other(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _, findings = setup_engagement(client)
    found = next(f for f in findings if f["ai_status"] == "found")
    for blank in ({}, {"comment": "   "}):
        response = patch(client, found["id"], status="partial", reason="other", **blank)
        assert response.status_code == 422
        assert "Other" in response.json()["detail"]
    assert count(client, DecisionLog) == 0
    ok = patch(
        client,
        found["id"],
        status="partial",
        reason="other",
        comment="Seen in the annex.",
    )
    assert ok.status_code == 200


def test_a_reason_can_be_given_without_asking_for_a_new_upload(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _, findings = setup_engagement(client)
    found = next(f for f in findings if f["ai_status"] == "found")
    response = patch(client, found["id"], status="found", reason="incomplete")
    assert response.status_code == 200
    assert count(client, UploadRequest) == 0
    log = client.get(f"/findings/{found['id']}/decisions").json()
    assert log[0]["reason"] == "incomplete" and log[0]["comment"] == ""


def test_confirming_the_result_needs_neither_reason_nor_text(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _, findings = setup_engagement(client)
    found = next(f for f in findings if f["ai_status"] == "found")
    assert patch(client, found["id"], status="found").status_code == 200
    log = client.get(f"/findings/{found['id']}/decisions").json()
    assert log[0]["reason"] is None and log[0]["reason_label"] is None


def test_requesting_a_new_upload_needs_a_reason_but_no_text_unless_other(
    tmp_path: Path,
) -> None:
    client = make_client(tmp_path)
    _, findings = setup_engagement(client)
    f = expired(findings)
    no_reason = patch(client, f["id"], status="expired", request_upload={})
    assert no_reason.status_code == 422 and "reason" in no_reason.json()["detail"]
    assert count(client, DecisionLog) == 0 and count(client, UploadRequest) == 0
    assert (
        patch(client, f["id"], status="expired", **request_upload()).status_code == 200
    )
    assert count(client, UploadRequest) == 1


# --- requesting a new upload ---


def test_request_is_recorded_with_the_decision_and_no_email_by_default(
    tmp_path: Path,
) -> None:
    client = make_client(tmp_path)
    _, findings = setup_engagement(client)
    f = expired(findings)
    response = patch(
        client,
        f["id"],
        status="expired",
        comment="Please send the renewed policy.",
        **request_upload("expired"),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["human_status"] == "expired"
    assert body["ai_status"] == "expired"  # untouched
    request = body["latest_request"]
    assert request["reason"] == "expired"
    assert request["reason_label"] == REASONS["expired"]
    assert request["email_recorded"] is False and request["email_to"] is None
    assert request["requested_by"] == "Test PM (demo)"
    assert count(client, UploadRequest) == 1 == count(client, DecisionLog)


def test_email_is_a_recorded_draft_and_nothing_else(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _, findings = setup_engagement(client)
    f = expired(findings)
    body = patch(
        client,
        f["id"],
        status="expired",
        comment="Policy ended 2025-06-30.",
        **request_upload("expired", send_email=True),
    ).json()
    request = body["latest_request"]
    assert request["email_recorded"] is True
    assert request["email_to"] == "kontakt@exemplet.example"
    assert "Liability insurance" in request["email_subject"]
    assert (
        "Exempelrör AB" in request["email_body"] and "Hamnen 4" in request["email_body"]
    )
    assert "Policy ended 2025-06-30." in request["email_body"]
    assert "Test PM (demo)" in request["email_body"]


def test_email_without_a_contact_address_is_refused_and_nothing_is_logged(
    tmp_path: Path,
) -> None:
    client = make_client(tmp_path)
    _, findings = setup_engagement(client, contact=None)
    f = expired(findings)
    response = patch(
        client,
        f["id"],
        status="expired",
        comment="x",
        **request_upload(send_email=True),
    )
    assert response.status_code == 422
    assert "contact email" in response.json()["detail"]
    assert count(client, DecisionLog) == 0 and count(client, UploadRequest) == 0


def test_a_request_without_email_works_when_there_is_no_contact_address(
    tmp_path: Path,
) -> None:
    client = make_client(tmp_path)
    _, findings = setup_engagement(client, contact=None)
    f = expired(findings)
    assert (
        patch(
            client,
            f["id"],
            status="expired",
            comment="x",
            **request_upload(),
        ).status_code
        == 200
    )


def test_no_request_when_the_documents_show_evidence(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _, findings = setup_engagement(client)
    found = next(f for f in findings if f["ai_status"] == "found")
    response = patch(
        client,
        found["id"],
        status="found",
        comment="x",
        **request_upload("other"),
    )
    assert response.status_code == 422
    assert "do not clearly show evidence" in response.json()["detail"]
    assert count(client, DecisionLog) == 0


def test_unknown_reason_and_unknown_fields_are_refused(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _, findings = setup_engagement(client)
    f = expired(findings)
    bad = {"status": "expired", "comment": "x"}
    assert (
        patch(
            client,
            f["id"],
            **bad,
            reason="rejected",
            request_upload={"send_email": False},
        ).status_code
        == 422
    )
    assert (
        patch(
            client,
            f["id"],
            **bad,
            reason="other",
            request_upload={"send_email": False, "to": "a@b.c"},
        ).status_code
        == 422
    )


def test_a_request_needs_a_sign_in(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _, findings = setup_engagement(client)
    del client.headers["Authorization"]
    response = patch(
        client,
        expired(findings)["id"],
        status="expired",
        comment="x",
        **request_upload(),
    )
    assert response.status_code == 401
    assert count(client, UploadRequest) == 0


def test_the_reasons_list_comes_from_the_backend(tmp_path: Path) -> None:
    reasons = make_client(tmp_path).get("/upload-requests/reasons").json()
    assert [r["key"] for r in reasons] == list(REASONS)
    assert all(r["label"] for r in reasons)


# --- the dashboard and its closing rule ---


def open_items(client: TestClient) -> list[dict[str, Any]]:
    return client.get("/upload-requests/open").json()


def test_dashboard_lists_an_open_request_with_its_context(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    eid, findings = setup_engagement(client)
    patch(
        client,
        expired(findings)["id"],
        status="expired",
        comment="x",
        **request_upload("expired", send_email=True),
    )
    [item] = open_items(client)
    assert item["project_name"] == "Hamnen 4"
    assert item["subcontractor_name"] == "Exempelrör AB"
    assert item["engagement_id"] == eid
    assert item["requirement_code"] == "VVS-03"
    assert item["requirement_title"] == "Liability insurance"
    assert item["reason_label"] == REASONS["expired"]
    assert item["email_recorded"] is True


def test_dashboard_is_empty_without_requests(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _, findings = setup_engagement(client)
    patch(
        client, expired(findings)["id"], status="expired", comment="Seen, no request."
    )
    assert open_items(client) == []


def test_a_later_decision_without_a_request_closes_it(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _, findings = setup_engagement(client)
    fid = expired(findings)["id"]
    patch(client, fid, status="expired", comment="x", **request_upload())
    assert len(open_items(client)) == 1
    patch(
        client,
        fid,
        status="partial",
        reason="other",
        comment="They sent a letter by other means.",
    )
    assert open_items(client) == []


def test_re_assessing_alone_does_not_close_it(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    eid, findings = setup_engagement(client)
    patch(
        client,
        expired(findings)["id"],
        status="expired",
        comment="x",
        **request_upload(),
    )
    client.post(f"/engagements/{eid}/assess")  # new findings, no new decision
    assert len(open_items(client)) == 1


def test_a_decision_on_the_newer_finding_closes_it(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    eid, findings = setup_engagement(client)
    patch(
        client,
        expired(findings)["id"],
        status="expired",
        comment="x",
        **request_upload(),
    )
    newer = next(
        f
        for f in client.post(f"/engagements/{eid}/assess").json()
        if f["requirement_code"] == "VVS-03"
    )
    patch(
        client,
        newer["id"],
        status="expired",
        comment="Confirmed, no request this time.",
    )
    assert open_items(client) == []


def test_a_new_request_reopens_it_and_there_is_only_one_open_item(
    tmp_path: Path,
) -> None:
    client = make_client(tmp_path)
    _, findings = setup_engagement(client)
    fid = expired(findings)["id"]
    patch(client, fid, status="expired", comment="a", **request_upload())
    patch(
        client,
        fid,
        status="expired",
        comment="b",
        **request_upload("other"),
    )
    items = open_items(client)
    assert len(items) == 1 and items[0]["reason_label"] == REASONS["other"]


def test_requests_in_other_engagements_are_independent(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _, first = setup_engagement(client, name="Första AB")
    _, second = setup_engagement(client, name="Andra AB")
    patch(
        client,
        expired(first)["id"],
        status="expired",
        comment="x",
        **request_upload(),
    )
    patch(
        client,
        expired(second)["id"],
        status="expired",
        comment="x",
        **request_upload(),
    )
    patch(
        client,
        expired(second)["id"],
        status="partial",
        reason="other",
        comment="resolved",
    )
    assert [i["subcontractor_name"] for i in open_items(client)] == ["Första AB"]


def test_finding_list_shows_the_latest_request(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    eid, findings = setup_engagement(client)
    patch(
        client,
        expired(findings)["id"],
        status="expired",
        comment="x",
        **request_upload(),
    )
    listed = client.get(f"/engagements/{eid}/findings").json()
    assert (
        next(f for f in listed if f["requirement_code"] == "VVS-03")["latest_request"][
            "reason"
        ]
        == "expired"
    )
    assert (
        next(f for f in listed if f["requirement_code"] == "VVS-01")["latest_request"]
        is None
    )


# --- append-only ---


def test_upload_requests_cannot_be_changed_or_deleted(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _, findings = setup_engagement(client)
    patch(
        client,
        expired(findings)["id"],
        status="expired",
        comment="x",
        **request_upload(),
    )
    with client.app.state.session_factory() as db:
        row = db.scalars(select(UploadRequest)).one()
        row.reason = "other"
        with pytest.raises(AppendOnlyError):
            db.commit()
    with client.app.state.session_factory() as db:
        db.delete(db.scalars(select(UploadRequest)).one())
        with pytest.raises(AppendOnlyError):
            db.commit()
    assert count(client, UploadRequest) == 1


# --- contact address rule ---


@pytest.mark.parametrize(
    "address",
    [
        "a@firma.example",
        "kontakt@example.com",
        "x@sub.example.org",
        "x@bolag.test",
        "x@y.invalid",
    ],
)
def test_fictional_addresses_are_accepted(address: str) -> None:
    assert is_fictional_address(address)


@pytest.mark.parametrize(
    "address",
    [
        "a@gmail.com",
        "kontakt@bolag.se",
        "x@example.com.evil.net",
        "no-at-sign",
        "a@",
        "@b.example",
        "",
    ],
)
def test_real_or_malformed_addresses_are_refused(address: str) -> None:
    assert not is_fictional_address(address)


def test_engagement_only_accepts_a_fictional_contact(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    pid = client.post("/projects", json={"name": "P", "template_id": "vvs"}).json()[
        "id"
    ]
    bad = client.post(
        f"/projects/{pid}/engagements",
        json={"subcontractor_name": "X", "contact_email": "x@gmail.com"},
    )
    assert bad.status_code == 422 and "fictional" in bad.json()["detail"]
    ok = client.post(
        f"/projects/{pid}/engagements",
        json={"subcontractor_name": "X", "contact_email": "x@firma.example"},
    )
    assert ok.status_code == 201 and ok.json()["contact_email"] == "x@firma.example"
    blank = client.post(
        f"/projects/{pid}/engagements",
        json={"subcontractor_name": "Y", "contact_email": "  "},
    )
    assert blank.json()["contact_email"] is None


# --- the draft ---


def test_the_draft_is_neutral_and_contains_no_document_text() -> None:
    draft = build_draft(
        to="a@b.example",
        subcontractor="Exempelrör AB",
        project="Hamnen 4",
        requirement="Liability insurance",
        reason_key="expired",
        note="",
        reviewer="Test PM (demo)",
    )
    text = (draft.subject + draft.body).lower()
    for word in BANNED:
        assert word not in text, word
    assert "new document" in text
    assert "a note from" not in text  # no note, no line


@pytest.mark.parametrize("key", list(REASONS))
def test_every_reason_produces_a_draft_without_verdict_words(key: str) -> None:
    draft = build_draft(
        to="a@b.example",
        subcontractor="S",
        project="P",
        requirement="R",
        reason_key=key,
        note="Please check page 2.",
        reviewer="Rev",
    )
    assert "Please check page 2." in draft.body
    for word in BANNED:
        assert (
            word
            not in (draft.subject + draft.body + " ".join(REASONS.values())).lower()
        )


# --- upgrading an older database ---


def test_an_older_database_without_contact_email_is_upgraded(tmp_path: Path) -> None:
    path = tmp_path / "test.db"
    old = sqlite3.connect(path)
    old.execute(
        "CREATE TABLE projects (id VARCHAR(36) PRIMARY KEY, name VARCHAR(200) NOT NULL, "
        "template_id VARCHAR(100) NOT NULL, delete_after DATE, created_at DATETIME NOT NULL)"
    )
    old.execute(
        "CREATE TABLE engagements (id VARCHAR(36) PRIMARY KEY, project_id VARCHAR(36) NOT NULL, "
        "subcontractor_name VARCHAR(200) NOT NULL, org_number VARCHAR(20), created_at DATETIME NOT NULL)"
    )
    old.execute(
        "INSERT INTO projects VALUES ('p1', 'Old', 'vvs', NULL, '2026-11-10 10:00:00')"
    )
    old.execute(
        "INSERT INTO engagements VALUES ('e1', 'p1', 'Gamla AB', NULL, '2026-11-10 10:00:00')"
    )
    old.commit()
    old.close()
    client = TestClient(
        create_app(
            Settings(
                _env_file=None,
                database_url=f"sqlite:///{path}",
                uploads_dir=tmp_path / "u",
            )
        )
    )
    engagement = client.get("/engagements/e1").json()
    assert (
        engagement["subcontractor_name"] == "Gamla AB"
        and engagement["contact_email"] is None
    )
    assert client.get("/upload-requests/open").json() == []


def test_every_reason_has_its_own_plain_sentence() -> None:
    from app.upload_requests import REASON_SENTENCES

    assert set(REASON_SENTENCES) == set(REASONS)
    for key in REASONS:
        draft = build_draft(
            to="a@x.example",
            subcontractor="Exempelrör AB",
            project="Hamnen 4",
            requirement="Liability insurance",
            reason_key=key,
            note="",
            reviewer="Test PM (demo)",
        )
        assert REASON_SENTENCES[key] in draft.body
        assert "Reason:" not in draft.body  # no form-style label, the sentence says it


def test_the_request_email_reads_as_a_short_letter() -> None:
    draft = build_draft(
        to="a@x.example",
        subcontractor="Exempelrör AB",
        project="Hamnen 4",
        requirement="Liability insurance",
        reason_key="expired",
        note="",
        reviewer="Test PM (demo)",
    )
    assert draft.subject == "Please send a new document: Liability insurance (Hamnen 4)"
    lines = draft.body.splitlines()
    assert lines[0] == "Hello Exempelrör AB,"
    assert "we need a new document for \u201cLiability insurance\u201d." in draft.body
    assert lines[-2:] == ["Kind regards,", "Test PM (demo)"]


def test_a_missing_document_has_its_own_reason_and_email_sentence() -> None:
    from app.upload_requests import REASON_SENTENCES

    assert "not_uploaded" in REASONS
    draft = build_draft(
        to="a@x.example",
        subcontractor="A",
        project="P",
        requirement="R",
        reason_key="not_uploaded",
        note="",
        reviewer="Test PM (demo)",
    )
    assert REASON_SENTENCES["not_uploaded"] in draft.body
    assert "information" not in draft.body.lower()  # not the "incomplete" wording
