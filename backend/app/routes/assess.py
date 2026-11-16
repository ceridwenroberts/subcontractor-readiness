"""POST /assess/{template_id}/{requirement_code}: stateless assessment of one requirement.

Stage 3 endpoint, for testing the pipeline. PDFs are checked, read, redacted and
assessed in memory. Nothing is written to disk or a database.

Errors are written for the PM and the subcontractor alike: each says what is
wrong and what to do, never echoes document text, and one bad file does not
throw away the good ones. Logs hold ids and counts only.
"""

import logging
from datetime import date

from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.assess import DocumentText, assess_requirement
from app.config import Settings
from app.ingest.upload import UploadError, check_file_count
from app.models import AssessmentResult
from app.providers.base import LLMProvider, ProviderError
from app.routes.uploads import FileReport, display_name, process_uploads

__all__ = ["display_name", "router"]  # display_name is re-exported for the tests

logger = logging.getLogger(__name__)
router = APIRouter()

PROVIDER_DOWN = (
    "The assessment service isn't available. If you use a local model, check that "
    "Ollama is running, then try again. Nothing was saved."
)
SERVER_ERROR = "Something went wrong on our side. Nothing was saved."


class AssessResponse(BaseModel):
    files: list[FileReport]
    result: AssessmentResult | None = None
    message: str | None = None


def _error(
    status: int, message: str, files: list[FileReport] | None = None
) -> JSONResponse:
    body = AssessResponse(files=files or [], message=message)
    return JSONResponse(status_code=status, content=body.model_dump(mode="json"))


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
        requirement = next(
            (r for r in template.requirements if r.code == requirement_code), None
        )
        if requirement is None:
            return _error(404, "That requirement was not found in this template.")

        try:
            check_file_count(len(files), settings)
        except UploadError as exc:
            return _error(400, str(exc))

        reports: list[FileReport] = []
        documents: list[DocumentText] = []
        for item in process_uploads(files, settings):
            if item.report.status == "accepted":
                item.report.document_id = f"doc{len(documents) + 1}"
                documents.append(
                    DocumentText(id=item.report.document_id, pages=item.pages)
                )
            reports.append(item.report)

        if not documents:
            return _error(
                400, "None of the files could be used. See the details below.", reports
            )

        result = assess_requirement(
            provider,
            requirement,
            documents,
            today=date.today(),
            use_verifier=settings.verifier_enabled,
        )
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
        logger.warning(
            "provider unavailable provider=%s kind=%s",
            provider.name,
            type(exc).__name__,
        )
        return _error(503, PROVIDER_DOWN)
    except Exception as exc:  # noqa: BLE001  last resort: no stack trace or text to the client
        logger.error("assess failed kind=%s", type(exc).__name__)
        return _error(500, SERVER_ERROR)
