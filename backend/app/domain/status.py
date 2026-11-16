"""Turn a model's answer into an `aiStatus` using code checks.

Hard rules (CLAUDE.md):
- Code may only weaken a status, never strengthen it.
- `found` and `partial` need at least one quote that verifies against the
  stored page text. Otherwise the status becomes `unclear`.
- If a requirement expires, the expiry date must sit inside a verified quote.
  A past date becomes `expired`. A missing or unsupported date becomes `unclear`.

`check_finding` never copies the model's status forward by default: it works out
`ai_status` from the evidence, and a final guard refuses any result that is
stronger than what the model said.

Dates are matched in ISO form (2027-12-31), the format the templates and packets
use. A date written another way will not match, so the finding gets weaker.
"""

from collections.abc import Mapping
from datetime import date
from typing import Literal, get_args

from pydantic import BaseModel, ConfigDict, Field

from app.domain.quotes import normalize, verify_quote

Status = Literal["found", "partial", "missing", "unclear", "expired"]
STATUSES: tuple[Status, ...] = get_args(Status)

# Pages are looked up by (document id, page number).
PageKey = tuple[str, int]


class Citation(BaseModel):
    """A quote the model says supports its answer."""

    model_config = ConfigDict(frozen=True)

    document_id: str
    page: int
    quote: str


class Evidence(BaseModel):
    """A citation after checking, as stored in the finding."""

    model_config = ConfigDict(frozen=True)

    document_id: str
    page: int
    quote: str
    verified: bool


class CheckResult(BaseModel):
    ai_status: Status
    evidence: list[Evidence]
    valid_until: date | None
    notes: list[str] = Field(default_factory=list)


def is_weakening_or_same(old: Status, new: Status) -> bool:
    """The only allowed moves: stay put, or go from found/partial to something weaker."""
    if old == new:
        return True
    if old == "found":
        return new in ("partial", "unclear", "expired")
    if old == "partial":
        return new in ("unclear", "expired")
    return False


def check_finding(
    *,
    model_status: Status,
    citations: list[Citation],
    pages: Mapping[PageKey, str],
    expires: bool,
    valid_until: date | None,
    today: date,
) -> CheckResult:
    notes: list[str] = []

    evidence = [
        Evidence(
            document_id=c.document_id,
            page=c.page,
            quote=c.quote,
            verified=(c.document_id, c.page) in pages
            and verify_quote(c.quote, pages[(c.document_id, c.page)]),
        )
        for c in citations
    ]
    verified_quotes = [normalize(e.quote) for e in evidence if e.verified]

    # The date only counts if it is written inside a quote that verified.
    supported_until: date | None = None
    if expires and valid_until is not None:
        if any(valid_until.isoformat() in q for q in verified_quotes):
            supported_until = valid_until
        else:
            notes.append("The stated expiry date is not inside a verified quote.")

    ai_status: Status = model_status
    if model_status in ("found", "partial"):
        if not verified_quotes:
            ai_status = "unclear"
            notes.append("No quote could be verified against the page text.")
        elif expires:
            if supported_until is None:
                ai_status = "unclear"
                if valid_until is None:
                    notes.append("This requirement expires, but no expiry date was given.")
            elif supported_until < today:
                ai_status = "expired"
                notes.append("The documents show an expiry date in the past.")

    if not is_weakening_or_same(model_status, ai_status):
        raise ValueError(f"code checks must not strengthen {model_status!r} to {ai_status!r}")

    return CheckResult(
        ai_status=ai_status, evidence=evidence, valid_until=supported_until, notes=notes
    )
