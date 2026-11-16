import sqlite3
from datetime import date, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.db.models import Project
from app.main import create_app
from app.retention import SUGGESTED_DAYS, retention_advice


def make_client(tmp_path: Path) -> TestClient:
    settings = Settings(
        _env_file=None,
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        uploads_dir=tmp_path / "uploads",
    )
    return TestClient(create_app(settings))


def test_advice_is_a_labeled_placeholder_with_a_suggested_date() -> None:
    today = date(2026, 11, 16)
    advice = retention_advice(today)
    assert advice.placeholder is True
    assert advice.reviewed_by is None
    assert advice.suggested_date == today + timedelta(days=SUGGESTED_DAYS)
    text = " ".join([advice.summary, *advice.basis, *advice.caveats]).lower()
    assert "not legal advice" in text
    assert "article 5(1)(e)" in text
    assert "does not delete anything" in text


def test_retention_endpoint(tmp_path: Path) -> None:
    body = make_client(tmp_path).get("/retention").json()
    assert body["placeholder"] is True
    assert body["suggested_date"] > date.today().isoformat()


def test_project_stores_the_deletion_date(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    when = (date.today() + timedelta(days=30)).isoformat()
    created = client.post(
        "/projects", json={"name": "Demo", "template_id": "vvs", "delete_after": when}
    ).json()
    assert created["delete_after"] == when
    assert created["delete_overdue"] is False
    assert client.get(f"/projects/{created['id']}").json()["delete_after"] == when
    assert client.get("/projects").json()[0]["delete_after"] == when


def test_deletion_date_is_optional(tmp_path: Path) -> None:
    created = make_client(tmp_path).post(
        "/projects", json={"name": "D", "template_id": "vvs"}
    )
    assert created.status_code == 201
    assert created.json()["delete_after"] is None
    assert created.json()["delete_overdue"] is False


def test_today_is_allowed_but_a_past_date_is_refused_with_a_clear_message(
    tmp_path: Path,
) -> None:
    client = make_client(tmp_path)
    today = date.today().isoformat()
    ok = client.post(
        "/projects", json={"name": "D", "template_id": "vvs", "delete_after": today}
    )
    assert ok.status_code == 201
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    bad = client.post(
        "/projects", json={"name": "D", "template_id": "vvs", "delete_after": yesterday}
    )
    assert bad.status_code == 400
    assert "today or later" in bad.json()["detail"]
    assert (
        client.post(
            "/projects",
            json={"name": "D", "template_id": "vvs", "delete_after": "soon"},
        ).status_code
        == 422
    )


def test_overdue_is_reported_once_the_date_has_passed(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    pid = client.post("/projects", json={"name": "D", "template_id": "vvs"}).json()[
        "id"
    ]
    with client.app.state.session_factory() as db:
        db.get(Project, pid).delete_after = date.today() - timedelta(days=1)
        db.commit()
    assert client.get(f"/projects/{pid}").json()["delete_overdue"] is True
    assert client.get("/projects").json()[0]["delete_overdue"] is True


def test_an_older_database_without_the_column_is_upgraded_without_losing_data(
    tmp_path: Path,
) -> None:
    path = tmp_path / "test.db"
    old = sqlite3.connect(path)
    old.execute(
        "CREATE TABLE projects (id VARCHAR(36) PRIMARY KEY, name VARCHAR(200) NOT NULL, "
        "template_id VARCHAR(100) NOT NULL, created_at DATETIME NOT NULL)"
    )
    old.execute(
        "INSERT INTO projects VALUES ('p-old', 'Old project', 'vvs', '2026-11-10 10:00:00')"
    )
    old.commit()
    old.close()

    client = make_client(tmp_path)  # opens the old file
    project = client.get("/projects/p-old").json()
    assert project["name"] == "Old project"
    assert project["delete_after"] is None
    assert client.get("/projects").status_code == 200
    # a second start must not fail or repeat the change
    assert make_client(tmp_path).get("/projects/p-old").status_code == 200
