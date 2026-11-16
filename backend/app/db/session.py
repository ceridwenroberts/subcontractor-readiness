"""Engine and session setup. SQLite for v1; the URL comes from settings."""

from collections.abc import Iterator
from pathlib import Path
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import Engine, create_engine, event, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.db.models import Base


def make_engine(url: str) -> Engine:
    if url.startswith("sqlite:///") and not url.startswith("sqlite:///:memory:"):
        Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(url)
    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _foreign_keys_on(dbapi_connection, _record) -> None:  # type: ignore[no-untyped-def]
            dbapi_connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    _add_missing_columns(engine)
    return engine


def _add_missing_columns(engine: Engine) -> None:
    """Add columns introduced after a database file was created. Never drops or rewrites data.

    create_all only creates missing tables. Without this, a database made before
    Project.delete_after existed would fail on every project query. Only nullable columns
    can be added this way.
    """
    columns = {c["name"] for c in inspect(engine).get_columns("projects")}
    if "delete_after" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE projects ADD COLUMN delete_after DATE"))


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(engine, expire_on_commit=False)


def get_db(request: Request) -> Iterator[Session]:
    """FastAPI dependency: one session per request."""
    with request.app.state.session_factory() as session:
        yield session


Db = Annotated[Session, Depends(get_db)]
