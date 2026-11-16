"""FastAPI entry point. Run with: uvicorn app.main:app --reload --host 127.0.0.1"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.providers import get_provider
from app.routes.assess import router as assess_router
from app.templates import load_templates


def create_app(settings: Settings) -> FastAPI:
    app = FastAPI(title="Subcontractor readiness")

    # Fail at startup if any template is invalid. Routes read them from app.state.
    app.state.templates = load_templates(settings.templates_dir)
    app.state.settings = settings
    # Built once: fails at startup if the provider is misconfigured (for example no OLLAMA_MODEL).
    app.state.provider = get_provider(settings)

    # v1 has no auth: allow exactly one origin, never "*".
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type"],
    )

    app.include_router(assess_router)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app(get_settings())
