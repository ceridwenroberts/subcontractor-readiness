"""Shared handling of uploaded PDFs, used by /assess and the documents endpoint.

Each file is checked, read and redacted on its own, so one bad file never discards
the good ones. Messages say what is wrong and what to do, and never echo document
text. The uploader's filename is for display only and is never used as a path.
"""

import re
from dataclasses import dataclass, field
from typing import Literal

from fastapi import UploadFile
from pydantic import BaseModel

from app.config import Settings
from app.ingest.extract import ExtractionError, extract_pages
from app.ingest.redact import RedactionNote, redact_pages
from app.ingest.upload import CheckedPdf, UploadError, check_pdf

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


class FileReport(BaseModel):
    filename: str  # display only; never used as a path
    status: Literal["accepted", "rejected"]
    document_id: str | None = None
    code: str | None = None
    message: str | None = None
    hint: str | None = None
    warnings: list[str] = []


@dataclass
class ProcessedFile:
    report: FileReport
    data: bytes = b""
    checked: CheckedPdf | None = None
    pages: list[str] = field(default_factory=list)  # redacted text
    redaction_count: int = 0
    notes: list[RedactionNote] = field(default_factory=list)


def display_name(raw: str | None) -> str:
    """The uploader's filename, made safe to show: last path part, no control characters."""
    name = re.split(r"[\\/]", raw or "")[-1]
    name = "".join(ch for ch in name if ch.isprintable()).strip()
    return name[:100] or "(unnamed file)"


def _pages_text(numbers: list[int]) -> str:
    if len(numbers) == 1:
        return f"page {numbers[0]}"
    return "pages " + ", ".join(str(n) for n in numbers)


def warnings_for(
    pages: list[str], redaction_count: int, notes: list[RedactionNote]
) -> list[str]:
    """Things the PM should know. `pages` is redacted text; an empty page was empty originally."""
    warnings: list[str] = []
    blank = [n for n, text in enumerate(pages, start=1) if not text]
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


def process_uploads(files: list[UploadFile], settings: Settings) -> list[ProcessedFile]:
    """Check, extract and redact each file. Caller has already checked the file count."""
    results: list[ProcessedFile] = []
    for upload in files:
        name = display_name(upload.filename)
        data = _read_limited(upload, settings)
        try:
            checked = check_pdf(data, settings)
            raw_pages = extract_pages(data)
        except (UploadError, ExtractionError) as exc:
            code = exc.code if isinstance(exc, UploadError) else "unreadable_text"
            report = FileReport(
                filename=name,
                status="rejected",
                code=code,
                message=f"{name}: {exc}",
                hint=HINTS.get(code),
            )
            results.append(ProcessedFile(report=report))
            continue
        redacted = redact_pages(raw_pages)
        report = FileReport(
            filename=name,
            status="accepted",
            warnings=warnings_for(redacted.pages, redacted.count, redacted.notes),
        )
        results.append(
            ProcessedFile(
                report=report,
                data=data,
                checked=checked,
                pages=redacted.pages,
                redaction_count=redacted.count,
                notes=redacted.notes,
            )
        )
    return results
