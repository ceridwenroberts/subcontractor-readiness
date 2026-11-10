import io
import uuid
from pathlib import Path

import pytest
from pypdf import PdfWriter

from app.config import Settings
from app.ingest.upload import (
    UploadError,
    check_file_count,
    check_pdf,
    store_pdf,
)

SETTINGS = Settings(max_file_mb=1, max_pages=3, max_files=2)


def make_pdf(pages: int = 1, password: str | None = None) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    if password is not None:
        writer.encrypt(password)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


# --- check_pdf: accepted ---


def test_valid_pdf_returns_page_count_and_sha256() -> None:
    data = make_pdf(pages=2)
    checked = check_pdf(data, SETTINGS)
    assert checked.page_count == 2
    assert len(checked.sha256) == 64


def test_pdf_at_page_limit_is_accepted() -> None:
    assert check_pdf(make_pdf(pages=3), SETTINGS).page_count == 3


# --- check_pdf: rejected ---


def test_empty_file_is_rejected() -> None:
    with pytest.raises(UploadError) as exc:
        check_pdf(b"", SETTINGS)
    assert exc.value.code == "empty"


def test_file_over_size_limit_is_rejected_before_parsing() -> None:
    # Starts like a PDF but is just padding: size must be checked first.
    data = b"%PDF-1.7\n" + b"0" * (1024 * 1024)
    with pytest.raises(UploadError) as exc:
        check_pdf(data, SETTINGS)
    assert exc.value.code == "too_large"


@pytest.mark.parametrize(
    "data",
    [
        b"PK\x03\x04 a zip file",
        b"<html>not a pdf</html>",
        b" %PDF-1.7 leading space",
        b"%PDF",  # too short to be the full magic
    ],
)
def test_wrong_magic_bytes_are_rejected(data: bytes) -> None:
    with pytest.raises(UploadError) as exc:
        check_pdf(data, SETTINGS)
    assert exc.value.code == "not_pdf"


def test_renamed_non_pdf_with_pdf_header_but_garbage_is_rejected() -> None:
    with pytest.raises(UploadError) as exc:
        check_pdf(b"%PDF-1.7\nthis is not really a pdf", SETTINGS)
    assert exc.value.code == "unreadable"


def test_too_many_pages_is_rejected() -> None:
    with pytest.raises(UploadError) as exc:
        check_pdf(make_pdf(pages=4), SETTINGS)
    assert exc.value.code == "too_many_pages"


def test_encrypted_pdf_is_rejected() -> None:
    with pytest.raises(UploadError) as exc:
        check_pdf(make_pdf(password="secret"), SETTINGS)
    assert exc.value.code == "encrypted"


def test_encrypted_pdf_with_empty_password_is_still_rejected() -> None:
    # Some PDFs are "encrypted" with an empty user password and open without one.
    with pytest.raises(UploadError) as exc:
        check_pdf(make_pdf(password=""), SETTINGS)
    assert exc.value.code == "encrypted"


def test_error_message_does_not_echo_file_content() -> None:
    with pytest.raises(UploadError) as exc:
        check_pdf(b"<script>alert(1)</script>", SETTINGS)
    assert "script" not in str(exc.value)


# --- check_file_count ---


@pytest.mark.parametrize("count", [1, 2])
def test_file_count_within_limit_is_accepted(count: int) -> None:
    check_file_count(count, SETTINGS)


@pytest.mark.parametrize("count", [0, 3])
def test_file_count_outside_limit_is_rejected(count: int) -> None:
    with pytest.raises(UploadError) as exc:
        check_file_count(count, SETTINGS)
    assert exc.value.code == "file_count"


# --- store_pdf ---


def test_store_uses_uuid_name_and_writes_bytes(tmp_path: Path) -> None:
    data = make_pdf()
    stored_name = store_pdf(data, tmp_path)
    assert stored_name.endswith(".pdf")
    uuid.UUID(stored_name.removesuffix(".pdf"))  # raises if not a UUID
    assert (tmp_path / stored_name).read_bytes() == data


def test_store_creates_the_folder(tmp_path: Path) -> None:
    folder = tmp_path / "uploads"
    stored_name = store_pdf(make_pdf(), folder)
    assert (folder / stored_name).is_file()


def test_store_never_overwrites(tmp_path: Path) -> None:
    names = {store_pdf(make_pdf(), tmp_path) for _ in range(5)}
    assert len(names) == 5


# --- settings ---


@pytest.mark.parametrize("field", ["max_file_mb", "max_pages", "max_files"])
def test_limits_must_be_positive(field: str) -> None:
    with pytest.raises(ValueError):
        Settings(**{field: 0})
