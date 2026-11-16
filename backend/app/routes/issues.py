"""Issues for the home page: documents whose date is close to running out, or has.

Read-only. Computed from the stored findings and today's date, with no model call and no
new data. For each engagement and requirement only the latest finding counts. A date is
compared with today, not with the status stored at assessment time, because a document that
was fine when it was assessed can run out later.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select

from app.db.models import DecisionLog, Finding, UploadRequest
from app.db.session import Db
from app.domain.status import Status
from app.expiry import ReminderDraft, Tier, build_reminder, days_left, tier_for

router = APIRouter()


def get_today() -> date:
    """The current date. A dependency so tests can set it."""
    return date.today()


class ExpiringItem(BaseModel):
    finding_id: str
    project_id: str
    project_name: str
    engagement_id: str
    subcontractor_name: str
    requirement_code: str
    requirement_title: str
    valid_until: date
    days_left: int  # negative once the date has ended
    tier: Tier
    status: Status  # the person's decision if there is one, else the checked result
    new_upload_requested: bool  # an open request for a new upload already exists
    reminder: ReminderDraft | None  # SIMULATED draft, only with a contact address


# Statuses that can carry a meaningful date. "missing" and "unclear" have no reliable one.
_DATED = ("found", "partial", "expired")


@router.get("/issues/expiring")
def list_expiring(
    request: Request, db: Db, today: Annotated[date, Depends(get_today)]
) -> list[ExpiringItem]:
    settings = request.app.state.settings
    templates = request.app.state.templates

    latest: dict[tuple[str, str], Finding] = {}
    for f in db.scalars(select(Finding).order_by(Finding.created_at, Finding.id)):
        latest[(f.engagement_id, f.requirement_code)] = f

    decisions: dict[tuple[str, str], DecisionLog] = {}
    for d, f in db.execute(
        select(DecisionLog, Finding).join(Finding, DecisionLog.finding_id == Finding.id)
    ):
        key = (f.engagement_id, f.requirement_code)
        cur = decisions.get(key)
        if cur is None or (d.decided_at, d.id) > (cur.decided_at, cur.id):
            decisions[key] = d
    open_requests = {
        (r.engagement_id, r.requirement_code)
        for r in db.scalars(select(UploadRequest))
        if (r.engagement_id, r.requirement_code) in decisions
        and decisions[(r.engagement_id, r.requirement_code)].id == r.decision_id
    }

    items: list[ExpiringItem] = []
    for key, f in latest.items():
        status = f.human_status or f.ai_status
        if f.valid_until is None or status not in _DATED:
            continue
        days = days_left(f.valid_until, today)
        tier = tier_for(
            days,
            urgent=settings.expiry_urgent_days,
            soon=settings.expiry_soon_days,
            upcoming=settings.expiry_upcoming_days,
        )
        if tier is None:
            continue
        engagement = f.engagement
        project = engagement.project
        template = templates.get(project.template_id)
        requirement = next(
            (
                r
                for r in (template.requirements if template else [])
                if r.code == f.requirement_code
            ),
            None,
        )
        title = requirement.title if requirement else f.requirement_code
        reminder = (
            build_reminder(
                to=engagement.contact_email,
                subcontractor=engagement.subcontractor_name,
                project=project.name,
                requirement=title,
                valid_until=f.valid_until,
                days=days,
            )
            if engagement.contact_email
            else None
        )
        items.append(
            ExpiringItem(
                finding_id=f.id,
                project_id=project.id,
                project_name=project.name,
                engagement_id=engagement.id,
                subcontractor_name=engagement.subcontractor_name,
                requirement_code=f.requirement_code,
                requirement_title=title,
                valid_until=f.valid_until,
                days_left=days,
                tier=tier,
                status=status,  # type: ignore[arg-type]
                new_upload_requested=key in open_requests,
                reminder=reminder,
            )
        )
    return sorted(
        items, key=lambda i: (i.valid_until, i.subcontractor_name, i.requirement_code)
    )
