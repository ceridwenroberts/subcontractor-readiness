import unicodedata

import pytest
from fpdf import FPDF

from app.ingest.extract import ExtractionError, extract_pages


def make_text_pdf(pages: list[str]) -> bytes:
    pdf = FPDF()
    pdf.set_font("Helvetica", size=11)
    for text in pages:
        pdf.add_page()
        if text:
            pdf.multi_cell(0, 6, text)
    return bytes(pdf.output())


def test_returns_one_string_per_page_in_order() -> None:
    pages = extract_pages(make_text_pdf(["First page", "Second page", "Third page"]))
    assert pages == ["First page", "Second page", "Third page"]


def test_keeps_swedish_characters() -> None:
    [page] = extract_pages(make_text_pdf(["Säker Vatten: auktoriserat företag. ÅÄÖ åäö"]))
    assert page == "Säker Vatten: auktoriserat företag. ÅÄÖ åäö"


def test_keeps_line_breaks_within_a_page() -> None:
    [page] = extract_pages(make_text_pdf(["Line one\nLine two"]))
    assert page == "Line one\nLine two"


def test_page_without_text_is_an_empty_string() -> None:
    # A scanned page has no text layer. OCR is not in v1, so it stays empty
    # and later shows up as "evidence not found" rather than crashing.
    pages = extract_pages(make_text_pdf(["Text", "", "More text"]))
    assert pages == ["Text", "", "More text"]


def test_output_is_nfc_normalized() -> None:
    [page] = extract_pages(make_text_pdf(["Försäkring"]))
    assert page == unicodedata.normalize("NFC", page)


def test_unreadable_pdf_raises_extraction_error() -> None:
    with pytest.raises(ExtractionError):
        extract_pages(b"%PDF-1.7\nnot really a pdf")
