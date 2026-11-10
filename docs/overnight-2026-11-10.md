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
