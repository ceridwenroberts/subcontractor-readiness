from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

FRONTEND = "http://localhost:3000"


def make_client() -> TestClient:
    # Explicit settings so the tests do not depend on a developer's .env file.
    return TestClient(create_app(Settings(frontend_origin=FRONTEND)))


def test_health_returns_ok() -> None:
    response = make_client().get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_cors_allows_frontend_origin() -> None:
    response = make_client().get("/health", headers={"Origin": FRONTEND})
    assert response.headers.get("access-control-allow-origin") == FRONTEND


def test_cors_rejects_other_origin() -> None:
    response = make_client().get("/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in response.headers


def test_cors_preflight_rejects_other_origin() -> None:
    response = make_client().options(
        "/health",
        headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code == 400
