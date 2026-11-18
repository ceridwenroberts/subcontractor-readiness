"""Pydantic shapes shared between the assessment pipeline and (later) the API."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.domain.status import Citation, Evidence, Status

# A requirement with no document is not sent to a model. Code writes its `missing` finding and
# labels it so, because every finding must say where it came from (CLAUDE.md).
NO_MODEL_PROVIDER = "none"
NO_MODEL_LABEL = "No model call"


class AssessmentOutput(BaseModel):
    """What the model must return for one requirement. Validated before use.

    Keys are snake_case because that is the simplest thing for a small model to follow.
    """

    status: Status
    quotes: list[Citation] = Field(default_factory=list)
    valid_until: date | None = None
    notes: str = ""


class AssessmentResult(BaseModel):
    """One requirement after the model answered and the code checks ran.

    `model_status` is what the model said, `ai_status` is after code checks.
    They are kept apart on purpose (CLAUDE.md). `human_status` comes later.
    """

    requirement_code: str
    model_status: Status
    ai_status: Status
    evidence: list[Evidence]
    valid_until: date | None
    notes: list[str]  # from code checks
    model_notes: str  # free text from the model, shown as the model's own words
    provider: str
    provider_label: str
    model: str
    prompt_version: str
    # What the second check (verifier agent) did. Only "not_supported" changes a status.
    verifier: Literal["not_run", "supported", "not_supported", "unavailable"] = (
        "not_run"
    )
