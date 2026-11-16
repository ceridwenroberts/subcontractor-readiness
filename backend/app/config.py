"""App settings, read from environment variables and the project-root .env file.

Settings are added here only when a slice needs them. Never log secret values.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py -> project root
PROJECT_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = PROJECT_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    # The only browser origin allowed to call the backend (CORS).
    # Exactly scheme://host[:port]: rejects "*", lists, paths, and a trailing slash
    # (browsers never send one, so it would silently block every call).
    frontend_origin: str = Field(
        default="http://localhost:3000",
        pattern=r"^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$",
    )

    # Folder with one requirement template JSON file per trade.
    templates_dir: Path = PROJECT_ROOT / "templates"

    # Upload limits (PLAN.md section 12). Checked in app/ingest/upload.py.
    max_file_mb: int = Field(default=10, gt=0)
    max_pages: int = Field(default=50, gt=0)
    max_files: int = Field(default=10, gt=0)

    # Which LLM provider answers. "scripted" (default) never touches the network.
    llm_provider: Literal["scripted", "ollama", "anthropic"] = "scripted"
    ollama_url: str = Field(
        default="http://127.0.0.1:11434", pattern=r"^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$"
    )
    ollama_model: str = ""
    ollama_timeout_seconds: int = Field(default=120, gt=0)
    ollama_num_ctx: int = Field(default=8192, gt=0)

    # SQLite file under data/ (gitignored). Postgres later: change only this URL.
    database_url: str = f"sqlite:///{PROJECT_ROOT / 'data' / 'app.db'}"

    # Uploaded PDFs, stored under UUID names. Gitignored (data/).
    uploads_dir: Path = PROJECT_ROOT / "data" / "uploads"


@lru_cache
def get_settings() -> Settings:
    return Settings()
