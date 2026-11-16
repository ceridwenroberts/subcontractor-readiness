"""Pydantic shapes shared between the assessment pipeline and (later) the API."""

from datetime import date

from pydantic import BaseModel, Field

from app.domain.status import Citation, Evidence, Status


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
