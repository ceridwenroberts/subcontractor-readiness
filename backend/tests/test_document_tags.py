import json
import re
import sqlite3
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.assess import DocumentText, assess_with_tags, documents_for, no_document_result
from app.config import PROJECT_ROOT, Settings
from app.main import create_app
from app.models import NO_MODEL_LABEL
from app.providers.base import ProviderError
from app.templates import Requirement

PACKET_3 = PROJECT_ROOT / "evals" / "packets" / "03_expired_and_personnummer"
REQ = Requirement(
    code="VVS-01",
    title="Tax",
    description="d",
    mandatory=True,
    expires=False,
    evidenceHints=["f-skatt"],
)


def doc(id: str, codes: list[str] | None = None) -> DocumentText:
    return DocumentText(id=id, pages=["text"], requirement_codes=codes)


# --- which documents a requirement is checked against ---


def test_a_requirement_reads_documents_tagged_for_it_and_untagged_ones() -> None:
    docs = [doc("a", ["VVS-01"]), doc("b", ["VVS-03"]), doc("c"), doc("d", [])]
    assert [d.id for d in documents_for("VVS-01", docs)] == ["a", "c", "d"]
    assert [d.id for d in documents_for("VVS-03", docs)] == ["b", "c", "d"]
    assert [d.id for d in documents_for("VVS-02", docs)] == ["c", "d"]


def test_a_document_with_several_tags_is_read_for_each_of_them() -> None:
    docs = [doc("a", ["VVS-01", "VVS-03"])]
    assert documents_for("VVS-01", docs) and documents_for("VVS-03", docs)
    assert documents_for("VVS-02", docs) == []


class NeverCalled:
    name = "scripted"
    label = "Simulated"
    model = "fixture"

    def complete_json(
        self, system: str, user: str, schema: dict[str, Any]
    ) -> dict[str, Any]:
        raise AssertionError(
            "the provider must not be called for a requirement with no document"
        )


def test_a_requirement_with_no_document_is_not_sent_to_a_model() -> None:
    result = assess_with_tags(NeverCalled(), REQ, [doc("a", ["VVS-03"])])
    assert result == no_document_result(REQ)
    assert result.ai_status == "missing" and result.evidence == []
    assert result.provider_label == NO_MODEL_LABEL
    assert "No document was uploaded" in result.notes[0]


def test_the_result_with_no_document_never_uses_a_verdict_word() -> None:
    text = " ".join(no_document_result(REQ).notes).lower()
    for word in ["approved", "compliant", "qualified", "pass", "fail", "score"]:
        assert not re.search(rf"\b{word}\b", text)


# --- routes ---


class CountingProvider:
    """Wraps the scripted provider and remembers which requirement and documents each call saw."""

    def __init__(self, inner: Any) -> None:
        self.inner = inner
        self.name, self.label, self.model = inner.name, inner.label, inner.model
        self.calls: list[tuple[str, list[str]]] = []

    def complete_json(
        self, system: str, user: str, schema: dict[str, Any]
    ) -> dict[str, Any]:
        code = re.search(r"^REQUIREMENT_CODE: (\S+)$", user, re.MULTILINE)
        ids = re.findall(r'<<BEGIN-\w+ document="([^"]+)">>', user)
        if ids:  # assessor calls carry documents, verifier calls carry quotes
            self.calls.append((code.group(1) if code else "?", ids))
        return self.inner.complete_json(system, user, schema)


def make_client(tmp_path: Path) -> TestClient:
    s = Settings(
        _env_file=None,
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        uploads_dir=tmp_path / "uploads",
    )
    return TestClient(create_app(s))


def new_engagement(client: TestClient) -> str:
    p = client.post("/projects", json={"name": "Demo", "template_id": "vvs"}).json()
    e = client.post(
        f"/projects/{p['id']}/engagements", json={"subcontractor_name": "Exempelrör AB"}
    ).json()
    return e["id"]


def upload(
    client: TestClient,
    eid: str,
    names: list[str],
    tags: list[list[str] | None] | None = None,
) -> Any:
    files = [
        ("files", (n, (PACKET_3 / n).read_bytes(), "application/pdf")) for n in names
    ]
    data = {"tags": json.dumps(tags)} if tags is not None else None
    return client.post(f"/engagements/{eid}/documents", files=files, data=data)


