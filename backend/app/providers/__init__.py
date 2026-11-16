"""Choose the provider named by LLM_PROVIDER. The only place that knows all of them."""

from pathlib import Path

from app.config import Settings
from app.providers.base import LLMProvider, ProviderError
from app.providers.ollama import OllamaProvider
from app.providers.scripted import ScriptedProvider

SCRIPTED_ANSWERS = Path(__file__).parent / "scripted_answers.json"


def get_provider(settings: Settings) -> LLMProvider:
    if settings.llm_provider == "scripted":
        return ScriptedProvider.from_file(SCRIPTED_ANSWERS)
    if settings.llm_provider == "ollama":
        return OllamaProvider(
            url=settings.ollama_url,
            model=settings.ollama_model,
            timeout_seconds=settings.ollama_timeout_seconds,
            num_ctx=settings.ollama_num_ctx,
        )
    # The Anthropic provider is opt-in and on hold (no key). It is never chosen by default.
    raise ProviderError(f"provider {settings.llm_provider!r} is not available yet")
