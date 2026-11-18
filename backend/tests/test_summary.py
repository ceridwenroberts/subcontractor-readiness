import re
from itertools import product
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import PROJECT_ROOT, Settings
from app.main import create_app
from app.summary import (
    DISCLAIMER,
    STATUS_LABEL,
    STATUS_ORDER,
    FindingView,
    build_summary,
)

PACKET_3 = PROJECT_ROOT / "evals" / "packets" / "03_expired_and_personnummer"
BANNED = ["approved", "compliant", "qualified", "pass", "fail", "score"]


def view(code: str, ai: str, human: str | None = None, **extra) -> FindingView:
    return FindingView(
        code=code,
        title=f"Title {code}",
        ai_status=ai,
        human_status=human,
        valid_until=None,
        open_request_reason=None,
        provider_label="Simulated",
        model="fixture",
        **extra,
    )


def build(findings: list[FindingView], docs: int = 3, placeholder: bool = True):
    return build_summary(
        subcontractor="Exempelrör AB",
        project="Hamnen 4",
        template_name="VVS",
        placeholder=placeholder,
        document_count=docs,
        findings=findings,
    )


def all_text(summary) -> str:
    parts = [
        summary.title,
        summary.intro,
        summary.not_reviewed_text,
        summary.assessed_by,
        summary.disclaimer,
    ]
    for g in summary.groups:
        parts.append(g.label)
        parts += [f"{i.code} {i.title} {i.note}" for i in g.items]
    return " ".join(parts)


def test_groups_follow_the_status_order_and_use_the_agreed_wording() -> None:
    s = build(
        [
            view("A", "missing"),
            view("B", "found"),
            view("C", "expired"),
            view("D", "unclear"),
        ]
    )
    assert [g.status for g in s.groups] == ["found", "expired", "unclear", "missing"]
    assert [g.label for g in s.groups] == [
        STATUS_LABEL[x] for x in ["found", "expired", "unclear", "missing"]
    ]


def test_a_persons_decision_is_used_and_marked() -> None:
    s = build([view("A", "expired", human="partial"), view("B", "found")])
    partial = next(g for g in s.groups if g.status == "partial")
    assert partial.items[0].code == "A" and partial.items[0].reviewed_by_person is True
    found = next(g for g in s.groups if g.status == "found")
    assert found.items[0].reviewed_by_person is False
    assert s.not_reviewed_count == 1
    assert "1 requirement not yet reviewed" in s.not_reviewed_text


def test_everything_reviewed_and_nothing_assessed() -> None:
    assert (
        "every requirement"
        in build([view("A", "found", human="found")]).not_reviewed_text
    )
    empty = build([])
    assert (
        empty.groups == [] and "No assessment has been run" in empty.not_reviewed_text
    )
    assert empty.assessed_by == "Not assessed"


def test_intro_counts_and_placeholder_note() -> None:
    assert (
        "1 uploaded document and 1 requirement"
        in build([view("A", "found")], docs=1).intro
    )
    assert "placeholder" in build([view("A", "found")], placeholder=True).intro
    assert "placeholder" not in build([view("A", "found")], placeholder=False).intro


def test_notes_carry_the_date_and_the_open_request() -> None:
    f = view("A", "expired")
    f = f.model_copy(
        update={
            "valid_until": "2025-06-30",
            "open_request_reason": "The document has expired",
        }
    )
    note = build([f]).groups[0].items[0].note
    assert "2025-06-30" in note and "new upload was requested" in note


def test_the_disclaimer_is_the_agreed_sentence() -> None:
    assert build([]).disclaimer == DISCLAIMER
    assert "not an approval" in DISCLAIMER


def test_no_verdict_words_or_scores_for_any_combination_of_statuses() -> None:
    statuses = STATUS_ORDER
    for ai, human in product(statuses, [None, *statuses]):
        text = all_text(build([view("VVS-01", ai, human)])).lower()
        for word in BANNED:
            # the disclaimer itself says "not an approval"; the word "approved" never appears
            assert not re.search(rf"\b{word}\b", text), (ai, human, word)
        assert "%" not in text and "out of" not in text


# --- the endpoint ---


def make_client(tmp_path: Path) -> TestClient:
    settings = Settings(
        _env_file=None,
        database_url=f"sqlite:///{tmp_path / 't.db'}",
        uploads_dir=tmp_path / "up",
    )
    client = TestClient(create_app(settings))
    token = client.post("/session", json={"user_id": "demo-pm"}).json()["token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client


def test_endpoint_summarises_stored_findings_and_decisions(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    pid = client.post(
        "/projects", json={"name": "Hamnen 4", "template_id": "vvs"}
    ).json()["id"]
    eid = client.post(
        f"/projects/{pid}/engagements", json={"subcontractor_name": "Exempelrör AB"}
    ).json()["id"]
    assert client.get(f"/engagements/{eid}/summary").json()["groups"] == []
    files = [
        ("files", (p.name, p.read_bytes(), "application/pdf"))
        for p in sorted(PACKET_3.glob("*.pdf"))
    ]
    client.post(f"/engagements/{eid}/documents", files=files)
    findings = client.post(f"/engagements/{eid}/assess").json()
    expired = next(f for f in findings if f["ai_status"] == "expired")
    client.patch(
        f"/findings/{expired['id']}",
        json={
            "status": "expired",
            "comment": "Renewal needed.",
            "reason": "expired",
            "request_upload": {},
        },
    )
    s = client.get(f"/engagements/{eid}/summary").json()
    assert s["title"] == "Documentation summary: Exempelrör AB on Hamnen 4"
    assert s["disclaimer"] == DISCLAIMER
    assert s["assessed_by"] == "Simulated (fixture)"
    by_status = {g["status"]: g for g in s["groups"]}
    assert len(by_status["found"]["items"]) == 6
    item = by_status["expired"]["items"][0]
    assert item["code"] == "VVS-03" and item["reviewed_by_person"] is True
    assert "new upload was requested" in item["note"]
    assert "6 requirements not yet reviewed" in s["not_reviewed_text"]
    assert "placeholder" in s["intro"] and "5 uploaded documents" in s["intro"]


def test_endpoint_404_for_an_unknown_engagement(tmp_path: Path) -> None:
    assert make_client(tmp_path).get("/engagements/nope/summary").status_code == 404


def test_a_requirement_with_no_document_is_listed_on_its_own() -> None:
    from app.summary import FindingView, build_summary

    def view(code: str, **kw: object) -> FindingView:
        base: dict[str, object] = {
            "code": code,
            "title": code,
            "ai_status": "found",
            "human_status": None,
            "valid_until": None,
            "open_request_reason": None,
            "provider_label": "Simulated",
            "model": "fixture",
        }
        return FindingView(**{**base, **kw})  # type: ignore[arg-type]

    summary = build_summary(
        subcontractor="A",
        project="P",
        template_name="T",
        placeholder=False,
        document_count=1,
        findings=[
            view("R1"),
            view(
                "R2",
                ai_status="missing",
                provider_label="No model call",
                model="none",
                no_document=True,
            ),
        ],
    )
    labels = {g.status: [i.code for i in g.items] for g in summary.groups}
    assert labels == {"found": ["R1"], "no_document": ["R2"]}
    assert "missing" not in labels  # not shown as "Evidence not found"
    assert summary.not_reviewed_count == 1  # the one with a document
    assert summary.assessed_by == "Simulated (fixture)"
