"""A simulated "model" for tests and the demo. No network. Always labeled "Simulated".

It is driven by a fixture file keyed by requirement code. Each entry is either:
- {"pattern": "<regex>"}: look for the regex in the document pages. Found: answer
  `found` with the matched text as the quote (and the first ISO date in it as
  valid_until). Not found anywhere: answer `missing`.
- {"raw": {...}}: return this answer unchanged. Used in tests to simulate a model
  that invents a quote or returns something odd.
A code with no entry gets `unclear`.

This is not a real model. It never reads instructions inside documents, which
proves nothing about how a real model handles them.
"""

import json
import re
from pathlib import Path
from typing import Any

from app.providers.base import ProviderError

_BLOCK = re.compile(r'<<BEGIN-(\w+) document="([^"]+)">>\n(.*?)\n<<END-\1>>', re.DOTALL)
_PAGE = re.compile(r"^--- page (\d+) ---$", re.MULTILINE)
_CODE = re.compile(r"^REQUIREMENT_CODE: (\S+)$", re.MULTILINE)
_ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")


def _pages(block_text: str) -> list[tuple[int, str]]:
    parts = _PAGE.split(block_text)  # ["", "1", text, "2", text, ...]
    return [(int(parts[i]), parts[i + 1].strip()) for i in range(1, len(parts) - 1, 2)]


class ScriptedProvider:
    name = "scripted"
    label = "Simulated"
    model = "fixture"

    def __init__(self, answers: dict[str, dict[str, Any]]) -> None:
        self._answers = answers

    @classmethod
    def from_file(cls, path: Path) -> "ScriptedProvider":
        try:
            return cls(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError) as exc:
            raise ProviderError(f"cannot read scripted answers file {path.name}") from exc

    def complete_json(self, system: str, user: str, schema: dict[str, Any]) -> dict[str, Any]:
        # Read the header only: text before the first document block is ours, not the PDF's.
        header, _, _ = user.partition("<<BEGIN-")
        code_match = _CODE.search(header)
        entry = self._answers.get(code_match.group(1)) if code_match else None
        if entry is None:
            return {"status": "unclear", "quotes": [], "notes": "No scripted answer."}
        if "raw" in entry:
            return dict(entry["raw"])

        pattern = re.compile(entry["pattern"])
        for _nonce, doc_id, text in _BLOCK.findall(user):
            for page, page_text in _pages(text):
                match = pattern.search(page_text)
                if match:
                    quote = match.group(0)
                    date = _ISO_DATE.search(quote)
                    return {
                        "status": "found",
                        "quotes": [{"document_id": doc_id, "page": page, "quote": quote}],
                        "valid_until": date.group(0) if date else None,
                        "notes": "Simulated answer from a fixture pattern.",
                    }
        return {"status": "missing", "quotes": [], "notes": "Simulated: pattern not found."}
