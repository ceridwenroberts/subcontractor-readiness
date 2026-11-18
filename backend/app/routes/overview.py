"""Overview of a project: for every subcontractor, what each requirement shows right now.

Read-only. Built from the stored findings, decisions and upload requests plus today's date,
with no model call and no new data. For each engagement and requirement only the latest
finding counts. See `app/overview.py` for what the glance states mean (and do not mean).
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select

from app.db.models import DecisionLog, Finding, Project, UploadRequest
from app.db.session import Db
from app.domain.status import Status
from app.overview import Glance, ReqState, count_statuses, effective_status, glance_for
from app.routes.issues import get_today

router = APIRouter()


class RequirementCell(BaseModel):
    code: str
    title: str
    mandatory: bool
    status: Status | None  # None: not assessed yet
    decided: bool  # a person has decided
    decided_by: str | None
    open_request: bool


class EngagementOverview(BaseModel):
    engagement_id: str
    subcontractor_name: str
    document_count: int
    glance: Glance
    counts: dict[str, int]  # per status, plus "not_assessed". No total, no ratio.
    awaiting_decision: int  # requirements with a finding but no person's decision
    open_requests: int
    requirements: list[RequirementCell]


class ProjectOverview(BaseModel):
    project_id: str
    engagements: list[EngagementOverview]


@router.get("/projects/{project_id}/overview")
def project_overview(
    project_id: str,
    request: Request,
    db: Db,
    today: Annotated[date, Depends(get_today)],
) -> ProjectOverview:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "That project was not found.")
    template = request.app.state.templates[project.template_id]
    engagement_ids = {e.id for e in project.engagements}

    # The latest decision per requirement decides who decided and whether a request is open.
    latest_decision: dict[tuple[str, str], DecisionLog] = {}
    for d, f in db.execute(
        select(DecisionLog, Finding).join(Finding, DecisionLog.finding_id == Finding.id)
    ):
        if f.engagement_id not in engagement_ids:
            continue
        key = (f.engagement_id, f.requirement_code)
        cur = latest_decision.get(key)
        if cur is None or (d.decided_at, d.id) > (cur.decided_at, cur.id):
            latest_decision[key] = d
    open_requests = {
        (r.engagement_id, r.requirement_code)
        for r in db.scalars(select(UploadRequest))
        if (r.engagement_id, r.requirement_code) in latest_decision
        and latest_decision[(r.engagement_id, r.requirement_code)].id == r.decision_id
    }

    out: list[EngagementOverview] = []
    # Newest subcontractor first, like the project page.
    for e in sorted(project.engagements, key=lambda e: e.created_at, reverse=True):
        latest: dict[str, Finding] = {}
        for f in sorted(e.findings, key=lambda f: (f.created_at, f.id)):
            latest[f.requirement_code] = f
        cells: list[RequirementCell] = []
        states: list[ReqState] = []
        for req in template.requirements:
            f = latest.get(req.code)
            status = (
                effective_status(f.human_status, f.ai_status, f.valid_until, today)  # type: ignore[arg-type]
                if f
                else None
            )
            decided = bool(f and f.human_status)
            is_open = (e.id, req.code) in open_requests
            decision = latest_decision.get((e.id, req.code))
            states.append(
                ReqState(
                    code=req.code,
                    mandatory=req.mandatory,
                    status=status,
                    decided=decided,
                    open_request=is_open,
                )
            )
            cells.append(
                RequirementCell(
                    code=req.code,
                    title=req.title,
                    mandatory=req.mandatory,
                    status=status,
                    decided=decided,
                    decided_by=decision.decided_by if decision and decided else None,
                    open_request=is_open,
                )
            )
        out.append(
            EngagementOverview(
                engagement_id=e.id,
                subcontractor_name=e.subcontractor_name,
                document_count=len(e.documents),
                glance=glance_for(states, has_documents=bool(e.documents)),
                counts=count_statuses(states),
                awaiting_decision=sum(
                    1 for s in states if s.status is not None and not s.decided
                ),
                open_requests=sum(1 for s in states if s.open_request),
                requirements=cells,
            )
        )
    return ProjectOverview(project_id=project.id, engagements=out)
