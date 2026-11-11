"""Redact personnummer and samordningsnummer before text is stored or sent anywhere.

Hard rule (CLAUDE.md): only redacted text goes in the database or to a model.
Do not bypass or weaken this module. Never log the input or the matches.

A Swedish personal number is YYMMDD-NNNN or YYYYMMDD-NNNN. A samordningsnummer
has 60 added to the day (61-91). The last digit is a Luhn checksum.

Design: when in doubt, hide it, and say we were unsure.
- Standard layout, valid checksum   -> [PERSONNUMMER] or [SAMORDNINGSNUMMER]
- Standard layout, wrong checksum   -> [POSSIBLE PERSONNUMMER], noted as uncertain.
  A typo is still personal data, but it might also be e.g. a phone number.
- Unusual layout (800101 12 31), valid checksum -> [POSSIBLE PERSONNUMMER], noted.
- Unusual layout, wrong checksum    -> left alone. Real numbers pass the
  checksum, so this is most likely a phone number (070-123 45 67).
- A number split across two pages   -> hidden, and noted on the second page.
The date part is checked in the patterns. That keeps company org numbers safe:
their third and fourth digits ("month") are always 20 or higher.
Calendar validity (30 February) is not checked.
"""

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict

PERSONNUMMER_MARKER = "[PERSONNUMMER]"
SAMORDNINGSNUMMER_MARKER = "[SAMORDNINGSNUMMER]"
POSSIBLE_MARKER = "[POSSIBLE PERSONNUMMER]"

_MONTH = r"(?:0[1-9]|1[0-2])"
# 01-31 for personnummer, 61-91 for samordningsnummer.
_DAY = r"(?:0[1-9]|[12][0-9]|3[01]|6[1-9]|[78][0-9]|9[01])"
# Dash, plus, and PDF dash look-alikes. The "-" is escaped because it goes inside [...].
_DASHES = "\\-+\u2010\u2011\u2012\u2013\u2212"
# A dash (optionally spaced), or one whitespace character (incl. line break), or nothing.
_SEP = rf"(?:\s?[{_DASHES}]\s?|\s)?"

# Standard layout: (CC)YYMMDD[sep]NNNN, not inside a longer run of digits.
_STANDARD = re.compile(
    r"(?<!\d)(?:(?:18|19|20)[0-9]{2}|[0-9]{2})" + _MONTH + _DAY + _SEP + r"[0-9]{4}(?!\d)"
)
# Unusual layout: 10 to 12 digits with single spaces, dots, or dashes anywhere.
# Checked only after the standard pass, on what is left.
_UNUSUAL = re.compile(r"(?<!\d)(?<!\d[ .\-])\d(?:[ .\-]?\d){9,11}(?![ .\-]?\d)")
_DATE10 = re.compile(r"[0-9]{2}" + _MONTH + _DAY + r"[0-9]{4}")

# Digits and separators at the end of one page and the start of the next.
_TAIL = re.compile(rf"[\d\s{_DASHES}]*$")
_HEAD = re.compile(rf"^[\d\s{_DASHES}]*")


def luhn_valid(digits10: str) -> bool:
    """The personnummer checksum: weights 2,1,2,1,... on the first nine digits."""
    total = 0
    for i, ch in enumerate(digits10[:9]):
        product = int(ch) * (2 if i % 2 == 0 else 1)
        total += product // 10 + product % 10
    return (10 - total % 10) % 10 == int(digits10[9])


def _ten_digits(raw: str) -> str | None:
    """The YYMMDDNNNN part if raw has a valid date shape, else None."""
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 12 and digits[:2] in ("18", "19", "20"):
        digits = digits[2:]
    return digits if len(digits) == 10 and _DATE10.fullmatch(digits) else None


def _marker_for_standard(raw: str) -> str:
    digits = _ten_digits(raw)
    assert digits is not None  # the standard pattern already checked the date
    if not luhn_valid(digits):
        return POSSIBLE_MARKER
    return SAMORDNINGSNUMMER_MARKER if int(digits[4:6]) > 60 else PERSONNUMMER_MARKER


class RedactionResult(BaseModel):
    text: str
    personnummer_count: int
    samordningsnummer_count: int
    uncertain_count: int

    @property
    def count(self) -> int:
        return self.personnummer_count + self.samordningsnummer_count + self.uncertain_count


def redact(text: str) -> RedactionResult:
    counts = {PERSONNUMMER_MARKER: 0, SAMORDNINGSNUMMER_MARKER: 0, POSSIBLE_MARKER: 0}

    def standard(match: re.Match[str]) -> str:
        marker = _marker_for_standard(match.group())
        counts[marker] += 1
        return marker

    def unusual(match: re.Match[str]) -> str:
        digits = _ten_digits(match.group())
        if digits is None or not luhn_valid(digits):
            return match.group()  # most likely a phone number: leave it
        counts[POSSIBLE_MARKER] += 1
        return POSSIBLE_MARKER

    redacted = _STANDARD.sub(standard, text)
    redacted = _UNUSUAL.sub(unusual, redacted)
    return RedactionResult(
        text=redacted,
        personnummer_count=counts[PERSONNUMMER_MARKER],
        samordningsnummer_count=counts[SAMORDNINGSNUMMER_MARKER],
        uncertain_count=counts[POSSIBLE_MARKER],
    )


class RedactionNote(BaseModel):
    """Something a person should check in the original. Never holds the number itself."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    page: int  # 1-based
    kind: Literal["uncertain", "split_across_pages"]
    count: int


class PagesRedaction(BaseModel):
    pages: list[str]
    count: int
    notes: list[RedactionNote]


def _join_split_number(first: str, second: str) -> tuple[str, str] | None:
    """If a standard-layout number runs across the page break, hide it in both pages."""
    tail = _TAIL.search(first).group()  # type: ignore[union-attr]  # always matches
    head = _HEAD.match(second).group()  # type: ignore[union-attr]
    if not (any(c.isdigit() for c in tail) and any(c.isdigit() for c in head)):
        return None
    joined = tail + "\n" + head
    for match in _STANDARD.finditer(joined):
        if match.start() < len(tail) and match.end() > len(tail) + 1:
            marker = _marker_for_standard(match.group())
            new_first = first[: len(first) - len(tail)] + tail[: match.start()] + marker
            new_second = joined[match.end() :] + second[len(head) :]
            return new_first, new_second
    return None


def redact_pages(pages: list[str]) -> PagesRedaction:
    """Redact each page, then the joins between pages. Notes say what to check where."""
    results = [redact(page) for page in pages]
    texts = [r.text for r in results]
    count = sum(r.count for r in results)
    notes = [
        RedactionNote(page=i + 1, kind="uncertain", count=r.uncertain_count)
        for i, r in enumerate(results)
        if r.uncertain_count
    ]

    for i in range(len(texts) - 1):
        joined = _join_split_number(texts[i], texts[i + 1])
        if joined is not None:
            texts[i], texts[i + 1] = joined
            count += 1
            notes.append(RedactionNote(page=i + 2, kind="split_across_pages", count=1))

    notes.sort(key=lambda n: (n.page, n.kind))
    return PagesRedaction(pages=texts, count=count, notes=notes)
