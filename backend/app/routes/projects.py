"""Projects and engagements."""

from datetime import date, datetime

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.db.models import Engagement, Project
from app.db.session import Db
from app.retention import RetentionAdvice, retention_advice
from app.upload_requests import ADDRESS_RULE, is_fictional_address

router = APIRouter()


class ProjectIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    template_id: str = Field(min_length=1, max_length=100)
    delete_after: date | None = None


class EngagementIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subcontractor_name: str = Field(min_length=1, max_length=200)
    org_number: str | None = Field(default=None, max_length=20)  # fictional only
    contact_email: str | None = Field(
        default=None, max_length=200
    )  # fictional domains only


class EngagementOut(BaseModel):
    id: str
    project_id: str
    subcontractor_name: str
    org_number: str | None
    contact_email: str | None
    created_at: datetime


class ProjectOut(BaseModel):
    id: str
    name: str
    template_id: str
    delete_after: date | None
    delete_overdue: bool  # the date has passed; the data should now be deleted
    created_at: datetime


class ProjectDetail(ProjectOut):
    engagements: list[EngagementOut]


def _engagement(e: Engagement) -> EngagementOut:
    return EngagementOut(
        id=e.id,
        project_id=e.project_id,
        subcontractor_name=e.subcontractor_name,
        org_number=e.org_number,
        contact_email=e.contact_email,
        created_at=e.created_at,
    )


def _project(p: Project) -> ProjectOut:
    return ProjectOut(
        id=p.id,
        name=p.name,
        template_id=p.template_id,
        delete_after=p.delete_after,
        delete_overdue=p.delete_after is not None and p.delete_after < date.today(),
        created_at=p.created_at,
    )


@router.get("/retention")
def get_retention_advice() -> RetentionAdvice:
    """Placeholder advice for the "delete data by" date. See app/retention.py."""
    return retention_advice(date.today())


@router.post("/projects", status_code=201)
def create_project(body: ProjectIn, request: Request, db: Db) -> ProjectOut:
    if body.template_id not in request.app.state.templates:
        raise HTTPException(404, "That template was not found.")
    if body.delete_after is not None and body.delete_after < date.today():
        raise HTTPException(400, "The deletion date must be today or later.")
    project = Project(
        name=body.name.strip(),
        template_id=body.template_id,
        delete_after=body.delete_after,
    )
    db.add(project)
    db.commit()
    return _project(project)


@router.get("/projects")
def list_projects(db: Db) -> list[ProjectOut]:
    rows = db.scalars(select(Project).order_by(Project.created_at.desc()))
    return [_project(p) for p in rows]


@router.get("/projects/{project_id}")
def get_project(project_id: str, db: Db) -> ProjectDetail:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "That project was not found.")
    return ProjectDetail(
        **_project(project).model_dump(),
        engagements=[_engagement(e) for e in project.engagements],
    )


@router.post("/projects/{project_id}/engagements", status_code=201)
def create_engagement(project_id: str, body: EngagementIn, db: Db) -> EngagementOut:
    if db.get(Project, project_id) is None:
        raise HTTPException(404, "That project was not found.")
    contact = (body.contact_email or "").strip() or None
    if contact is not None and not is_fictional_address(contact):
        raise HTTPException(422, ADDRESS_RULE)
    engagement = Engagement(
        project_id=project_id,
        subcontractor_name=body.subcontractor_name.strip(),
        org_number=body.org_number,
        contact_email=contact,
    )
    db.add(engagement)
    db.commit()
    return _engagement(engagement)


@router.get("/engagements/{engagement_id}")
def get_engagement(engagement_id: str, db: Db) -> EngagementOut:
    engagement = db.get(Engagement, engagement_id)
    if engagement is None:
        raise HTTPException(404, "That engagement was not found.")
    return _engagement(engagement)
