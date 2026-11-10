"""FastAPI entry point. Run with: uvicorn app.main:app --reload --host 127.0.0.1"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.templates import load_templates


def create_app(settings: Settings) -> FastAPI:
    app = FastAPI(title="Subcontractor readiness")

    # Fail at startup if any template is invalid. Routes read them from app.state.
    app.state.templates = load_templates(settings.templates_dir)

    # v1 has no auth: allow exactly one origin, never "*".
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app(get_settings())
