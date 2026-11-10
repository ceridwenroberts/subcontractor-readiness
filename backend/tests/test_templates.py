import json
from pathlib import Path
from typing import Any

import pytest

from app.config import Settings
from app.templates import TemplateError, load_templates

REAL_TEMPLATES = Path(__file__).resolve().parents[2] / "templates"


def valid_template() -> dict[str, Any]:
    return {
        "id": "test",
        "name": "Test",
        "version": "0.1",
        "reviewedBy": None,
        "requirements": [
            {
                "code": "TEST-01",
                "title": "Something",
                "description": "Proof of something.",
                "mandatory": True,
                "expires": False,
                "evidenceHints": ["something"],
            }
        ],
    }


def write(tmp_path: Path, data: Any, name: str = "test.json") -> Path:
    (tmp_path / name).write_text(json.dumps(data), encoding="utf-8")
    return tmp_path


def test_real_templates_load() -> None:
    templates = load_templates(REAL_TEMPLATES)
    vvs = templates["vvs"]
    assert vvs.reviewed_by is None  # still a placeholder
    assert len(vvs.requirements) > 0
    assert any(r.expires for r in vvs.requirements)


def test_default_settings_point_at_real_templates() -> None:
    assert Settings().templates_dir == REAL_TEMPLATES


def test_valid_template_loads(tmp_path: Path) -> None:
    templates = load_templates(write(tmp_path, valid_template()))
    assert templates["test"].requirements[0].code == "TEST-01"


def test_invalid_json_is_rejected(tmp_path: Path) -> None:
    (tmp_path / "test.json").write_text("{not json", encoding="utf-8")
    with pytest.raises(TemplateError, match="test.json"):
        load_templates(tmp_path)


def test_missing_field_is_rejected(tmp_path: Path) -> None:
    data = valid_template()
    del data["requirements"][0]["mandatory"]
    with pytest.raises(TemplateError):
        load_templates(write(tmp_path, data))


def test_unknown_field_is_rejected(tmp_path: Path) -> None:
    data = valid_template()
    data["requirements"][0]["mandatroy"] = True  # typo must fail, not be ignored
    with pytest.raises(TemplateError):
        load_templates(write(tmp_path, data))


def test_duplicate_codes_are_rejected(tmp_path: Path) -> None:
    data = valid_template()
    data["requirements"].append(dict(data["requirements"][0]))
    with pytest.raises(TemplateError, match="duplicate"):
        load_templates(write(tmp_path, data))


def test_code_without_template_prefix_is_rejected(tmp_path: Path) -> None:
    data = valid_template()
    data["requirements"][0]["code"] = "EL-01"
    with pytest.raises(TemplateError, match="prefix"):
        load_templates(write(tmp_path, data))


def test_empty_requirements_are_rejected(tmp_path: Path) -> None:
    data = valid_template()
    data["requirements"] = []
    with pytest.raises(TemplateError):
        load_templates(write(tmp_path, data))


def test_id_must_match_filename(tmp_path: Path) -> None:
    with pytest.raises(TemplateError, match="filename"):
        load_templates(write(tmp_path, valid_template(), name="other.json"))


def test_empty_directory_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(TemplateError, match="no templates"):
        load_templates(tmp_path)


def test_app_refuses_to_start_with_bad_template(tmp_path: Path) -> None:
    from app.main import create_app

    (tmp_path / "test.json").write_text("{not json", encoding="utf-8")
    with pytest.raises(TemplateError):
        create_app(Settings(templates_dir=tmp_path))
