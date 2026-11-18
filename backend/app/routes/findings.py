"""Assess an engagement, list findings, and record the PM's decisions.

Re-assessing never overwrites: each run adds new Finding rows and the list shows the
latest per requirement, so old findings and their decision history stay. A PM's
decision goes in `human_status` and in the append-only DecisionLog, never into
`model_status` or `ai_status`.
"""

import json
import logging
from collections.abc import Iterator
from datetime import date, datetime
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.assess import DocumentText, assess_with_tags
from app.config import Settings
from app.db.models import DecisionLog, Engagement, Finding, Project, UploadRequest
from app.db.session import Db
from app.domain.status import Status
from app.models import NO_MODEL_PROVIDER, AssessmentResult
from app.providers.base import LLMProvider, ProviderError
from app.routes.assess import PROVIDER_DOWN, SERVER_ERROR
from app.routes.session import CurrentUser
from app.routes.upload_requests import UploadRequestOut, request_out
from app.summary import FindingView, Summary, build_summary
from app.upload_requests import REASONS, build_draft

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
    latest_request: UploadRequestOut | None  # newest request for a new upload, if any
    created_at: datetime


UploadReason = Literal[
    "expired", "wrong_document", "unreadable", "incomplete", "not_uploaded", "other"
]


class UploadRequestIn(BaseModel):
    """Asking for a new upload. The reason is the decision's reason (see DecisionIn)."""

    model_config = ConfigDict(extra="forbid")
    send_email: bool = False  # SIMULATED: records a draft, sends nothing


class DecisionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Status
    # A reason from the list. Required when changing the result or asking for a new upload.
    reason: UploadReason | None = None
    # Typed text. Required only when the reason is "other" (see `_check_decision`).
    comment: str = Field(default="", max_length=2000)
    request_upload: UploadRequestIn | None = None
    # No `decided_by`: the server takes the name from the signed-in session.


class DecisionOut(BaseModel):
    id: str
    finding_id: str
    old_human_status: Status | None
    new_human_status: Status
    comment: str
    reason: str | None
    reason_label: str | None
    decided_by: str
    decided_at: datetime


