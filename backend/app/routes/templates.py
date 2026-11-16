"""GET /templates and /templates/{id}. Requirements come only from templates/*.json."""

from typing import Any

from fastapi import APIRouter, HTTPException, Request

router = APIRouter()


@router.get("/templates")
def list_templates(request: Request) -> list[dict[str, Any]]:
    return [
        {
            "id": t.id,
            "name": t.name,
            "version": t.version,
            "reviewed_by": t.reviewed_by,
            "placeholder": t.reviewed_by is None,
            "requirement_count": len(t.requirements),
        }
        for t in request.app.state.templates.values()
    ]


@router.get("/templates/{template_id}")
def get_template(template_id: str, request: Request) -> dict[str, Any]:
    template = request.app.state.templates.get(template_id)
    if template is None:
        raise HTTPException(404, "That template was not found.")
    data = template.model_dump(by_alias=True)
    data["placeholder"] = template.reviewed_by is None
    return data
