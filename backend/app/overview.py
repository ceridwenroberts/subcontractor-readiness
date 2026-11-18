"""Documentation overview: what each subcontractor's documents show, from stored findings.

Pure functions, no database and no clock (`today` is passed in). This is documentation
status, never a verdict: "documentation complete" only says that a person has decided
"Documents show evidence" for every mandatory requirement and nothing is waiting for a new
upload. It does not say a company is approved or fit, and no score or percentage exists.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel

from app.domain.status import Status

Glance = Literal[
    "not_assessed",  # no documents, or no findings yet
    "new_upload_requested",  # a request for a new upload is open
    "awaiting_decision",  # a result with something to decide has no person's decision yet
    "documents_missing",  # a mandatory requirement has no document uploaded
    "documentation_complete",  # every mandatory requirement decided as "found"
    "gaps_recorded",  # nothing left to decide, but a mandatory requirement is not "found"
]


class ReqState(BaseModel):
    code: str
    mandatory: bool
    status: (
        Status | None
    )  # the person's decision if there is one, else the checked result
    decided: bool  # a person has decided (human_status is set)
    open_request: bool  # a request for a new upload is open for this requirement
    # No document was uploaded for it, so no model was asked. Not the same as "not found".
    no_document: bool = False


def effective_status(
    human: Status | None, ai: Status, valid_until: date | None, today: date
) -> Status:
    """The person's decision if there is one, else the checked result. A date that has run
    out since the assessment turns found or partial into expired, as the issues list does."""
    status = human or ai
    if (
        status in ("found", "partial")
        and valid_until is not None
        and valid_until < today
    ):
        return "expired"
    return status


def needs_decision(s: ReqState) -> bool:
    """A result that shows something (evidence, part of it, an unclear case or an expired date)
    and has no person's decision yet."""
    return s.status not in (None, "missing") and not s.decided and not s.no_document


def glance_for(states: list[ReqState], has_documents: bool) -> Glance:
    if not has_documents or all(s.status is None for s in states):
        return "not_assessed"
    if any(s.open_request for s in states):
        return "new_upload_requested"
    mandatory = [s for s in states if s.mandatory]
    # A requirement with no evidence ("missing", or never assessed) has nothing to decide: it
    # shows as a missing document and the way forward is a new upload, not a decision.
    if any(needs_decision(s) for s in mandatory):
        return "awaiting_decision"
    # No document uploaded: the next step is an upload, so it is named before "gaps".
    if any(s.no_document for s in mandatory):
        return "documents_missing"
    if all(s.status == "found" for s in mandatory):
        return "documentation_complete"
    return "gaps_recorded"


def count_statuses(states: list[ReqState]) -> dict[str, int]:
    """How many requirements show each status. Plain counts, never a total or a ratio."""
    counts = {s: 0 for s in ("found", "partial", "missing", "unclear", "expired")}
    counts["not_assessed"] = 0
    counts["no_document"] = 0
    for s in states:
        counts["no_document" if s.no_document else (s.status or "not_assessed")] += 1
    return counts