def _decision(d: DecisionLog) -> DecisionOut:
    return DecisionOut(
        id=d.id,
        finding_id=d.finding_id,
        old_human_status=d.old_human_status,  # type: ignore[arg-type]
        new_human_status=d.new_human_status,  # type: ignore[arg-type]
        comment=d.comment,
        reason=d.reason,
        reason_label=REASONS.get(d.reason, d.reason) if d.reason else None,
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
        latest_request=(
            request_out(max(f.upload_requests, key=lambda r: r.created_at))
            if f.upload_requests
            else None
        ),
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


def _store_results(
    db: Session, engagement_id: str, results: list[AssessmentResult]
) -> None:
    """Save one new Finding per result. Earlier findings are kept (re-assessing never overwrites)."""
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
        DocumentText(id=d.id, pages=d.pages_json, requirement_codes=d.requirement_codes)
        for d in sorted(engagement.documents, key=lambda d: d.created_at)
    ]
    try:
        # All requirements first, then store: a provider failure leaves nothing half-saved.
        results = [
            assess_with_tags(
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

    _store_results(db, engagement_id, results)
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


def _line(event: dict[str, Any]) -> bytes:
    return (json.dumps(event, ensure_ascii=False) + "\n").encode()


@router.post("/engagements/{engagement_id}/assess/stream")
def assess_engagement_stream(engagement_id: str, request: Request, db: Db) -> Response:
    """Same assessment as /assess, reported step by step so the page can show progress.

    The reply is newline-delimited JSON: `start`, then a `working` event before each
    requirement, then `done` with the findings (or `error`). As with /assess, every
    requirement is assessed first and saved together at the end, so a failure leaves
    nothing half-saved. Problems found before any work starts (unknown engagement, no
    documents) are ordinary JSON errors.
    """
    engagement = _engagement_or_404(db, engagement_id)
    if not engagement.documents:
        return JSONResponse(
            status_code=400,
            content={"message": "Upload at least one document before assessing."},
        )
    provider: LLMProvider = request.app.state.provider
    settings: Settings = request.app.state.settings
    requirements = list(
        request.app.state.templates[engagement.project.template_id].requirements
    )
    documents = [
        DocumentText(id=d.id, pages=d.pages_json, requirement_codes=d.requirement_codes)
        for d in sorted(engagement.documents, key=lambda d: d.created_at)
    ]
    session_factory = request.app.state.session_factory

    def events() -> Iterator[bytes]:
        total = len(requirements)
        yield _line({"type": "start", "total": total})
        results: list[AssessmentResult] = []
        try:
            for index, req in enumerate(requirements, start=1):
                yield _line(
                    {
                        "type": "working",
                        "index": index,
                        "total": total,
                        "code": req.code,
                        "title": req.title,
                    }
                )
                results.append(
                    assess_with_tags(
                        provider,
                        req,
                        documents,
                        today=date.today(),
                        use_verifier=settings.verifier_enabled,
                    )
                )
        except ProviderError as exc:
            logger.warning(
                "provider unavailable provider=%s kind=%s",
                provider.name,
                type(exc).__name__,
            )
            yield _line({"type": "error", "status": 503, "message": PROVIDER_DOWN})
            return
        except Exception as exc:  # noqa: BLE001  last resort: no stack trace or text to the client
            logger.error("assess failed kind=%s", type(exc).__name__)
            yield _line({"type": "error", "status": 500, "message": SERVER_ERROR})
            return

        # The request's own session is closed by now, so use a fresh one.
        with session_factory() as session:
            _store_results(session, engagement_id, results)
            saved = session.get(Engagement, engagement_id)
            findings = [
                f.model_dump(mode="json") for f in _latest_findings(saved, request)
            ]
        logger.info(
            "assess engagement=%s requirements=%d provider=%s",
            engagement_id,
            total,
            provider.name,
        )
        yield _line({"type": "done", "findings": findings})

    return StreamingResponse(
        events(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@router.get("/engagements/{engagement_id}/summary")
def engagement_summary(engagement_id: str, request: Request, db: Db) -> Summary:
    """A short summary from the stored findings and decisions. No model is involved."""
    engagement = _engagement_or_404(db, engagement_id)
    template = request.app.state.templates[engagement.project.template_id]
    views = [
        FindingView(
            code=f.requirement_code,
            title=f.requirement_title,
            ai_status=f.ai_status,
            human_status=f.human_status,
            valid_until=f.valid_until.isoformat() if f.valid_until else None,
            open_request_reason=f.latest_request.reason_label
            if f.latest_request
            else None,
            provider_label=f.provider_label,
            model=f.model,
            no_document=f.provider == NO_MODEL_PROVIDER,
        )
        for f in _latest_findings(engagement, request)
    ]
    return build_summary(
        subcontractor=engagement.subcontractor_name,
        project=engagement.project.name,
        template_name=template.name,
        placeholder=template.reviewed_by is None,
        document_count=len(engagement.documents),
        findings=views,
    )


@router.get("/engagements/{engagement_id}/findings")
def list_findings(engagement_id: str, request: Request, db: Db) -> list[FindingOut]:
    return _latest_findings(_engagement_or_404(db, engagement_id), request)


def _check_decision(finding: Finding, body: DecisionIn) -> None:
    """Rules for a decision. All are checked before anything is written."""
    comment = body.comment.strip()
    changing = body.status != finding.ai_status
    if (changing or body.request_upload is not None) and body.reason is None:
        raise HTTPException(
            422,
            "Choose a reason when you change the result or ask for a new upload.",
        )
    if body.reason == "other" and not comment:
        raise HTTPException(
            422, "Describe the reason in your own words when you choose Other."
        )
    if body.request_upload is not None:
        if body.status == "found":
            raise HTTPException(
                422,
                "A new upload can only be requested when the documents do not clearly show evidence.",
            )
        if body.request_upload.send_email and not finding.engagement.contact_email:
            raise HTTPException(
                422, "Add a contact email for this subcontractor to send a request."
            )


@router.patch("/findings/{finding_id}")
def decide(
    finding_id: str, body: DecisionIn, request: Request, db: Db, user: CurrentUser
) -> FindingOut:
    finding = db.get(Finding, finding_id)
    if finding is None:
        raise HTTPException(404, "That finding was not found.")
    _check_decision(finding, body)

    engagement = finding.engagement
    comment = body.comment.strip()
    # Decision, new status and any upload request are saved in one transaction.
    decision = DecisionLog(
        finding_id=finding.id,
        old_human_status=finding.human_status,
        new_human_status=body.status,
        comment=comment,
        reason=body.reason,
        decided_by=user.name,
    )
    db.add(decision)
    db.flush()  # gives the decision its id
    if body.request_upload is not None:
        email: dict[str, str | None] = {"to": None, "subject": None, "body": None}
        if body.request_upload.send_email and engagement.contact_email:
            requirement = next(
                (
                    r
                    for r in request.app.state.templates[
                        engagement.project.template_id
                    ].requirements
                    if r.code == finding.requirement_code
                ),
                None,
            )
            draft = build_draft(
                to=engagement.contact_email,
                subcontractor=engagement.subcontractor_name,
                project=engagement.project.name,
                requirement=requirement.title
                if requirement
                else finding.requirement_code,
                reason_key=body.reason or "other",
                note=comment,
                reviewer=user.name,
            )
            email = {"to": draft.to, "subject": draft.subject, "body": draft.body}
        db.add(
            UploadRequest(
                decision_id=decision.id,
                finding_id=finding.id,
                engagement_id=finding.engagement_id,
                requirement_code=finding.requirement_code,
                reason=body.reason or "other",
                email_to=email["to"],
                email_subject=email["subject"],
                email_body=email["body"],
                requested_by=user.name,
            )
        )
    finding.human_status = body.status
    db.commit()
    db.refresh(finding)
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
