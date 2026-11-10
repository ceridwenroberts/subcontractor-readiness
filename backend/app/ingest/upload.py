"""Checks for uploaded PDFs, and storing them under a UUID name.

Every upload is untrusted. The checks run cheapest first, so a huge or wrong
file is rejected before the PDF parser ever sees it. Error messages never echo
file content or the client's filename.
"""

import hashlib
import io
import uuid
from pathlib import Path

from pydantic import BaseModel
from pypdf import PdfReader

from app.config import Settings

PDF_MAGIC = b"%PDF-"


class UploadError(Exception):
    """An upload was rejected. `code` is stable for the API; `str()` is for people."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class CheckedPdf(BaseModel):
    page_count: int
    sha256: str


def check_file_count(count: int, settings: Settings) -> None:
    if not 1 <= count <= settings.max_files:
        raise UploadError(
            "file_count", f"Upload between 1 and {settings.max_files} files at a time."
        )


def check_pdf(data: bytes, settings: Settings) -> CheckedPdf:
    """Raise UploadError unless data is a readable, unencrypted PDF within the limits."""
    if not data:
        raise UploadError("empty", "The file is empty.")

    max_bytes = settings.max_file_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise UploadError("too_large", f"The file is larger than {settings.max_file_mb} MB.")

    if not data.startswith(PDF_MAGIC):
        raise UploadError("not_pdf", "The file is not a PDF.")

    try:
        reader = PdfReader(io.BytesIO(data))
        # Checked before reading pages: some encrypted PDFs open with an empty
        # password, and we reject all of them.
        encrypted = reader.is_encrypted
        page_count = 0 if encrypted else len(reader.pages)
    except Exception as exc:  # pypdf raises many types on malformed input
        raise UploadError("unreadable", "The PDF could not be read.") from exc

    if encrypted:
        raise UploadError("encrypted", "The PDF is encrypted. Upload an unprotected copy.")
    if page_count == 0:
        raise UploadError("unreadable", "The PDF has no pages.")
    if page_count > settings.max_pages:
        raise UploadError("too_many_pages", f"The PDF has more than {settings.max_pages} pages.")

    return CheckedPdf(page_count=page_count, sha256=hashlib.sha256(data).hexdigest())


def store_pdf(data: bytes, uploads_dir: Path) -> str:
    """Write data under a new UUID name and return that name. Never uses a client filename."""
    uploads_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4()}.pdf"
    # "xb" fails instead of overwriting if the name somehow exists already.
    with open(uploads_dir / stored_name, "xb") as f:
        f.write(data)
    return stored_name
