"""The one interface every LLM provider implements.

LLM calls happen only in the backend and only through a provider (CLAUDE.md).
Feature code never imports an SDK. Providers never log prompts or replies.
"""

from typing import Any, Protocol


class ProviderError(Exception):
    """The provider is unreachable, misconfigured, or returned an error."""


class InvalidModelOutput(Exception):
    """The model replied, but not with a JSON object."""


class LLMProvider(Protocol):
    name: str  # "scripted" | "ollama" | "anthropic"
    label: str  # shown in the UI: "Simulated" | "Local model" | "Claude"
    model: str  # stored on every finding

    def complete_json(self, system: str, user: str, schema: dict[str, Any]) -> dict[str, Any]:
        """Return the model's reply as a dict. The caller validates it."""
        ...
