"""Redaction of personnummer and samordningsnummer.

All numbers here are synthetic. A samordningsnummer is a personnummer with 60
added to the day (born the 12th -> day 72). The last digit is a Luhn checksum:
numbers in the "clear" tests have a valid one, numbers in the "uncertain" tests
do not. 19121212-1212 is the well-known Swedish test personnummer.
"""

import pytest

from app.ingest.redact import (
    PERSONNUMMER_MARKER,
    POSSIBLE_MARKER,
    SAMORDNINGSNUMMER_MARKER,
    RedactionNote,
    luhn_valid,
    redact,
    redact_pages,
)

PNR = PERSONNUMMER_MARKER
SNR = SAMORDNINGSNUMMER_MARKER
POSSIBLE = POSSIBLE_MARKER


# --- checksum ---


@pytest.mark.parametrize("digits", ["1212121212", "8001011231", "8001721235", "0002291235"])
def test_luhn_accepts_valid_numbers(digits: str) -> None:
    assert luhn_valid(digits)


@pytest.mark.parametrize("digits", ["8001011234", "0701234567", "1212121213"])
def test_luhn_rejects_invalid_numbers(digits: str) -> None:
    assert not luhn_valid(digits)


# --- personnummer formats (valid checksum): all must be redacted ---


@pytest.mark.parametrize(
    "number",
    [
        "800101-1231",  # 10 digits, dash
        "8001011231",  # 10 digits, no separator
        "800101+1231",  # plus: person is 100 or older
        "800101 1231",  # space
        "800101 - 1231",  # spaced dash
        "800101–1231",  # en dash, common in PDF text
        "800101‑1231",  # non-breaking hyphen
        "800101−1231",  # minus sign
        "800101 1231",  # non-breaking space
        "800101\n1231",  # split across a line break
        "19800101-1231",  # 12 digits, dash
        "198001011231",  # 12 digits, no separator
        "20050101-1233",  # born 2000s
        "18991231-1231",  # born 1800s
        "121212-1212",
        "19121212-1212",
        "991231-0001",  # last day of the year
        "000229-1235",  # leap day, two-digit year 00
    ],
)
def test_personnummer_formats_are_redacted(number: str) -> None:
    result = redact(f"Contact: {number}.")
    assert result.text == f"Contact: {PNR}."
    assert result.personnummer_count == 1
    assert result.samordningsnummer_count == 0
    assert result.uncertain_count == 0


# --- samordningsnummer formats (valid checksum) ---


@pytest.mark.parametrize(
    "number",
    [
        "800161-1238",  # day 1 + 60
        "800172-1235",  # day 12 + 60
        "800191-1232",  # day 31 + 60
        "8001721235",
        "800172+1235",
        "19800172-1235",
        "198001721235",
        "800172–1235",
    ],
)
def test_samordningsnummer_formats_are_redacted(number: str) -> None:
    result = redact(f"Worker {number} on site")
    assert result.text == f"Worker {SNR} on site"
    assert result.samordningsnummer_count == 1
    assert result.personnummer_count == 0
    assert result.uncertain_count == 0


# --- uncertain: still hidden, but marked so a person can check ---


@pytest.mark.parametrize(
    "number",
    [
        "800101-1234",  # right shape, wrong checksum: a typo, or not a personnummer
        "800172-1234",  # same for a samordningsnummer
        "0701234567",  # a phone number that happens to look like 2007-01-23
        "19800101-1234",
    ],
)
def test_wrong_checksum_is_hidden_as_possible(number: str) -> None:
    # A mistyped personal number is still personal data, so it is hidden.
    # The different marker tells the reader we are not sure what it was.
    result = redact(f"Nr {number}.")
    assert result.text == f"Nr {POSSIBLE}."
    assert result.uncertain_count == 1
    assert result.personnummer_count == 0
    assert result.samordningsnummer_count == 0


@pytest.mark.parametrize(
    "text",
    [
        "800101 12 31",  # last four digits in pairs
        "8001 01-1231",
        "80 01 01-1231",
        "80.01.01-1231",
        "1980 01 01 1231",  # 12 digits, spaced
    ],
)
def test_unusual_grouping_with_valid_checksum_is_hidden_as_possible(text: str) -> None:
    # An odd layout with a valid checksum is very likely a real personal number.
    result = redact(f"Pnr: {text}, signed")
    assert result.text == f"Pnr: {POSSIBLE}, signed"
    assert result.uncertain_count == 1


