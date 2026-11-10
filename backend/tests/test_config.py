import pytest
from pydantic import ValidationError

from app.config import Settings


@pytest.mark.parametrize(
    "origin",
    ["http://localhost:3000", "http://127.0.0.1:3000", "https://example.test"],
)
def test_frontend_origin_accepts_plain_origins(origin: str) -> None:
    assert Settings(frontend_origin=origin).frontend_origin == origin


@pytest.mark.parametrize(
    "origin",
    [
        "*",  # would allow every website
        "http://localhost:3000/",  # browsers never send a trailing slash, so CORS would block all
        "http://localhost:3000/app",  # an origin has no path
        "localhost:3000",  # missing scheme
        "ftp://localhost",
        "http://a.test,http://b.test",  # only one origin is allowed
        "",
    ],
)
def test_frontend_origin_rejects_anything_else(origin: str) -> None:
    with pytest.raises(ValidationError):
        Settings(frontend_origin=origin)
