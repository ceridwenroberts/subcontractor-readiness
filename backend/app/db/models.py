"""Database tables (PLAN.md section 7).

Only redacted text is stored here (Document.pages_json). The three finding
statuses are separate columns and are never copied into each other. DecisionLog
is append-only: the guard at the bottom refuses any update or delete.
"""

import uuid
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, String, Text, event
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship


def new_id() -> str:
    return str(uuid.uuid4())


def now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))
    template_id: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    engagements: Mapped[list["Engagement"]] = relationship(back_populates="project")


class Engagement(Base):
    __tablename__ = "engagements"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    subcontractor_name: Mapped[str] = mapped_column(String(200))
    org_number: Mapped[str | None] = mapped_column(
        String(20), default=None
    )  # fictional only
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    project: Mapped[Project] = relationship(back_populates="engagements")
    documents: Mapped[list["Document"]] = relationship(back_populates="engagement")
    findings: Mapped[list["Finding"]] = relationship(back_populates="engagement")


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id"), index=True)
    original_filename: Mapped[str] = mapped_column(String(200))  # display only
    stored_name: Mapped[str] = mapped_column(
        String(60)
    )  # UUID name under data/uploads/
    sha256: Mapped[str] = mapped_column(String(64))
    page_count: Mapped[int] = mapped_column(Integer)
    pages_json: Mapped[list[str]] = mapped_column(JSON)  # redacted text per page
    redaction_count: Mapped[int] = mapped_column(Integer, default=0)
    # [{page, kind, count}]: what a person should check in the original. Never the number.
    redaction_notes_json: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    engagement: Mapped[Engagement] = relationship(back_populates="documents")


class Finding(Base):
    __tablename__ = "findings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id"), index=True)
    requirement_code: Mapped[str] = mapped_column(String(50))
    model_status: Mapped[str] = mapped_column(String(20))  # what the LLM said
    ai_status: Mapped[str] = mapped_column(String(20))  # after code checks
    human_status: Mapped[str | None] = mapped_column(
        String(20), default=None
    )  # PM decision
    evidence_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    valid_until: Mapped[date | None] = mapped_column(Date, default=None)
    notes: Mapped[str] = mapped_column(Text, default="")
    provider: Mapped[str] = mapped_column(String(50))
    provider_label: Mapped[str] = mapped_column(String(50))
    model: Mapped[str] = mapped_column(String(100))
    prompt_version: Mapped[str] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    engagement: Mapped[Engagement] = relationship(back_populates="findings")


class DecisionLog(Base):
    """Append-only. Never updated or deleted."""

    __tablename__ = "decision_log"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    finding_id: Mapped[str] = mapped_column(ForeignKey("findings.id"), index=True)
    old_human_status: Mapped[str | None] = mapped_column(String(20), default=None)
    new_human_status: Mapped[str] = mapped_column(String(20))
    comment: Mapped[str] = mapped_column(Text)
    decided_by: Mapped[str] = mapped_column(String(100))  # free text until login exists
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AppendOnlyError(Exception):
    """Something tried to change or delete a DecisionLog row."""


@event.listens_for(Session, "before_flush")
def _decision_log_is_append_only(
    session: Session, flush_context: object, instances: object
) -> None:
    for obj in (*session.dirty, *session.deleted):
        if isinstance(obj, DecisionLog) and (
            obj in session.deleted or session.is_modified(obj)
        ):
            raise AppendOnlyError("DecisionLog rows are never updated or deleted.")
