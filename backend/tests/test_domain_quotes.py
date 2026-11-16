from app.domain.quotes import MIN_QUOTE_CHARS, normalize, verify_quote

PAGE = "Härmed intygas att bolaget är godkänt\nför F-skatt hos Skatteverket."


def test_normalize_collapses_whitespace_and_case() -> None:
    assert normalize("  Godkänt \n\t för   F-SKATT ") == "godkänt för f-skatt"


def test_normalize_joins_line_break_hyphens() -> None:
    assert normalize("ansvarsför-\nsäkring gäller") == "ansvarsförsäkring gäller"


def test_normalize_keeps_hyphen_inside_a_word_on_one_line() -> None:
    assert normalize("F-skatt") == "f-skatt"


def test_exact_quote_verifies() -> None:
    assert verify_quote("godkänt för F-skatt hos Skatteverket", PAGE)


def test_quote_verifies_across_a_line_break() -> None:
    # The page breaks the line after "godkänt"; the quote does not.
    assert verify_quote("bolaget är godkänt för F-skatt", PAGE)


def test_case_and_spacing_differences_are_ignored() -> None:
    assert verify_quote("BOLAGET  ÄR GODKÄNT för f-skatt", PAGE)


def test_invented_quote_does_not_verify() -> None:
    assert not verify_quote("bolaget har tecknat ansvarsförsäkring", PAGE)


def test_partly_matching_quote_does_not_verify() -> None:
    assert not verify_quote("godkänt för F-skatt och moms", PAGE)


def test_short_quote_does_not_count_even_if_present() -> None:
    short = "F-skatt"
    assert len(short) < MIN_QUOTE_CHARS
    assert short.lower() in PAGE.lower()
    assert not verify_quote(short, PAGE)


def test_length_is_measured_after_normalizing() -> None:
    # 20 characters, but only 3 once the whitespace is collapsed.
    assert not verify_quote("a" + " " * 18 + "b", "a b")


def test_empty_quote_does_not_verify() -> None:
    assert not verify_quote("", PAGE)
    assert not verify_quote("   ", PAGE)
