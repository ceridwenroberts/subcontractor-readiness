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
    date = valid_until.isoformat()
    document = f"the document we have on file for \u201c{requirement}\u201d"
    if days > 0:
        kind: ReminderKind = "before_expiry"
        subject = f"Reminder: {requirement} expires on {date}"
        when = (
            f"Our records show that {document} is valid until {date}, "
            f"which is {days} day{'s' if days != 1 else ''} from now."
        )
        ask = "Please send us an updated document before then."
    else:
        kind = "at_expiry"
        if days == 0:
            subject = f"Reminder: {requirement} expires today"
            when = f"Our records show that {document} expires today ({date})."
        else:
            subject = f"Action needed: {requirement} expired on {date}"
            when = f"Our records show that {document} expired on {date}."
        ask = "Please send us an updated document as soon as possible."
    body = "\n".join(
        [
            f"Hello {subcontractor},",
            "",
            f"This is a message about the project {project}.",
            "",
            when,
            ask,
            "",
            "Kind regards,",
            "The project team",
        ]
    )
    return ReminderDraft(kind=kind, to=to, subject=subject, body=body)
