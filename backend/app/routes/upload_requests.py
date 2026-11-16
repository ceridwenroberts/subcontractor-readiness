"""Requests for a new upload: the reasons list and the "needs a new upload" dashboard.

A request is OPEN while its decision is still the latest decision for that requirement in
that engagement. A later decision that does not ask for a new upload (on the same finding or
on a newer finding after re-assessing) closes it automatically. Re-assessing alone does not
close it, because nothing new has been uploaded or decided.
"""

from datetime import datetime

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlalchemy import select

from app.db.models import DecisionLog, Finding, UploadRequest
from app.db.session import Db
from app.upload_requests import REASONS

router = APIRouter()


class UploadRequestOut(BaseModel):
    id: str
    finding_id: str
    reason: str
    reason_label: str
    email_recorded: bool  # a SIMULATED draft was recorded; nothing was sent
    email_to: str | None
    email_subject: str | None
    email_body: str | None
    requested_by: str
    created_at: datetime


def request_out(r: UploadRequest) -> UploadRequestOut:
    return UploadRequestOut(
        id=r.id,
        finding_id=r.finding_id,
        reason=r.reason,
        reason_label=REASONS.get(r.reason, r.reason),
        email_recorded=r.email_to is not None,
        email_to=r.email_to,
        email_subject=r.email_subject,
        email_body=r.email_body,
        requested_by=r.requested_by,
        created_at=r.created_at,
    )


class ReasonOut(BaseModel):
    key: str
    label: str


class OpenRequestOut(BaseModel):
    request_id: str
    project_id: str
    project_name: str
    engagement_id: str
    subcontractor_name: str
    requirement_code: str
    requirement_title: str
    reason_label: str
    email_recorded: bool
    requested_by: str
    created_at: datetime


@router.get("/upload-requests/reasons")
def list_reasons() -> list[ReasonOut]:
    return [ReasonOut(key=k, label=v) for k, v in REASONS.items()]


@router.get("/upload-requests/open")
def list_open_requests(request: Request, db: Db) -> list[OpenRequestOut]:
    """Requests whose decision is still the latest one for their requirement."""
    rows = db.execute(
        select(DecisionLog, Finding).join(Finding, DecisionLog.finding_id == Finding.id)
    ).all()
    latest: dict[tuple[str, str], DecisionLog] = {}
    for decision, finding in rows:
        key = (finding.engagement_id, finding.requirement_code)
        current = latest.get(key)
        if current is None or (decision.decided_at, decision.id) > (
            current.decided_at,
            current.id,
        ):
            latest[key] = decision

    templates = request.app.state.templates
    items: list[OpenRequestOut] = []
    for r in db.scalars(select(UploadRequest)):
        if latest[(r.engagement_id, r.requirement_code)].id != r.decision_id:
            continue
        engagement = r.finding.engagement
        project = engagement.project
        template = templates.get(project.template_id)
        requirement = next(
            (
                x
                for x in (template.requirements if template else [])
                if x.code == r.requirement_code
            ),
            None,
        )
        items.append(
            OpenRequestOut(
                request_id=r.id,
                project_id=project.id,
                project_name=project.name,
                engagement_id=engagement.id,
                subcontractor_name=engagement.subcontractor_name,
                requirement_code=r.requirement_code,
                requirement_title=requirement.title
                if requirement
                else r.requirement_code,
                reason_label=REASONS.get(r.reason, r.reason),
                email_recorded=r.email_to is not None,
                requested_by=r.requested_by,
                created_at=r.created_at,
            )
        )
    return sorted(items, key=lambda i: i.created_at, reverse=True)