@pytest.mark.parametrize(
    "text",
    [
        "070-123 45 67",  # phone number: odd grouping, checksum fails
        "800101 12 34",  # odd grouping, checksum fails
        "08-123 456 78",  # landline: month 12, day 34 is not a date
    ],
)
def test_unusual_grouping_with_wrong_checksum_is_left_alone(text: str) -> None:
    # Real personal numbers always pass the checksum. Without it, an odd
    # layout is most likely a phone number, so it is left alone and not noted.
    result = redact(f"Tel {text}")
    assert result.text == f"Tel {text}"
    assert result.count == 0


# --- position and surroundings ---


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("800101-1231", PNR),
        ("800101-1231 at start", f"{PNR} at start"),
        ("at end 800101-1231", f"at end {PNR}"),
        ("(800101-1231)", f"({PNR})"),
        ("pnr:8001011231,", f"pnr:{PNR},"),
        ("Personnr 800101-1231/2", f"Personnr {PNR}/2"),
        ("ID8001011231", f"ID{PNR}"),  # letters next to it do not protect it
    ],
)
def test_redacts_in_any_position(text: str, expected: str) -> None:
    assert redact(text).text == expected


def test_redacts_every_occurrence_and_counts_them() -> None:
    text = "A: 800101-1231, B: 19900215-5670, C: 800172-1235, D: 800101-1234, again 800101-1231"
    result = redact(text)
    assert result.text == f"A: {PNR}, B: {PNR}, C: {SNR}, D: {POSSIBLE}, again {PNR}"
    assert result.personnummer_count == 3
    assert result.samordningsnummer_count == 1
    assert result.uncertain_count == 1
    assert result.count == 5


def test_no_digits_of_the_number_remain() -> None:
    result = redact("Name: Test Person, 19800101-1231, signed")
    assert "1980" not in result.text
    assert "1231" not in result.text


def test_redacting_twice_changes_nothing() -> None:
    once = redact("800101-1231 and 800172-1235 and 800101-1234 and 800101 12 31").text
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
        "Belopp: 5 000 000 kr",  # amount
        "1.000.000.000 kr",  # 10 digits, but month 00
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


def test_calendar_validity_is_not_checked() -> None:
    # 800230 is 30 February. Not a real date, but we do not try to be clever.
    assert redact("800230-1234").count == 1


# --- pages ---


def test_redact_pages_keeps_page_order_and_sums_counts() -> None:
    pages = ["Page one 800101-1231", "", "Page three 800172-1235 and 900101-1239"]
    result = redact_pages(pages)
    assert result.pages == [f"Page one {PNR}", "", f"Page three {SNR} and {PNR}"]
    assert result.count == 3
    assert result.notes == []


def test_redact_pages_notes_uncertain_numbers_per_page() -> None:
    pages = ["Clear 800101-1231", "Tel 0701234567 and 800101-1234", "Nothing"]
    result = redact_pages(pages)
    assert result.pages[1] == f"Tel {POSSIBLE} and {POSSIBLE}"
    assert result.notes == [RedactionNote(page=2, kind="uncertain", count=2)]


@pytest.mark.parametrize(
    ("end_of_page", "start_of_page"),
    [
        ("Innehavare: Test Testsson, 800101-", "1231 signed"),
        ("Innehavare: Test Testsson, 800101", "-1231 signed"),
        ("Innehavare: Test Testsson, 800101", "1231 signed"),
        ("Innehavare: Test Testsson, 19800101-", "1231 signed"),
    ],
)
def test_number_split_across_pages_is_redacted_and_noted(
    end_of_page: str, start_of_page: str
) -> None:
    result = redact_pages([end_of_page, start_of_page])
    assert result.pages == [f"Innehavare: Test Testsson, {PNR}", " signed"]
    assert result.count == 1
    assert result.notes == [RedactionNote(page=2, kind="split_across_pages", count=1)]


def test_split_number_with_wrong_checksum_is_hidden_as_possible() -> None:
    result = redact_pages(["Tel 070123", "4567"])
    assert result.pages == [f"Tel {POSSIBLE}", ""]
    assert result.notes == [
        RedactionNote(page=2, kind="split_across_pages", count=1),
    ]


def test_ordinary_page_boundaries_are_left_alone() -> None:
    pages = ["Total 2027", "03-31 is the date", "Sida 1 av 2", "Page 2"]
    result = redact_pages(pages)
    assert result.pages == pages
    assert result.notes == []


def test_notes_can_only_hold_page_kind_and_count() -> None:
    # Notes are stored and shown in the UI, so they must never carry the number itself.
    assert set(RedactionNote.model_fields) == {"page", "kind", "count"}
    with pytest.raises(ValueError):
        RedactionNote(page=1, kind="uncertain", count=1, text="800101-1234")  # type: ignore[call-arg]
