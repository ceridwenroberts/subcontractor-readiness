"""Check that a quote really appears on the page it cites.

Hard rule (CLAUDE.md): this check lives in code, not in a prompt. A model can
invent a quote, so a status is only trusted when the quote is found in the
stored page text.

Normalizing (applied to both the quote and the page): Unicode NFKC, soft
hyphens removed, a hyphen at the end of a line joined to the next line,
whitespace collapsed, case ignored. Known limit: a real hyphen that happens to
fall at a line break ("F-\\nskatt") is joined too, so a quote written
"F-skatt" will not match it. That fails safe: the finding gets weaker, never
stronger.
"""

import re
import unicodedata

# Quotes shorter than this are too easy to match by accident ("F-skatt").
MIN_QUOTE_CHARS = 15

_SOFT_HYPHEN = "­"
_LINE_BREAK_HYPHEN = re.compile(r"(?<=\w)-[^\S\n]*\n\s*(?=\w)")
_WHITESPACE = re.compile(r"\s+")


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).replace(_SOFT_HYPHEN, "")
    text = _LINE_BREAK_HYPHEN.sub("", text)
    return _WHITESPACE.sub(" ", text).strip().casefold()


def verify_quote(quote: str, page_text: str) -> bool:
    """True if the normalized quote is long enough and appears in the normalized page."""
    wanted = normalize(quote)
    if len(wanted) < MIN_QUOTE_CHARS:
        return False
    return wanted in normalize(page_text)
