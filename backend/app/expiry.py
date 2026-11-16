"""Expiry warnings: how close a date shown in the documents is, and a SIMULATED reminder draft.

Pure functions, no database and no clock: `today` is always passed in. The tiers are placeholder
thresholds (config), not a recommendation. Nothing here sends a message. A reminder draft is
text that the screen shows so a person can see what would be sent.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel

Tier = Literal["expired", "urgent", "soon", "upcoming"]
TIER_ORDER: tuple[Tier, ...] = ("expired", "urgent", "soon", "upcoming")


def days_left(valid_until: date, today: date) -> int:
    """Whole days from today to the last valid day. 0 means it is valid through today."""
    return (valid_until - today).days


def tier_for(days: int, *, urgent: int, soon: int, upcoming: int) -> Tier | None:
    """The warning tier, or None when the date is further away than the last tier.

    A date is valid through its own day, so 0 days left is still "urgent", not "expired".
    """
    if days < 0:
        return "expired"
    if days <= urgent:
        return "urgent"
    if days <= soon:
        return "soon"
    if days <= upcoming:
        return "upcoming"
    return None


ReminderKind = Literal["before_expiry", "at_expiry"]


class ReminderDraft(BaseModel):
    """SIMULATED: shown on screen, never sent."""

    kind: ReminderKind
    to: str
    subject: str
    body: str


def build_reminder(
    *,
    to: str,
    subcontractor: str,
    project: str,
    requirement: str,
    valid_until: date,
    days: int,
) -> ReminderDraft:
    """A reminder to the subcontractor. "before_expiry" while the date is ahead, "at_expiry"
    once it is today or in the past."""
    if days > 0:
        kind: ReminderKind = "before_expiry"
        subject = f"Reminder: {requirement} runs out on {valid_until.isoformat()}"
        when = f"The document we hold shows a date of {valid_until.isoformat()}, in {days} day{'s' if days != 1 else ''}."
    else:
        kind = "at_expiry"
        subject = f"Action needed: {requirement} ran out on {valid_until.isoformat()}"
        when = f"The document we hold shows a date of {valid_until.isoformat()}, " + (
            "which is today." if days == 0 else "which has ended."
        )
    body = "\n".join(
        [
            f"Hello {subcontractor},",
            "",
            f"For the project {project}, this concerns: {requirement}.",
            when,
            "Please upload a renewed document.",
            "",
            "Regards,",
            "The project team",
        ]
    )
    return ReminderDraft(kind=kind, to=to, subject=subject, body=body)
