"""Upload and list documents for an engagement.

Only redacted text is stored in the database. The original PDF goes to
data/uploads/ under a UUID name. Each file is handled on its own, so one bad
file does not discard the others.
"""

import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict

from app.config import Settings
from app.db.models import Document, Engagement
from app.db.session import Db
from app.ingest.redact import RedactionNote
from app.ingest.upload import UploadError, check_file_count, store_pdf
from app.routes.uploads import FileReport, process_uploads, warnings_for

logger = logging.getLogger(__name__)
router = APIRouter()


class DocumentOut(BaseModel):
    id: str
    filename: str
    page_count: int
    redaction_count: int
    warnings: list[str]
    requirement_codes: list[str]  # empty: untagged, read for every requirement
    created_at: datetime


class UploadResponse(BaseModel):
    files: list[FileReport]
    message: str | None = None


def _document(d: Document) -> DocumentOut:
    notes = [RedactionNote.model_validate(n) for n in d.redaction_notes_json]
    return DocumentOut(
        id=d.id,
        filename=d.original_filename,
        page_count=d.page_count,
        redaction_count=d.redaction_count,
        warnings=warnings_for(d.pages_json, d.redaction_count, notes),
        requirement_codes=d.requirement_codes or [],
        created_at=d.created_at,
    )


def _template_codes(request: Request, engagement: Engagement) -> set[str]:
    template = request.app.state.templates[engagement.project.template_id]
    return {r.code for r in template.requirements}


def _check_codes(codes: list[str], valid: set[str]) -> list[str]:
    unknown = [c for c in codes if c not in valid]
    if unknown:
        raise HTTPException(422, "That requirement is not in this project's template.")
    return list(dict.fromkeys(codes))  # no repeats, order kept


def _parse_tags(raw: str | None, count: int, valid: set[str]) -> list[list[str]]:
    """One list of codes per file. Missing or null entries mean untagged."""
    if not raw:
        return [[] for _ in range(count)]
    try:
        data = json.loads(raw)
    except ValueError as exc:
        raise HTTPException(422, "The requirement choices could not be read.") from exc
    if not isinstance(data, list) or len(data) != count:
        raise HTTPException(422, "Give one requirement choice for each file.")
    out: list[list[str]] = []
    for entry in data:
        if entry is None:
            out.append([])
        elif isinstance(entry, list) and all(isinstance(c, str) for c in entry):
            out.append(_check_codes(entry, valid))
        else:
            raise HTTPException(422, "The requirement choices could not be read.")
    return out


@router.post("/engagements/{engagement_id}/documents")
def upload_documents(
    engagement_id: str,
    request: Request,
    db: Db,
    files: list[UploadFile] = File(default=[]),  # noqa: B008
    # Optional: a JSON list with one entry per file, each a list of requirement codes (or null).
    tags: Annotated[str | None, Form()] = None,
) -> JSONResponse:
    settings: Settings = request.app.state.settings
    engagement = db.get(Engagement, engagement_id)
    if engagement is None:
        raise HTTPException(404, "That engagement was not found.")
    valid_codes = _template_codes(request, engagement)
    file_tags = _parse_tags(tags, len(files), valid_codes)
    try:
        check_file_count(len(files), settings)
    except UploadError as exc:
        body = UploadResponse(files=[], message=str(exc))
        return JSONResponse(status_code=400, content=body.model_dump(mode="json"))

    reports: list[FileReport] = []
    for index, item in enumerate(process_uploads(files, settings)):
        if item.report.status == "accepted" and item.checked is not None:
            document = Document(
                engagement_id=engagement_id,
                original_filename=item.report.filename,
                stored_name=store_pdf(item.data, settings.uploads_dir),
                sha256=item.checked.sha256,
                page_count=item.checked.page_count,
                pages_json=item.pages,
                redaction_count=item.redaction_count,
                redaction_notes_json=[n.model_dump() for n in item.notes],
                requirement_codes=file_tags[index] or None,
            )
            db.add(document)
            db.flush()
            item.report.document_id = document.id
        reports.append(item.report)
    db.commit()

    accepted = sum(r.status == "accepted" for r in reports)
    logger.info(
        "upload engagement=%s files=%d accepted=%d", engagement_id, len(files), accepted
    )
    if accepted == 0:
        body = UploadResponse(
            files=reports,
            message="None of the files could be used. See the details below.",
        )
        return JSONResponse(status_code=400, content=body.model_dump(mode="json"))
    return JSONResponse(
        status_code=201, content=UploadResponse(files=reports).model_dump(mode="json")
    )


@router.get("/engagements/{engagement_id}/documents")
def list_documents(engagement_id: str, db: Db) -> list[DocumentOut]:
    engagement = db.get(Engagement, engagement_id)
    if engagement is None:
        raise HTTPException(404, "That engagement was not found.")
    return [
        _document(d) for d in sorted(engagement.documents, key=lambda d: d.created_at)
    ]


class TagsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    requirement_codes: list[
        str
    ]  # empty = untagged ("not sure": read for every requirement)


@router.patch("/documents/{document_id}")
def update_document_tags(
    document_id: str, body: TagsIn, request: Request, db: Db
) -> DocumentOut:
    """Change which requirements a document is for. It applies from the next assessment: earlier
    findings keep the documents they were made from."""
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(404, "That document was not found.")
    codes = _check_codes(
        body.requirement_codes, _template_codes(request, document.engagement)
    )
    document.requirement_codes = codes or None
    db.commit()
    return _document(document)


class PagesOut(BaseModel):
    id: str
    engagement_id: str
    filename: str
    page_count: int
    pages: list[str]  # REDACTED text only: personal numbers are already hidden


@router.get("/documents/{document_id}/pages")
def document_pages(document_id: str, db: Db) -> PagesOut:
    """Redacted page text for the review viewer. Never the original text."""
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(404, "That document was not found.")
    return PagesOut(
        id=document.id,
        engagement_id=document.engagement_id,
        filename=document.original_filename,
        page_count=document.page_count,
        pages=document.pages_json,
    )


_STORED_NAME = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$"
)


@router.get("/documents/{document_id}/file")
def document_file(document_id: str, request: Request, db: Db) -> FileResponse:
    """The ORIGINAL PDF, for the "open original" link. It may show personal numbers that the
    viewer hides, so the UI labels the link. The path comes from our own UUID name, checked
    again here, never from the uploader's filename."""
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(404, "That document was not found.")
    settings: Settings = request.app.state.settings
    folder = Path(settings.uploads_dir).resolve()
    path = (folder / document.stored_name).resolve()
    if not _STORED_NAME.match(document.stored_name) or path.parent != folder:
        raise HTTPException(404, "That document was not found.")
    if not path.is_file():
        raise HTTPException(404, "The original file is no longer available.")
    return FileResponse(
        path,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'inline; filename="document.pdf"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
        },
    )