def test_upload_stores_the_tags_and_lists_them(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    eid = new_engagement(client)
    r = upload(
        client,
        eid,
        ["f-skatt.pdf", "forsakring.pdf"],
        [["VVS-01"], ["VVS-03", "VVS-03"]],
    )
    assert r.status_code == 201
    docs = client.get(f"/engagements/{eid}/documents").json()
    assert [d["requirement_codes"] for d in docs] == [["VVS-01"], ["VVS-03"]]


def test_upload_without_tags_means_untagged(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    eid = new_engagement(client)
    upload(client, eid, ["f-skatt.pdf"])
    upload(client, eid, ["forsakring.pdf"], [None])
    docs = client.get(f"/engagements/{eid}/documents").json()
    assert [d["requirement_codes"] for d in docs] == [[], []]


@pytest.mark.parametrize(
    "tags",
    [[["VVS-99"]], [["VVS-01"], ["VVS-01"]], "not json", {"a": 1}, [[1]]],
)
def test_bad_tags_are_refused_and_nothing_is_saved(tmp_path: Path, tags: Any) -> None:
    client = make_client(tmp_path)
    eid = new_engagement(client)
    files = [
        (
            "files",
            ("f-skatt.pdf", (PACKET_3 / "f-skatt.pdf").read_bytes(), "application/pdf"),
        )
    ]
    data = {"tags": tags if isinstance(tags, str) else json.dumps(tags)}
    r = client.post(f"/engagements/{eid}/documents", files=files, data=data)
    assert r.status_code == 422
    assert client.get(f"/engagements/{eid}/documents").json() == []


def test_tags_can_be_changed_and_cleared(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    eid = new_engagement(client)
    upload(client, eid, ["f-skatt.pdf"])
    did = client.get(f"/engagements/{eid}/documents").json()[0]["id"]
    r = client.patch(
        f"/documents/{did}", json={"requirement_codes": ["VVS-02", "VVS-01"]}
    )
    assert r.status_code == 200 and r.json()["requirement_codes"] == [
        "VVS-02",
        "VVS-01",
    ]
    r = client.patch(f"/documents/{did}", json={"requirement_codes": []})
    assert r.json()["requirement_codes"] == []
    assert (
        client.patch(f"/documents/{did}", json={"requirement_codes": ["X"]}).status_code
        == 422
    )
    assert (
        client.patch("/documents/nope", json={"requirement_codes": []}).status_code
        == 404
    )
    assert (
        client.patch(
            f"/documents/{did}", json={"requirement_codes": [], "x": 1}
        ).status_code
        == 422
    )


def test_two_tagged_documents_check_two_requirements_and_skip_the_other_five(
    tmp_path: Path,
) -> None:
    client = make_client(tmp_path)
    counting = CountingProvider(client.app.state.provider)
    client.app.state.provider = counting
    eid = new_engagement(client)
    upload(client, eid, ["f-skatt.pdf", "forsakring.pdf"], [["VVS-01"], ["VVS-03"]])
    ids = {
        d["filename"]: d["id"]
        for d in client.get(f"/engagements/{eid}/documents").json()
    }

    r = client.post(f"/engagements/{eid}/assess")
    assert r.status_code == 201
    findings = {f["requirement_code"]: f for f in r.json()}
    assert len(findings) == 7
    skipped = [f for f in findings.values() if f["provider"] == "none"]
    assert len(skipped) == 5
    assert all(
        f["ai_status"] == "missing" and f["provider_label"] == NO_MODEL_LABEL
        for f in skipped
    )
    # The model only ever saw the requirements that have a document, and only that document.
    seen = {code: docs for code, docs in counting.calls}
    assert set(seen) == {"VVS-01", "VVS-03"}
    assert seen["VVS-01"] == [ids["f-skatt.pdf"]]
    assert seen["VVS-03"] == [ids["forsakring.pdf"]]
    assert findings["VVS-01"]["provider"] == "scripted"


def test_untagged_documents_behave_as_before(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    counting = CountingProvider(client.app.state.provider)
    client.app.state.provider = counting
    eid = new_engagement(client)
    upload(client, eid, ["f-skatt.pdf", "forsakring.pdf"])
    r = client.post(f"/engagements/{eid}/assess")
    assert {f["provider"] for f in r.json()} == {"scripted"}
    assert len({code for code, _ in counting.calls}) == 7
    assert all(len(ids) == 2 for _, ids in counting.calls)


def test_the_stream_reports_every_requirement_and_skips_the_model_for_empty_ones(
    tmp_path: Path,
) -> None:
    client = make_client(tmp_path)
    counting = CountingProvider(client.app.state.provider)
    client.app.state.provider = counting
    eid = new_engagement(client)
    upload(client, eid, ["f-skatt.pdf"], [["VVS-01"]])
    r = client.post(f"/engagements/{eid}/assess/stream")
    events = [json.loads(line) for line in r.text.splitlines() if line.strip()]
    assert [e["type"] for e in events].count("working") == 7
    assert events[-1]["type"] == "done"
    assert {c for c, _ in counting.calls} == {"VVS-01"}
    assert sum(f["provider"] == "none" for f in events[-1]["findings"]) == 6


def test_a_provider_error_still_saves_nothing(tmp_path: Path) -> None:
    class Down(NeverCalled):
        def complete_json(
            self, system: str, user: str, schema: dict[str, Any]
        ) -> dict[str, Any]:
            raise ProviderError("down")

    client = make_client(tmp_path)
    client.app.state.provider = Down()
    eid = new_engagement(client)
    upload(client, eid, ["f-skatt.pdf"], [["VVS-01"]])
    assert client.post(f"/engagements/{eid}/assess").status_code == 503
    assert client.get(f"/engagements/{eid}/findings").json() == []


def test_the_summary_names_the_model_not_the_skipped_requirements(
    tmp_path: Path,
) -> None:
    client = make_client(tmp_path)
    eid = new_engagement(client)
    upload(
        client, eid, ["f-skatt.pdf"], [["VVS-07"]]
    )  # the last requirement: others come first
    client.post(f"/engagements/{eid}/assess")
    assert (
        client.get(f"/engagements/{eid}/summary").json()["assessed_by"]
        == "Simulated (fixture)"
    )


def test_an_older_database_without_the_tags_column_is_upgraded_and_keeps_its_documents(
    tmp_path: Path,
) -> None:
    client = make_client(tmp_path)
    eid = new_engagement(client)
    upload(client, eid, ["f-skatt.pdf"])
    client.close()
    db = sqlite3.connect(tmp_path / "test.db")
    db.execute("ALTER TABLE documents DROP COLUMN requirement_codes")
    db.commit()
    db.close()

    again = make_client(tmp_path)  # opens the older file
    docs = again.get(f"/engagements/{eid}/documents").json()
    assert docs[0]["filename"] == "f-skatt.pdf" and docs[0]["requirement_codes"] == []
    assert make_client(tmp_path).get(f"/engagements/{eid}/documents").status_code == 200
