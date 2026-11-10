"""App settings, read from environment variables and the project-root .env file.

Settings are added here only when a slice needs them. Never log secret values.
"""

from functools import lru_cache
from pathlib import Path

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
