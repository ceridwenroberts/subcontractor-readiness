import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.main import create_app


def make_client(tmp_path) -> TestClient:
    settings = Settings(
        _env_file=None,
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        uploads_dir=tmp_path / "uploads",
    )
    return TestClient(create_app(settings))


def test_the_production_default_allows_only_the_local_names() -> None:
    # The tests add "testserver" through conftest.py; the shipped default must not.
    assert Settings.model_fields["allowed_hosts"].default == ["localhost", "127.0.0.1"]


@pytest.mark.parametrize(
    "host", ["localhost", "localhost:8000", "127.0.0.1", "127.0.0.1:8000"]
)
def test_local_host_names_are_answered(tmp_path, host: str) -> None:
    assert (
        make_client(tmp_path).get("/health", headers={"Host": host}).status_code == 200
    )


@pytest.mark.parametrize(
    "host",
    [
        "evil.example",
        "evil.example:8000",
        "localhost.evil.example",
        "127.0.0.1.evil.example",
        "10.0.0.5",
    ],
)
def test_other_host_names_are_refused(tmp_path, host: str) -> None:
    response = make_client(tmp_path).get("/health", headers={"Host": host})
    assert response.status_code == 400


def test_a_rebound_domain_cannot_reach_documents_or_get_a_token(tmp_path) -> None:
    client = make_client(tmp_path)
    rebound = {"Host": "evil.example:8000"}
    assert client.get("/projects", headers=rebound).status_code == 400
    assert client.get("/documents/anything/file", headers=rebound).status_code == 400
    assert client.get("/documents/anything/pages", headers=rebound).status_code == 400
    signed = client.post("/session", json={"user_id": "demo-pm"}, headers=rebound)
    assert signed.status_code == 400
    assert client.app.state.sessions == {}  # no token was issued


def test_a_refused_host_gets_no_cors_headers(tmp_path) -> None:
    response = make_client(tmp_path).options(
        "/projects",
        headers={
            "Host": "evil.example",
            "Origin": "http://evil.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.parametrize("bad", [["*"], ["*.example.com"], [], [""]])
def test_wildcard_or_empty_allow_lists_are_rejected(bad: list[str]) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, allowed_hosts=bad)
