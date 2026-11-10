"""Redact personnummer and samordningsnummer before text is stored or sent anywhere.

Hard rule (CLAUDE.md): only redacted text goes in the database or to a model.
Do not bypass or weaken this module.

Design: when in doubt, redact. A Swedish personal number is YYMMDD-NNNN or
YYYYMMDD-NNNN. A samordningsnummer has 60 added to the day (61-91).
- The date part is checked in the regex. That is what keeps company org numbers
  safe: their third and fourth digits ("month") are always 20 or higher.
- The Luhn checksum is NOT required. A mistyped personal number is still
  personal data. The cost is that some date-shaped 10-digit numbers (a phone
  number like 0701234567) are redacted too.
- Calendar validity (Feb 30) is not checked, for the same reason.
Never log the input or the matches.
"""

import re

from pydantic import BaseModel

PERSONNUMMER_MARKER = "[PERSONNUMMER]"
SAMORDNINGSNUMMER_MARKER = "[SAMORDNINGSNUMMER]"

_MONTH = r"(?:0[1-9]|1[0-2])"
# 01-31 for personnummer, 61-91 for samordningsnummer.
_DAY = r"(?P<day>0[1-9]|[12][0-9]|3[01]|6[1-9]|[78][0-9]|9[01])"
# Dash, plus, or the dash look-alikes PDFs produce (hyphen, non-breaking hyphen,
# figure dash, en dash, minus), optionally spaced. Or one whitespace character
# (space, non-breaking space, line break). Or nothing.
_SEP = r"(?:\s?[-+‐‑‒–−]\s?|\s)?"

_PATTERN = re.compile(
    r"(?<!\d)"  # not in the middle of a longer number
    r"(?:(?:18|19|20)[0-9]{2}|[0-9]{2})"  # year, with or without century
    + _MONTH
    + _DAY
    + _SEP
    + r"[0-9]{4}"
    r"(?!\d)"
)


class RedactionResult(BaseModel):
    text: str
    personnummer_count: int
    samordningsnummer_count: int

    @property
    def count(self) -> int:
        return self.personnummer_count + self.samordningsnummer_count


def redact(text: str) -> RedactionResult:
    counts = {PERSONNUMMER_MARKER: 0, SAMORDNINGSNUMMER_MARKER: 0}

    def replace(match: re.Match[str]) -> str:
        marker = (
            SAMORDNINGSNUMMER_MARKER if int(match["day"]) > 60 else PERSONNUMMER_MARKER
        )
        counts[marker] += 1
        return marker

    redacted = _PATTERN.sub(replace, text)
    return RedactionResult(
        text=redacted,
        personnummer_count=counts[PERSONNUMMER_MARKER],
        samordningsnummer_count=counts[SAMORDNINGSNUMMER_MARKER],
    )


def redact_pages(pages: list[str]) -> tuple[list[str], int]:
    """Redact each page. Returns the redacted pages and the total number of redactions."""
    results = [redact(page) for page in pages]
    return [r.text for r in results], sum(r.count for r in results)
