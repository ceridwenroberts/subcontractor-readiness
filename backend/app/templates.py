"""Load and validate requirement templates from templates/*.json.

Templates are the only source of requirements. An invalid template stops the
app from starting, so a broken file is noticed at once instead of mid-demo.
"""

import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from pydantic.alias_generators import to_camel


class TemplateError(Exception):
    """A template file is missing, unreadable, or invalid."""


class _Strict(BaseModel):
    # JSON uses camelCase (reviewedBy), Python uses snake_case (reviewed_by).
    # extra="forbid": a typo like "mandatroy" fails loudly instead of being ignored.
    model_config = ConfigDict(alias_generator=to_camel, extra="forbid", frozen=True)


class Requirement(_Strict):
    code: str = Field(min_length=1)
    title: str = Field(min_length=1)
    description: str = Field(min_length=1)
    mandatory: bool
    expires: bool
    evidence_hints: list[str]


class Template(_Strict):
    id: str = Field(pattern=r"^[a-z0-9_-]+$")
    name: str = Field(min_length=1)
    version: str = Field(min_length=1)
    reviewed_by: str | None
    requirements: list[Requirement] = Field(min_length=1)

    @model_validator(mode="after")
    def check_codes(self) -> "Template":
        # Runs after all fields are parsed, so it can compare requirements with each other.
        prefix = f"{self.id.upper()}-"
        seen: set[str] = set()
        for req in self.requirements:
            if not req.code.startswith(prefix):
                raise ValueError(f"code {req.code!r} must start with prefix {prefix!r}")
            if req.code in seen:
                raise ValueError(f"duplicate requirement code {req.code!r}")
            seen.add(req.code)
        return self


def load_templates(directory: Path) -> dict[str, Template]:
    """Load every *.json in directory. Raises TemplateError on the first problem."""
    templates: dict[str, Template] = {}
    for path in sorted(directory.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            template = Template.model_validate(data)
        except (OSError, json.JSONDecodeError, ValidationError) as exc:
            raise TemplateError(f"invalid template {path.name}: {exc}") from exc
        if template.id != path.stem:
            raise TemplateError(
                f"template id {template.id!r} does not match filename {path.name!r}"
            )
        templates[template.id] = template
    if not templates:
        raise TemplateError(f"no templates found in {directory}")
    return templates
