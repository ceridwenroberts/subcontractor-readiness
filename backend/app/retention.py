"""Placeholder retention advice shown when a project is created.

NOT LEGAL ADVICE and not reviewed by a data protection specialist (`reviewed_by` is
None, and the UI says so, like the placeholder requirement lists). It is a starting
point to be replaced after a privacy review. Nothing is deleted automatically.
"""

from datetime import date, timedelta

from pydantic import BaseModel

SUGGESTED_DAYS = 183  # about six months after today, as a starting suggestion only


class RetentionAdvice(BaseModel):
    reviewed_by: str | None
    placeholder: bool
    suggested_date: date
    summary: str
    basis: list[str]
    caveats: list[str]


def retention_advice(today: date) -> RetentionAdvice:
    return RetentionAdvice(
        reviewed_by=None,
        placeholder=True,
        suggested_date=today + timedelta(days=SUGGESTED_DAYS),
        summary=(
            "Keep the uploaded documents and stored text only as long as the engagement needs "
            "them. A common starting point is to set the date a few months after the "
            "engagement ends, and to shorten it when you can."
        ),
        basis=[
            (
                "GDPR, Article 5(1)(e) (storage limitation): personal data must not be kept "
                "longer than necessary for the purpose."
            ),
            (
                "Swedish rules on accounting records (Bokföringslagen) set longer periods for "
                "bookkeeping material. They apply to the originals you keep elsewhere, not "
                "automatically to the copies uploaded here."
            ),
        ],
        caveats=[
            "Placeholder, not legal advice, and not reviewed by a data protection specialist.",
            "Confirm the period with your data protection officer before real use.",
            (
                "This version does not delete anything. After the date, the data must be "
                "removed by hand."
            ),
        ],
    )
