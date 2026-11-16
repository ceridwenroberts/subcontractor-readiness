"""POST /assess/{template_id}/{requirement_code}: stateless assessment of one requirement.

Stage 3 endpoint, for testing the pipeline. PDFs are checked, read, redacted and
assessed in memory. Nothing is written to disk or a database.

Errors are written for the PM and the subcontractor alike: each says what is
wrong and what to do, never echoes document text, and one bad file does not
throw away the good ones. Logs hold ids and counts only.
"""

import logging
import re
from datetime import date
from typing import Literal

from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.assess import DocumentText, assess_requirement
from app.config import Settings
from app.ingest.extract import ExtractionError, extract_pages
from app.ingest.redact import redact_pages
from app.ingest.upload import UploadError, check_file_count, check_pdf
from app.models import AssessmentResult
from app.providers.base import LLMProvider, ProviderError

logger = logging.getLogger(__name__)
router = APIRouter()

# What to do next, per upload error code. Separate from UploadError's own message.
HINTS = {
    "empty": "Check that the file was saved correctly, then upload it again.",
    "too_large": "Try a smaller or compressed copy.",
    "not_pdf": "Only PDF files are accepted. Save or export the document as a PDF.",
    "unreadable": "The file may be damaged. Try saving or exporting it as a PDF again.",
    "encrypted": "Remove the password protection and upload the copy again.",
    "too_many_pages": "Split the document, or upload only the relevant pages.",
    "unreadable_text": "The file may be damaged. Try saving or exporting it as a PDF again.",
}

PROVIDER_DOWN = (
    "The assessment service isn't available. If you use a local model, check that "
    "Ollama is running, then try again. Nothing was saved."
)
SERVER_ERROR = "Something went wrong on our side. Nothing was saved."


class FileReport(BaseModel):
    filename: str  # display only; never used as a path
    status: Literal["accepted", "rejected"]
    document_id: str | None = None
    code: str | None = None
    message: str | None = None
    hint: str | None = None
    warnings: list[str] = []


class AssessResponse(BaseModel):
    files: list[FileReport]
    result: AssessmentResult | None = None
    message: str | None = None


def display_name(raw: str | None) -> str:
    """The uploader's filename, made safe to show: last path part, no control characters."""
    name = re.split(r"[\\/]", raw or "")[-1]
    name = "".join(ch for ch in name if ch.isprintable()).strip()
    return name[:100] or "(unnamed file)"


def _error(status: int, message: str, files: list[FileReport] | None = None) -> JSONResponse:
    body = AssessResponse(files=files or [], message=message)
    return JSONResponse(status_code=status, content=body.model_dump(mode="json"))


def _pages_text(numbers: list[int]) -> str:
    if len(numbers) == 1:
        return f"page {numbers[0]}"
    return "pages " + ", ".join(str(n) for n in numbers)


def _warnings(raw_pages: list[str], redaction_count: int, notes: list) -> list[str]:
    warnings: list[str] = []
    blank = [n for n, text in enumerate(raw_pages, start=1) if not text]
    if blank:
        warnings.append(
            f"No readable text found on {_pages_text(blank)}. This may be a scan. Text from "
            "scans is not supported yet, so requirements may show as not found."
        )
    if redaction_count:
        warnings.append(
            "Personal numbers were hidden in this file. Check the original document."
        )
    for note in notes:
        if note.kind == "uncertain":
            warnings.append(
                f"Something that may be a personal number was hidden on page {note.page}. "
                "Check the original document."
            )
        else:
            warnings.append(
                f"A personal number split across pages was hidden near page {note.page}. "
                "Check the original document."
            )
    return warnings


def _read_limited(upload: UploadFile, settings: Settings) -> bytes:
    # One byte over the limit is enough to reject it, without loading a huge file.
    return upload.file.read(settings.max_file_mb * 1024 * 1024 + 1)


@router.post("/assess/{template_id}/{requirement_code}")
def assess(
    template_id: str,
    requirement_code: str,
    request: Request,
    files: list[UploadFile] = File(default=[]),  # noqa: B008
) -> JSONResponse:
    settings: Settings = request.app.state.settings
    provider: LLMProvider = request.app.state.provider
    try:
        template = request.app.state.templates.get(template_id)
        if template is None:
            return _error(404, "That template was not found.")
        requirement = next((r for r in template.requirements if r.code == requirement_code), None)
        if requirement is None:
            return _error(404, "That requirement was not found in this template.")

        try:
            check_file_count(len(files), settings)
        except UploadError as exc:
            return _error(400, str(exc))

        reports: list[FileReport] = []
        documents: list[DocumentText] = []
        for upload in files:
            name = display_name(upload.filename)
            data = _read_limited(upload, settings)
            try:
                check_pdf(data, settings)
                raw_pages = extract_pages(data)
            except (UploadError, ExtractionError) as exc:
                code = exc.code if isinstance(exc, UploadError) else "unreadable_text"
                reports.append(
                    FileReport(
                        filename=name,
                        status="rejected",
                        code=code,
                        message=f"{name}: {exc}",
                        hint=HINTS.get(code),
                    )
                )
                continue
            redacted = redact_pages(raw_pages)
            doc_id = f"doc{len(documents) + 1}"
            documents.append(DocumentText(id=doc_id, pages=redacted.pages))
            reports.append(
                FileReport(
                    filename=name,
                    status="accepted",
                    document_id=doc_id,
                    warnings=_warnings(raw_pages, redacted.count, redacted.notes),
                )
            )

        if not documents:
            return _error(400, "None of the files could be used. See the details below.", reports)

        result = assess_requirement(provider, requirement, documents, today=date.today())
        logger.info(
            "assess template=%s requirement=%s files=%d accepted=%d status=%s provider=%s",
            template_id,
            requirement_code,
            len(files),
            len(documents),
            result.ai_status,
            provider.name,
        )
        body = AssessResponse(files=reports, result=result)
        return JSONResponse(content=body.model_dump(mode="json"))
    except ProviderError as exc:
        logger.warning("provider unavailable provider=%s kind=%s", provider.name, type(exc).__name__)
        return _error(503, PROVIDER_DOWN)
    except Exception as exc:  # noqa: BLE001  last resort: no stack trace or text to the client
        logger.error("assess failed kind=%s", type(exc).__name__)
        return _error(500, SERVER_ERROR)
