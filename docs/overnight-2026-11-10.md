# Overnight run, 2026-11-10: Stage 2 on `stage-2-overnight`

Built while you were away, on your instructions: one commit per slice after `./check.sh` passed, nothing merged to `main`, PLAN.md not ticked. Review each slice, then merge (or ask for changes).

How to look at a slice: `git log --oneline main..stage-2-overnight`, then `git show <hash>`.

## Slice 1: Upload checks

**Built:** `backend/app/ingest/upload.py` with `check_pdf()`, `check_file_count()`, and `store_pdf()`. New settings in `config.py`: `max_file_mb`, `max_pages`, `max_files` (must be > 0, read from `.env`) and `uploads_dir` (`data/uploads/`). 23 tests in `backend/tests/test_upload.py`. Test PDFs are made in memory with pypdf, including encrypted ones.

**Check:** wrote the tests first (collection error, as expected), then the code. 23 passed; `./check.sh` passed.

**Decisions I made for you** (in `docs/decisions.md`):
- Checks run cheapest first: empty, size, magic bytes, then parsing. A 1 GB file is rejected without being parsed.
- `%PDF-` must be at byte 0, stricter than the spec's "first 1024 bytes".
- Every encrypted PDF is rejected, even one that opens with an empty password.
- Any pypdf error becomes `unreadable`, so a malformed file can't crash the request.
- Plain functions only. The HTTP upload endpoint belongs to Stage 4.

**Look at carefully:**
- The `try/except Exception` around pypdf. A broad catch is normally a smell; here it's deliberate, because pypdf raises many exception types on bad input.
- `UploadError` has a stable `code` for the API and a human message that never echoes file content.

**Worth understanding:** the file bytes decide whether it's a PDF, not the filename or the browser's content type. Both of those are chosen by the client and can lie.

## Slice 2: Text extraction per page

**Built:** `backend/app/ingest/extract.py` with `extract_pages(data) -> list[str]`, one string per page, in order. It is the only file that uses pypdf for text, so the library can be swapped later. 6 tests in `backend/tests/test_extract.py`. They build real text PDFs with fpdf2, which is now pinned in `requirements.txt` as `fpdf2==2.9.0` (dev only, already approved in PLAN.md section 6).

**Check:** tests first (collection error), then the code. 6 passed; `./check.sh` passed.

**Decisions I made for you:**
- A page with no text layer (a scan) becomes `""`, not an error. OCR is out of scope for v1, so such a page later shows as "evidence not found".
- Text is NFC-normalized and stripped. Line breaks inside a page are kept.
- Any pypdf failure becomes `ExtractionError`.

**Look at carefully:** the docstring says the output is **not redacted yet**. Nothing stores it so far. Slice 3 adds redaction, and the Stage 4 upload endpoint must call extract and then redact before saving anything. That ordering is the one thing to keep an eye on when the pieces get wired together.

**Worth understanding:** NFC normalization. "ä" can be stored as one character or as "a" plus a combining dot mark. They look identical but compare as different strings, which would break quote matching and redaction. NFC picks the one-character form every time.

## Slice 3: Personnummer and samordningsnummer redaction

**Built:** `backend/app/ingest/redact.py` with `redact(text)` (returns the text plus a count per kind) and `redact_pages(pages)` (returns the redacted pages plus a total, matching `redactionCount` in the data model). 60 tests in `backend/tests/test_redact.py`.

**Check:** tests first (collection error), then the code. All 60 passed on the first run; `./check.sh` passed.

**What the tests cover:**
- **Redacted:** with and without century; separators `-`, `+`, space, spaced dash, en dash, non-breaking hyphen, minus sign, non-breaking space, and a line break; born in the 1800s, 1900s, and 2000s; samordningsnummer days 61 to 91; numbers at the start or end of text, in brackets, after `pnr:`, and glued to letters; several numbers in one text, counted separately.
- **Left alone:** org numbers (`556677-8899`, also with the `16` prefix), impossible months and days, ISO dates, 8-digit dates, phone numbers with spaces, amounts, postal codes, and 8-, 11- and 13-digit numbers.
- **Idempotent:** redacting already-redacted text changes nothing.

