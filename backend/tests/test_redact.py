"""Redaction of personnummer and samordningsnummer.

All numbers here are synthetic. A samordningsnummer is a personnummer with 60
added to the day (born the 12th -> day 72).
"""

import pytest

from app.ingest.redact import (
    PERSONNUMMER_MARKER,
    SAMORDNINGSNUMMER_MARKER,
    redact,
    redact_pages,
)

PNR = PERSONNUMMER_MARKER
SNR = SAMORDNINGSNUMMER_MARKER


# --- personnummer formats: all must be redacted ---


@pytest.mark.parametrize(
    "number",
    [
        "800101-1234",  # 10 digits, dash
        "8001011234",  # 10 digits, no separator
        "800101+1234",  # plus: person is 100 or older
        "800101 1234",  # space
        "800101 - 1234",  # spaced dash
        "800101–1234",  # en dash, common in PDF text
        "800101‑1234",  # non-breaking hyphen
        "800101−1234",  # minus sign
        "800101 1234",  # non-breaking space
        "800101\n1234",  # split across a line break
        "19800101-1234",  # 12 digits, dash
        "198001011234",  # 12 digits, no separator
        "20050101-1234",  # born 2000s
        "18991231-1234",  # born 1800s
        "121212-1212",
        "19121212-1212",
        "991231-0000",  # last day of the year
        "000229-1234",  # leap day, two-digit year 00
    ],
)
def test_personnummer_formats_are_redacted(number: str) -> None:
    result = redact(f"Contact: {number}.")
    assert result.text == f"Contact: {PNR}."
    assert result.personnummer_count == 1
    assert result.samordningsnummer_count == 0


# --- samordningsnummer formats ---


@pytest.mark.parametrize(
    "number",
    [
        "800161-1234",  # day 1 + 60
        "800172-1234",  # day 12 + 60
        "800191-1234",  # day 31 + 60
        "8001721234",
        "800172+1234",
        "19800172-1234",
        "198001721234",
        "800172–1234",
    ],
)
def test_samordningsnummer_formats_are_redacted(number: str) -> None:
    result = redact(f"Worker {number} on site")
    assert result.text == f"Worker {SNR} on site"
    assert result.samordningsnummer_count == 1
    assert result.personnummer_count == 0


# --- position and surroundings ---


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("800101-1234", PNR),
        ("800101-1234 at start", f"{PNR} at start"),
        ("at end 800101-1234", f"at end {PNR}"),
        ("(800101-1234)", f"({PNR})"),
        ("pnr:8001011234,", f"pnr:{PNR},"),
        ("Personnr 800101-1234/2", f"Personnr {PNR}/2"),
        ("ID8001011234", f"ID{PNR}"),  # letters next to it do not protect it
    ],
)
def test_redacts_in_any_position(text: str, expected: str) -> None:
    assert redact(text).text == expected


def test_redacts_every_occurrence_and_counts_them() -> None:
    text = "A: 800101-1234, B: 19900215-5678, C: 800172-1234, again 800101-1234"
    result = redact(text)
    assert result.text == f"A: {PNR}, B: {PNR}, C: {SNR}, again {PNR}"
    assert result.personnummer_count == 3
    assert result.samordningsnummer_count == 1
    assert result.count == 4


def test_no_digits_of_the_number_remain() -> None:
    result = redact("Name: Test Person, 19800101-1234, signed")
    assert "1980" not in result.text
    assert "1234" not in result.text


def test_redacting_twice_changes_nothing() -> None:
    once = redact("800101-1234 and 800172-1234").text
    again = redact(once)
    assert again.text == once
    assert again.count == 0


# --- things that are NOT personal numbers: must be left alone ---


@pytest.mark.parametrize(
    "text",
    [
        "556677-8899",  # org number: "month" 67 is impossible
        "5566778899",
        "16556677-8899",  # org number with 16 prefix
        "802001-1234",  # month 20 (org numbers start at 20)
        "800001-1234",  # month 00
        "801301-1234",  # month 13
        "800100-1234",  # day 00
        "800132-1234",  # day 32
        "800160-1234",  # day 60: neither a day nor a samordningsnummer day
        "800192-1234",  # day 92
        "Giltig till 2027-03-31",  # ISO date
        "Giltig till 20270331",  # 8-digit date
        "070-123 45 67",  # phone number with spaces
        "Belopp: 5 000 000 kr",  # amount
        "Postnummer 123 45",
        "Faktura 80010112",  # 8 digits only
        "80010112345",  # 11 digits: not a known format
        "1234567890123",  # 13 digits
        "800101-123",  # only 3 digits at the end
        "800101-12345",  # 5 digits at the end
    ],
)
def test_non_personal_numbers_are_left_alone(text: str) -> None:
    result = redact(text)
    assert result.text == text
    assert result.count == 0


def test_text_without_numbers_is_unchanged() -> None:
    text = "Säker Vatten: auktoriserat företag.\nGiltig till 2027-03-31."
    assert redact(text).text == text


# --- deliberate cautious behaviour ---


def test_checksum_is_not_required() -> None:
    # 800101-1235 fails the Luhn check, but a mistyped personnummer is still
    # personal data, so it is redacted anyway.
    assert redact("800101-1235").text == PNR


def test_date_like_ten_digit_numbers_are_redacted_too() -> None:
    # 0701234567 is shaped like a phone number, but it is also a valid
    # personnummer shape (2007-01-23). We cannot tell them apart, so we
    # redact. Hiding one number too many is the safer mistake.
    assert redact("0701234567").text == PNR


# --- pages ---


def test_redact_pages_keeps_page_order_and_sums_counts() -> None:
    pages = ["Page one 800101-1234", "", "Page three 800172-1234 and 900101-1234"]
    redacted, count = redact_pages(pages)
    assert redacted == [f"Page one {PNR}", "", f"Page three {SNR} and {PNR}"]
    assert count == 3
