"""A short documentation summary built from stored findings only. No model is involved.

Rules (CLAUDE.md): report documentation status only. Never "approved", "compliant",
"qualified", "pass", "fail" or a score, so there are no percentages or ratios, only plain
counts and lists. Each requirement uses the person's decision if there is one and says so,
otherwise the result after the automatic checks and says it has not been reviewed.
"""

from pydantic import BaseModel

from app.models import NO_MODEL_LABEL

DISCLAIMER = (
    "This summary describes what the uploaded documents show. It is not an approval. "
    "A person must review and decide."
)

STATUS_ORDER = ["found", "partial", "expired", "unclear", "missing"]
STATUS_LABEL = {
    "found": "Documents show evidence",
    "partial": "Documents show part of it",
    "expired": "Documents show an expired date",
    "unclear": "Needs human review",
    "missing": "Evidence not found",
}


class SummaryItem(BaseModel):
    code: str
    title: str
    reviewed_by_person: bool
    note: str  # for example the date shown, or that a new upload was requested


class SummaryGroup(BaseModel):
    status: str
    label: str
    items: list[SummaryItem]


class Summary(BaseModel):
    title: str
    intro: str
    groups: list[SummaryGroup]
    not_reviewed_count: int
    not_reviewed_text: str
    assessed_by: str
    disclaimer: str


class FindingView(BaseModel):
    """What the summary needs from a stored finding."""

    code: str
    title: str
    ai_status: str
    human_status: str | None
    valid_until: str | None
    open_request_reason: str | None
    provider_label: str
    model: str


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def build_summary(
    *,
    subcontractor: str,
    project: str,
    template_name: str,
    placeholder: bool,
    document_count: int,
    findings: list[FindingView],
) -> Summary:
    groups: list[SummaryGroup] = []
    for status in STATUS_ORDER:
        items: list[SummaryItem] = []
        for f in findings:
            effective = f.human_status or f.ai_status
            if effective != status:
                continue
            notes: list[str] = []
            if f.valid_until and status in ("found", "partial", "expired"):
                notes.append(f"date shown in the documents: {f.valid_until}")
            if f.open_request_reason:
                notes.append(
                    f"a new upload was requested ({f.open_request_reason.lower()})"
                )
            items.append(
                SummaryItem(
                    code=f.code,
                    title=f.title,
                    reviewed_by_person=f.human_status is not None,
                    note="; ".join(notes),
                )
            )
        if items:
            groups.append(
                SummaryGroup(status=status, label=STATUS_LABEL[status], items=items)
            )

    not_reviewed = sum(1 for f in findings if f.human_status is None)
    intro = (
        f"Based on {_plural(document_count, 'uploaded document')} and "
        f"{_plural(len(findings), 'requirement')} in the {template_name} template"
        + (
            ", which is a placeholder list not reviewed by a domain expert."
            if placeholder
            else "."
        )
    )
    if not findings:
        not_reviewed_text = "No assessment has been run yet."
    elif not_reviewed == 0:
        not_reviewed_text = "A person has recorded a decision on every requirement."
    else:
        not_reviewed_text = (
            f"{_plural(not_reviewed, 'requirement')} not yet reviewed by a person. "
            "Their status is the result of the automatic checks."
        )
    # A requirement with no document has no model behind it, so it cannot name the assessor.
    first = next((f for f in findings if f.provider_label != NO_MODEL_LABEL), None)
    assessed_by = (
        f"{first.provider_label} ({first.model})"
        if first
        else (NO_MODEL_LABEL if findings else "Not assessed")
    )
    return Summary(
        title=f"Documentation summary: {subcontractor} on {project}",
        intro=intro,
        groups=groups,
        not_reviewed_count=not_reviewed,
        not_reviewed_text=not_reviewed_text,
        assessed_by=assessed_by,
        disclaimer=DISCLAIMER,
    )
