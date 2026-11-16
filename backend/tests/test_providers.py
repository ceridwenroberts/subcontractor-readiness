import json
from pathlib import Path

import httpx
import pytest

from app.config import Settings
from app.providers import SCRIPTED_ANSWERS, get_provider
from app.providers.base import InvalidModelOutput, ProviderError
from app.providers.ollama import OllamaProvider
from app.providers.scripted import ScriptedProvider

SCHEMA = {"type": "object"}


def ollama(handler) -> OllamaProvider:
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return OllamaProvider("http://127.0.0.1:11434", "tiny", client=client)


def test_ollama_sends_schema_and_returns_parsed_reply() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content), path=request.url.path)
        return httpx.Response(200, json={"message": {"content": '{"status": "missing"}'}})

    assert ollama(handler).complete_json("sys", "usr", SCHEMA) == {"status": "missing"}
    assert seen["path"] == "/api/chat"
    assert seen["format"] == SCHEMA
    assert seen["model"] == "tiny"
    assert seen["stream"] is False
    assert seen["options"]["temperature"] == 0


def test_ollama_non_json_content_is_invalid_output() -> None:
    handler = lambda r: httpx.Response(200, json={"message": {"content": "Sure! Here you go"}})
    with pytest.raises(InvalidModelOutput):
        ollama(handler).complete_json("s", "u", SCHEMA)


def test_ollama_json_that_is_not_an_object_is_invalid_output() -> None:
    handler = lambda r: httpx.Response(200, json={"message": {"content": "[1, 2]"}})
    with pytest.raises(InvalidModelOutput):
        ollama(handler).complete_json("s", "u", SCHEMA)


def test_ollama_http_error_becomes_provider_error_without_leaking_text() -> None:
    handler = lambda r: httpx.Response(500, text="SECRET DOCUMENT TEXT")
    with pytest.raises(ProviderError) as info:
        ollama(handler).complete_json("s", "u", SCHEMA)
    assert "SECRET" not in str(info.value)


def test_ollama_unreachable_becomes_provider_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    with pytest.raises(ProviderError):
        ollama(handler).complete_json("s", "u", SCHEMA)


def test_ollama_needs_a_model_name() -> None:
    with pytest.raises(ProviderError):
        OllamaProvider("http://127.0.0.1:11434", "")


def test_labels() -> None:
    assert ScriptedProvider({}).label == "Simulated"
    assert ollama(lambda r: httpx.Response(200)).label == "Local model"


def test_get_provider_defaults_to_scripted() -> None:
    provider = get_provider(Settings(_env_file=None))
    assert (provider.name, provider.label) == ("scripted", "Simulated")


def test_get_provider_ollama_reads_settings() -> None:
    provider = get_provider(Settings(_env_file=None, llm_provider="ollama", ollama_model="tiny"))
    assert (provider.name, provider.model) == ("ollama", "tiny")


def test_get_provider_anthropic_is_not_available() -> None:
    with pytest.raises(ProviderError):
        get_provider(Settings(_env_file=None, llm_provider="anthropic"))


def test_shipped_answers_cover_every_vvs_requirement() -> None:
    answers = json.loads(Path(SCRIPTED_ANSWERS).read_text(encoding="utf-8"))
    assert sorted(answers) == [f"VVS-0{i}" for i in range(1, 8)]
