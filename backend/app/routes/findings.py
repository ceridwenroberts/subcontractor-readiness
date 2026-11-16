"""Assess an engagement, list findings, and record the PM's decisions.

Re-assessing never overwrites: each run adds new Finding rows and the list shows the
latest per requirement, so old findings and their decision history stay. A PM's
decision goes in `human_status` and in the append-only DecisionLog, never into
`model_status` or `ai_status`.
"""

import logging
from datetime import date, datetime

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.assess import DocumentText, assess_requirement
from app.config import Settings
from app.db.models import DecisionLog, Engagement, Finding, Project
from app.db.session import Db
from app.domain.status import Status
from app.providers.base import LLMProvider, ProviderError
from app.routes.assess import PROVIDER_DOWN, SERVER_ERROR

logger = logging.getLogger(__name__)
router = APIRouter()


class EvidenceOut(BaseModel):
    document_id: str
    document_name: str
    page: int
    quote: str
    verified: bool


class FindingOut(BaseModel):
    id: str
    engagement_id: str
    requirement_code: str
    requirement_title: str
    mandatory: bool
    model_status: Status  # what the model said
    ai_status: Status  # after code checks
    human_status: Status | None  # the PM's decision, if any
    evidence: list[EvidenceOut]
    valid_until: date | None
    notes: str
    provider: str
    provider_label: str
    model: str
    prompt_version: str
    created_at: datetime


class DecisionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Status
    comment: str = Field(min_length=1, max_length=2000)
    decided_by: str = Field(min_length=1, max_length=100)


class DecisionOut(BaseModel):
    id: str
    finding_id: str
    old_human_status: Status | None
    new_human_status: Status
    comment: str
    decided_by: str
    decided_at: datetime


def _decision(d: DecisionLog) -> DecisionOut:
    return DecisionOut(
        id=d.id,
        finding_id=d.finding_id,
        old_human_status=d.old_human_status,  # type: ignore[arg-type]
        new_human_status=d.new_human_status,  # type: ignore[arg-type]
        comment=d.comment,
        decided_by=d.decided_by,
        decided_at=d.decided_at,
    )


def _finding_out(
    f: Finding, request: Request, project: Project, names: dict[str, str]
) -> FindingOut:
    template = request.app.state.templates[project.template_id]
    req = next((r for r in template.requirements if r.code == f.requirement_code), None)
    return FindingOut(
        id=f.id,
        engagement_id=f.engagement_id,
        requirement_code=f.requirement_code,
        requirement_title=req.title if req else f.requirement_code,
        mandatory=req.mandatory if req else False,
        model_status=f.model_status,  # type: ignore[arg-type]
        ai_status=f.ai_status,  # type: ignore[arg-type]
        human_status=f.human_status,  # type: ignore[arg-type]
        evidence=[
            EvidenceOut(
                document_id=e["document_id"],
                document_name=names.get(e["document_id"], "(removed document)"),
                page=e["page"],
                quote=e["quote"],
                verified=e["verified"],
            )
            for e in f.evidence_json
        ],
        valid_until=f.valid_until,
        notes=f.notes,
        provider=f.provider,
        provider_label=f.provider_label,
        model=f.model,
        prompt_version=f.prompt_version,
        created_at=f.created_at,
    )


def _engagement_or_404(db: Db, engagement_id: str) -> Engagement:
    engagement = db.get(Engagement, engagement_id)
    if engagement is None:
        raise HTTPException(404, "That engagement was not found.")
    return engagement


def _latest_findings(engagement: Engagement, request: Request) -> list[FindingOut]:
    project = engagement.project
    names = {d.id: d.original_filename for d in engagement.documents}
    latest: dict[str, Finding] = {}
    for f in sorted(engagement.findings, key=lambda f: f.created_at):
        latest[f.requirement_code] = f
    order = [
        r.code for r in request.app.state.templates[project.template_id].requirements
    ]
    ordered = [latest[c] for c in order if c in latest]
    return [_finding_out(f, request, project, names) for f in ordered]


@router.post("/engagements/{engagement_id}/assess")
def assess_engagement(engagement_id: str, request: Request, db: Db) -> JSONResponse:
    engagement = _engagement_or_404(db, engagement_id)
    provider: LLMProvider = request.app.state.provider
    settings: Settings = request.app.state.settings
    template = request.app.state.templates[engagement.project.template_id]
    if not engagement.documents:
        return JSONResponse(
            status_code=400,
            content={"message": "Upload at least one document before assessing."},
        )
    documents = [
        DocumentText(id=d.id, pages=d.pages_json)
        for d in sorted(engagement.documents, key=lambda d: d.created_at)
    ]
    try:
        # All requirements first, then store: a provider failure leaves nothing half-saved.
        results = [
            assess_requirement(
                provider,
                req,
                documents,
                today=date.today(),
                use_verifier=settings.verifier_enabled,
            )
            for req in template.requirements
        ]
    except ProviderError as exc:
        logger.warning(
            "provider unavailable provider=%s kind=%s",
            provider.name,
            type(exc).__name__,
        )
        return JSONResponse(status_code=503, content={"message": PROVIDER_DOWN})
    except Exception as exc:  # noqa: BLE001  last resort: no stack trace or text to the client
        logger.error("assess failed kind=%s", type(exc).__name__)
        return JSONResponse(status_code=500, content={"message": SERVER_ERROR})

    for r in results:
        notes = list(r.notes)
        if r.model_notes:
            notes.append(f"Model note: {r.model_notes}")
        db.add(
            Finding(
                engagement_id=engagement_id,
                requirement_code=r.requirement_code,
                model_status=r.model_status,
                ai_status=r.ai_status,
                evidence_json=[e.model_dump() for e in r.evidence],
                valid_until=r.valid_until,
                notes=" ".join(notes),
                provider=r.provider,
                provider_label=r.provider_label,
                model=r.model,
                prompt_version=r.prompt_version,
            )
        )
    db.commit()
    logger.info(
        "assess engagement=%s requirements=%d provider=%s",
        engagement_id,
        len(results),
        provider.name,
    )
    db.refresh(engagement)
    findings = [
        f.model_dump(mode="json") for f in _latest_findings(engagement, request)
    ]
    return JSONResponse(status_code=201, content=findings)


@router.get("/engagements/{engagement_id}/findings")
def list_findings(engagement_id: str, request: Request, db: Db) -> list[FindingOut]:
    return _latest_findings(_engagement_or_404(db, engagement_id), request)


@router.patch("/findings/{finding_id}")
def decide(finding_id: str, body: DecisionIn, request: Request, db: Db) -> FindingOut:
    finding = db.get(Finding, finding_id)
    if finding is None:
        raise HTTPException(404, "That finding was not found.")
    # Decision row and new status are saved in one transaction.
    db.add(
        DecisionLog(
            finding_id=finding.id,
            old_human_status=finding.human_status,
            new_human_status=body.status,
            comment=body.comment.strip(),
            decided_by=body.decided_by.strip(),
        )
    )
    finding.human_status = body.status
    db.commit()
    engagement = finding.engagement
    names = {d.id: d.original_filename for d in engagement.documents}
    return _finding_out(finding, request, engagement.project, names)


@router.get("/findings/{finding_id}/decisions")
def list_decisions(finding_id: str, db: Db) -> list[DecisionOut]:
    if db.get(Finding, finding_id) is None:
        raise HTTPException(404, "That finding was not found.")
    rows = db.scalars(
        select(DecisionLog)
        .where(DecisionLog.finding_id == finding_id)
        .order_by(DecisionLog.decided_at, DecisionLog.id)
    )
    return [_decision(d) for d in rows]
