from datetime import date
from itertools import product

import pytest

from app.domain.status import (
    STATUSES,
    Citation,
    Status,
    check_finding,
    is_weakening_or_same,
)

TODAY = date(2026, 11, 16)

PAGES = {
    ("doc1", 1): "Härmed intygas att bolaget är godkänt för F-skatt hos Skatteverket.",
    ("doc2", 1): "Ansvarsförsäkring för bolaget. Giltig till 2027-12-31.",
    ("doc3", 1): "Ansvarsförsäkring för bolaget. Giltig till 2025-06-30.",
}

GOOD_FSKATT = Citation(
    document_id="doc1", page=1, quote="bolaget är godkänt för F-skatt hos Skatteverket"
)
GOOD_FUTURE = Citation(document_id="doc2", page=1, quote="Giltig till 2027-12-31")
GOOD_PAST = Citation(document_id="doc3", page=1, quote="Giltig till 2025-06-30")
INVENTED = Citation(document_id="doc1", page=1, quote="bolaget har tecknat ansvarsförsäkring")
WRONG_PAGE = Citation(document_id="doc1", page=2, quote="bolaget är godkänt för F-skatt")
UNKNOWN_DOC = Citation(document_id="nope", page=1, quote="bolaget är godkänt för F-skatt")


def run(status: Status, citations: list[Citation], expires=False, valid_until=None):
    return check_finding(
        model_status=status,
        citations=citations,
        pages=PAGES,
        expires=expires,
        valid_until=valid_until,
        today=TODAY,
    )


def test_found_with_verified_quote_stays_found() -> None:
    result = run("found", [GOOD_FSKATT])
    assert result.ai_status == "found"
    assert [e.verified for e in result.evidence] == [True]


def test_partial_with_verified_quote_stays_partial() -> None:
    assert run("partial", [GOOD_FSKATT]).ai_status == "partial"


def test_found_with_invented_quote_becomes_unclear() -> None:
    result = run("found", [INVENTED])
    assert result.ai_status == "unclear"
    assert [e.verified for e in result.evidence] == [False]
    assert result.notes


def test_partial_with_no_quotes_becomes_unclear() -> None:
    assert run("partial", []).ai_status == "unclear"


def test_one_verified_quote_is_enough_even_next_to_a_bad_one() -> None:
    result = run("found", [INVENTED, GOOD_FSKATT])
    assert result.ai_status == "found"
    assert [e.verified for e in result.evidence] == [False, True]


def test_quote_on_wrong_page_or_unknown_document_does_not_verify() -> None:
    assert run("found", [WRONG_PAGE]).ai_status == "unclear"
    assert run("found", [UNKNOWN_DOC]).ai_status == "unclear"


@pytest.mark.parametrize("status", ["missing", "unclear", "expired"])
def test_statuses_that_need_no_quote_are_left_alone(status: Status) -> None:
    assert run(status, []).ai_status == status


def test_expiring_requirement_with_future_date_stays_found() -> None:
    result = run("found", [GOOD_FUTURE], expires=True, valid_until=date(2027, 12, 31))
    assert result.ai_status == "found"
    assert result.valid_until == date(2027, 12, 31)


def test_expiring_requirement_with_past_date_becomes_expired() -> None:
    result = run("found", [GOOD_PAST], expires=True, valid_until=date(2025, 6, 30))
    assert result.ai_status == "expired"
    assert result.valid_until == date(2025, 6, 30)


def test_date_valid_through_today_is_not_expired() -> None:
    page_key = ("doc4", 1)
    pages = {**PAGES, page_key: "Intyg. Giltig till 2026-11-16."}
    result = check_finding(
        model_status="found",
        citations=[Citation(document_id="doc4", page=1, quote="Intyg. Giltig till 2026-11-16")],
        pages=pages,
        expires=True,
        valid_until=TODAY,
        today=TODAY,
    )
    assert result.ai_status == "found"


def test_expiring_requirement_without_date_becomes_unclear() -> None:
    result = run("found", [GOOD_FUTURE], expires=True, valid_until=None)
    assert result.ai_status == "unclear"
    assert result.valid_until is None


def test_date_not_inside_a_verified_quote_becomes_unclear() -> None:
    # The model claims 2030-01-01, but the verified quote says 2027-12-31.
    result = run("found", [GOOD_FUTURE], expires=True, valid_until=date(2030, 1, 1))
    assert result.ai_status == "unclear"
    assert result.valid_until is None


def test_date_only_in_an_unverified_quote_is_not_used() -> None:
    bad = Citation(document_id="doc2", page=1, quote="Giltig till 2027-12-31 och mer text")
    result = run("found", [bad], expires=True, valid_until=date(2027, 12, 31))
    assert result.ai_status == "unclear"
    assert result.valid_until is None


def test_non_expiring_requirement_ignores_valid_until() -> None:
    result = run("found", [GOOD_FSKATT], expires=False, valid_until=date(2020, 1, 1))
    assert result.ai_status == "found"
    assert result.valid_until is None


def test_partial_with_past_date_becomes_expired() -> None:
    result = run("partial", [GOOD_PAST], expires=True, valid_until=date(2025, 6, 30))
    assert result.ai_status == "expired"


def test_input_citations_are_not_modified() -> None:
    citations = [GOOD_FSKATT]
    run("found", citations)
    assert citations == [GOOD_FSKATT]


def test_is_weakening_or_same_table() -> None:
    assert is_weakening_or_same("found", "found")
    assert is_weakening_or_same("found", "unclear")
    assert is_weakening_or_same("found", "expired")
    assert is_weakening_or_same("partial", "unclear")
    assert not is_weakening_or_same("partial", "found")
    assert not is_weakening_or_same("unclear", "found")
    assert not is_weakening_or_same("missing", "found")
    assert not is_weakening_or_same("expired", "found")
    assert not is_weakening_or_same("unclear", "partial")


def test_code_never_strengthens_any_combination() -> None:
    """Whatever the model says and whatever the evidence is, ai_status is never stronger."""
    citation_options = [[], [INVENTED], [GOOD_FSKATT], [GOOD_FUTURE], [GOOD_PAST]]
    date_options = [None, date(2027, 12, 31), date(2025, 6, 30)]
    for status, cites, expires, valid in product(
        STATUSES, citation_options, [False, True], date_options
    ):
        result = run(status, cites, expires=expires, valid_until=valid)
        assert is_weakening_or_same(status, result.ai_status), (status, cites, expires, valid)