**Decisions I made for you:**
- **This differs from what I said before you left.** I said the checksum would separate real ID numbers from other numbers. While writing the tests I changed my mind: a personal number with a typo is still personal data, and the checksum would let it through. So the checksum is **not** required. What protects org numbers is the date check: their third and fourth digits are always 20 or higher, which is never a valid month. Two tests document the cost: `800101-1235` (bad checksum) and `0701234567` (looks like a phone number) are both redacted.
- Calendar validity (Feb 30) isn't checked, for the same reason.
- Markers are `[PERSONNUMMER]` and `[SAMORDNINGSNUMMER]`. They contain no digits, which is why redacting twice changes nothing.

**Look at carefully:**
- The regex in `redact.py`, piece by piece (`_MONTH`, `_DAY`, `_SEP`). It's the whole rule.
- **Not covered:** a number written in odd groups (`800101 12 34`), and a number split by the PDF across two pages. Tell me if you want either added.
- Nothing calls redaction yet. Stage 4 wires it in as extract, then redact, then store.

**Worth understanding:** `(?<!\d)` and `(?!\d)` are "lookarounds". They check the character before and after a match without including it. They're why `1234567890123` isn't partly redacted: a match may not start or end inside a longer run of digits.

## Slice 4: Synthetic PDF generator and the first 3 packets

**Built:**
- `evals/make_packets.py`: generates packets with fpdf2. Run it from the project root with `backend/.venv/bin/python evals/make_packets.py`.
- `evals/packets/`: three packets for the VVS template, 64 KB in total, each with PDFs and an `expected.json`:

| Packet | Documents | Expected |
|---|---|---|
| `01_complete` | 5 PDFs, 7 pages | all 7 `found` |
| `02_missing_items` | 3 PDFs | VVS-01 to 03 `found`, VVS-04 to 07 `missing` |
| `03_expired_and_personnummer` | 5 PDFs | insurance expired 2025-06-30, so VVS-03 `expired`, the rest `found`. The hot work certificate shows `19121212-1212`, which is redacted (`expectedRedactions: 1`). |

- `backend/tests/test_packets.py`, 8 tests. For each packet it checks that `expected.json` covers exactly the template's requirement codes with valid statuses. It also runs every PDF through **upload check, extract, redact**, which tests the three earlier slices working together. One more test regenerates the packets and fails if they differ from the committed files.
- `check.sh` now runs ruff on `evals/` too.

**Check:** 123 backend tests passed, and `./check.sh` passed. The first full run **failed on ruff**: 6 errors in my generator for implicit string concatenation inside lists (rule ISC004). I fixed the code by wrapping the joined strings in parentheses, regenerated, and it passed. No test was changed.

**Before and after redaction** (packet 3, hot work certificate page):
```
BEFORE: Innehavare: Test Testsson (fiktiv), 19121212-1212
AFTER:  Innehavare: Test Testsson (fiktiv), [PERSONNUMMER]
```

**Decisions I made for you:**
- **Packet 3 combines expired insurance and a personnummer.** The plan lists them as separate packet types. Here they share one packet so the demo document (PLAN.md demo step 6) exists now. Split them when you build packets 4 to 10 if you prefer.
- **Synthetic data:**
  - Companies are clearly fictional ("Exempelrör AB (fiktivt)", "Exempelförsäkring AB (fiktivt)").
  - No org numbers anywhere.
  - `19121212-1212` is the well-known Swedish test personnummer.
  - **Please check:** the texts name **Skatteverket** and **Säker Vatten**, because the template's evidence hints use those words. Every page is stamped as a synthetic test document, but they are real organisations. Say if you'd rather use made-up names.
- Expiry dates (2027 for valid items) are fixed, so the expected statuses stay correct through the deadline.
- `evals/run.py` doesn't exist yet. Where it lives is left for Stage 6, because CLAUDE.md shows two different layouts.

**Process note:** for this slice I wrote the generator before the test, unlike slices 1 to 3. It's tooling rather than logic, but it's a small break from "tests first", so I'm telling you.

**Worth understanding:** determinism. fpdf2 normally stamps each PDF with the current time, so two runs would differ. Fixing the creation date makes the output byte-identical every time, which is what lets a test say "the committed packets are exactly what the generator produces".
