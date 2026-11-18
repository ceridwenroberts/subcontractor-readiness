"""Requests for a new upload: reasons, the fictional-address rule, and the simulated email draft.

The email is SIMULATED. A draft is built and recorded so the reviewer can see exactly what
would be sent, and nothing leaves this machine. Real sending (an email service, consent,
approved templates) is a later step. The draft never contains document text or quotes, and
it avoids verdict words ("rejected", "failed", "does not pass").
"""

import re

from pydantic import BaseModel

REASONS: dict[str, str] = {
    "expired": "The document has expired",
    "wrong_document": "This is not the type of document required",
    "unreadable": "The document is unreadable or is a scan",
    "incomplete": "Information is missing from the document",
    "not_uploaded": "No document has been uploaded for this requirement",
    "other": "Other reason (see the note)",
}

# One plain sentence per reason, for the email. `REASONS` holds the short labels the screens use.
REASON_SENTENCES: dict[str, str] = {
    "expired": "The document we have on file has expired.",
    "wrong_document": "The document we received is not the type of document we need for this requirement.",
    "unreadable": "We could not read the document we received. It may be a scan or a damaged file.",
    "incomplete": "The document we received does not contain all the information we need.",
    "not_uploaded": "We have not received a document for this requirement yet.",
    "other": "Please see the note below for the reason.",
}

# Reserved, never-real domains (RFC 2606 and RFC 6761): safe for synthetic data.
_RESERVED_SUFFIXES = (".example", ".test", ".invalid", ".localhost")
_RESERVED_DOMAINS = ("example.com", "example.org", "example.net")
_SHAPE = re.compile(r"^[^@\s]+@([^@\s]+\.[^@\s]+|[^@\s]+)$")

ADDRESS_RULE = (
    "Use a fictional address ending in .example, .test or example.com. "
    "Real addresses are not allowed in this version."
)


def is_fictional_address(address: str) -> bool:
    match = _SHAPE.match(address.strip())
    if not match:
        return False
    domain = match.group(1).lower()
    return domain in _RESERVED_DOMAINS or domain.endswith(
        _RESERVED_SUFFIXES + tuple(f".{d}" for d in _RESERVED_DOMAINS)
    )


class Draft(BaseModel):
    to: str
    subject: str
    body: str


def build_draft(
    *,
    to: str,
    subcontractor: str,
    project: str,
    requirement: str,
    reason_key: str,
    note: str,
    reviewer: str,
) -> Draft:
    lines = [
        f"Hello {subcontractor},",
        "",
        f"For the project {project}, we need a new document for \u201c{requirement}\u201d.",
        "",
        REASON_SENTENCES[reason_key],
    ]
    if note.strip():
        lines += [f"A note from {reviewer}: {note.strip()}"]
    lines += [
        "",
        "Please upload the new document as a PDF. If you have any questions, just reply to this message.",
        "",
        f"Kind regards,\n{reviewer}",
    ]
    return Draft(
        to=to,
        subject=f"Please send a new document: {requirement} ({project})",
        body="\n".join(lines),
    )
