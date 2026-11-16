from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.config import PROJECT_ROOT, Settings
from app.main import create_app

PACKET = PROJECT_ROOT / "evals" / "packets" / "01_complete"


def make_client(tmp_path: Path) -> TestClient:
    settings = Settings(
        _env_file=None,
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        uploads_dir=tmp_path / "uploads",
    )
    return TestClient(create_app(settings))


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def sign_in(client: TestClient, user_id: str = "demo-pm") -> str:
    return client.post("/session", json={"user_id": user_id}).json()["token"]


def a_finding(client: TestClient) -> str:
    pid = client.post("/projects", json={"name": "D", "template_id": "vvs"}).json()[
        "id"
    ]
    eid = client.post(
        f"/projects/{pid}/engagements", json={"subcontractor_name": "X"}
    ).json()["id"]
    files = [
        ("files", (p.name, p.read_bytes(), "application/pdf"))
        for p in PACKET.glob("*.pdf")
    ]
    client.post(f"/engagements/{eid}/documents", files=files)
    return client.post(f"/engagements/{eid}/assess").json()[0]["id"]


def decide(
    client: TestClient, fid: str, headers: dict[str, str] | None = None, **extra: Any
):
    body = {
        "status": "found",
        "reason": "other",
        "comment": "Seen on page 1.",
        **extra,
    }
    return client.patch(f"/findings/{fid}", json=body, headers=headers)


def test_demo_users_are_listed_and_clearly_fictional(tmp_path: Path) -> None:
    users = make_client(tmp_path).get("/session/users").json()
    assert [u["id"] for u in users] == ["demo-pm", "demo-reviewer"]
    assert all("(demo)" in u["name"] for u in users)


def test_sign_in_gives_a_token_and_me_returns_the_user(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    result = client.post("/session", json={"user_id": "demo-reviewer"}).json()
    assert result["user"]["name"] == "Test Reviewer (demo)"
    assert len(result["token"]) >= 32
    me = client.get("/session/me", headers=bearer(result["token"]))
    assert me.status_code == 200 and me.json()["id"] == "demo-reviewer"


def test_unknown_user_cannot_sign_in(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    assert client.post("/session", json={"user_id": "admin"}).status_code == 404
    assert (
        client.post("/session", json={"user_id": "demo-pm", "x": 1}).status_code == 422
    )


def test_each_sign_in_gets_its_own_token(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    assert sign_in(client) != sign_in(client)


def test_me_needs_a_valid_token(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    assert client.get("/session/me").status_code == 401
    assert client.get("/session/me", headers=bearer("made-up")).status_code == 401
    assert (
        client.get("/session/me", headers={"Authorization": "Basic abc"}).status_code
        == 401
    )


def test_sign_out_ends_the_session(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    token = sign_in(client)
    assert client.delete("/session", headers=bearer(token)).status_code == 204
    assert client.get("/session/me", headers=bearer(token)).status_code == 401
    assert client.delete("/session").status_code == 204  # signing out twice is harmless


def test_a_decision_without_sign_in_is_refused_and_nothing_is_logged(
    tmp_path: Path,
) -> None:
    client = make_client(tmp_path)
    fid = a_finding(client)
    response = decide(client, fid)
    assert response.status_code == 401
    assert "Sign in" in response.json()["detail"]
    assert client.get(f"/findings/{fid}/decisions").json() == []


def test_a_decision_with_a_bad_token_is_refused(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    fid = a_finding(client)
    assert decide(client, fid, headers=bearer("made-up")).status_code == 401


def test_the_log_records_the_name_the_server_knows(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    fid = a_finding(client)
    assert (
        decide(
            client, fid, headers=bearer(sign_in(client, "demo-reviewer"))
        ).status_code
        == 200
    )
    log = client.get(f"/findings/{fid}/decisions").json()
    assert [d["decided_by"] for d in log] == ["Test Reviewer (demo)"]


def test_a_client_cannot_choose_the_name(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    fid = a_finding(client)
    headers = bearer(sign_in(client))
    assert (
        decide(client, fid, headers=headers, decided_by="The Boss").status_code == 422
    )
    assert client.get(f"/findings/{fid}/decisions").json() == []


def test_two_users_are_recorded_separately(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    fid = a_finding(client)
    decide(client, fid, headers=bearer(sign_in(client, "demo-pm")))
    decide(
        client, fid, headers=bearer(sign_in(client, "demo-reviewer")), status="partial"
    )
    names = [d["decided_by"] for d in client.get(f"/findings/{fid}/decisions").json()]
    assert names == ["Test PM (demo)", "Test Reviewer (demo)"]


def test_authorization_header_is_allowed_by_cors_for_the_frontend_only(
    tmp_path: Path,
) -> None:
    client = make_client(tmp_path)
    ok = client.options(
        "/findings/x",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert "authorization" in ok.headers.get("access-control-allow-headers", "").lower()
    bad = client.options(
        "/findings/x",
        headers={
            "Origin": "http://evil.example",
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert "access-control-allow-origin" not in bad.headers
