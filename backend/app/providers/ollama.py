"""Local model through Ollama's HTTP API. For plumbing and rough numbers, not quality claims.

Labeled "Local model". Nothing leaves the machine. Never logs prompts or replies.
"""

import json
from typing import Any

import httpx

from app.providers.base import InvalidModelOutput, ProviderError


class OllamaProvider:
    name = "ollama"
    label = "Local model"

    def __init__(
        self,
        url: str,
        model: str,
        timeout_seconds: int = 120,
        num_ctx: int = 8192,
        client: httpx.Client | None = None,
    ) -> None:
        if not model:
            raise ProviderError("OLLAMA_MODEL is not set")
        self.model = model
        self._url = url.rstrip("/")
        self._num_ctx = num_ctx
        self._client = client or httpx.Client(timeout=timeout_seconds)

    def complete_json(self, system: str, user: str, schema: dict[str, Any]) -> dict[str, Any]:
        body = {
            "model": self.model,
            "stream": False,
            "format": schema,  # Ollama constrains the reply to this JSON schema
            "options": {"temperature": 0, "num_ctx": self._num_ctx},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        try:
            response = self._client.post(f"{self._url}/api/chat", json=body)
            response.raise_for_status()
            content = response.json()["message"]["content"]
        except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
            # Only the exception type is kept: messages can echo request content.
            raise ProviderError(f"Ollama request failed ({type(exc).__name__})") from None
        try:
            parsed = json.loads(content)
        except (TypeError, json.JSONDecodeError):
            raise InvalidModelOutput("reply is not JSON") from None
        if not isinstance(parsed, dict):
            raise InvalidModelOutput("reply is not a JSON object")
        return parsed
