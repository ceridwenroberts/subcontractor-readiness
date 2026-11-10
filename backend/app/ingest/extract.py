"""Text extraction, one string per page.

This is the only place that knows we use pypdf, so the library can be swapped
(PLAN.md section 6). Call it only on bytes that passed upload.check_pdf().
The text returned here is NOT redacted yet: pass it through redact before
storing it or sending it anywhere.
"""

import io
import unicodedata

from pypdf import PdfReader


class ExtractionError(Exception):
    """The PDF's text could not be read."""


def extract_pages(data: bytes) -> list[str]:
    """Return the text of each page, in order. A page without a text layer gives ""."""
    try:
        reader = PdfReader(io.BytesIO(data))
        raw_pages = [page.extract_text() or "" for page in reader.pages]
    except Exception as exc:  # pypdf raises many types on malformed input
        raise ExtractionError("The PDF text could not be extracted.") from exc

    # NFC: "ä" as one character, not "a" plus a combining mark. Quote matching
    # and redaction both compare text, so they need one consistent form.
    return [unicodedata.normalize("NFC", text).strip() for text in raw_pages]
