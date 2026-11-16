# Decisions

Each entry: date, decision, reason. Newest at the bottom.

## 2026-11-10: pypdf for PDF text extraction
**Decision:** Use pypdf, wrapped in one function so it can be swapped.
**Reason:** BSD license. PyMuPDF is AGPL, which would constrain the product path.

## 2026-11-10: UI in English
**Decision:** Code, docs, and UI text are in English. Swedish UI is a later roadmap item.
**Reason:** Keeps the one-week scope small. Translation can be added later without changing the data model.

## 2026-11-10: No Anthropic API key for now
**Decision:** Demo and evals use the `scripted` and `ollama` providers. The Anthropic provider stays opt-in and on hold.
**Reason:** No key or budget yet. The provider interface lets it be added later without changing other code. The report will state that no production-quality eval was run.

## 2026-11-10: Three separate status fields per finding
**Decision:** `modelStatus` (LLM answer), `aiStatus` (after code checks), `humanStatus` (PM decision). Never copied into each other.
**Reason:** They answer different questions: what the model said, what the evidence supports, what the human decided. Keeping them apart makes the audit trail honest and shows where code checks overruled the model.

## 2026-11-10: SQLite via SQLAlchemy for v1
**Decision:** One SQLite file in `data/` (gitignored). Postgres later.
**Reason:** No server to run for a local demo. SQLAlchemy keeps the move to Postgres small.

## 2026-11-10: Ollama setup deferred
**Decision:** Skip installing Ollama and pulling a model on day 1. The `scripted` provider covers development until the Ollama provider slice. Install it before that slice (day 3), ideally starting the download in the background earlier.
**Reason:** Download time. Nothing before the Ollama provider slice needs a real model.

## 2026-11-10: Python 3.15 for the backend
**Decision:** Use the installed Python 3.15.2 for `backend/.venv`. Dependencies are pinned in `backend/requirements.txt`.
**Reason:** Already installed, so no extra download. All approved packages installed from prebuilt wheels on 3.15 with no compiling. Fallback if a later package lacks 3.15 support: install 3.12 and rebuild the venv from `requirements.txt`.

## 2026-11-10: Add httpx2 for the test client
**Decision:** Add `httpx2==2.16.0` (BSD-3, same author as httpx, maintained under the pydantic GitHub org). Starlette's `TestClient` imports it in preference to `httpx`. Keep `httpx` for the Ollama provider for now.
**Reason:** Starlette 1.10 shows a deprecation warning when its test client runs on `httpx`. Switching now removes the warning before support for `httpx` is dropped. Verified it is the package Starlette's own code imports, not a lookalike.

## 2026-11-10: ESLint for the frontend
**Decision:** Keep the ESLint setup that `create-next-app` generates (`eslint`, `eslint-config-next`). `npm run lint` runs ESLint, then `tsc --noEmit`.
**Reason:** `check.sh` expects a frontend lint step, and ESLint catches React mistakes (hook rules) that the type checker misses. `npm audit` reports moderate issues (a minimatch ReDoS) in the dev-only ESLint chain. The suggested fix downgrades `eslint-config-next` to 15, so it is not applied. Recheck when Next updates.

## 2026-11-10: @tailwindcss/turbopack for Tailwind
**Decision:** Keep `@tailwindcss/turbopack`, which `create-next-app` generates to load Tailwind CSS in Next's Turbopack bundler.
**Reason:** It is part of the already-approved Tailwind, published by the Tailwind team, and is how Next 16 wires Tailwind in. Recorded separately because it is its own package.

## 2026-11-10: Upload checks are strict and run cheapest first
**Decision:** `app/ingest/upload.py` checks, in order: empty file, size, `%PDF-` at byte 0, then pypdf parsing, encryption, page count. Any encrypted PDF is rejected, including ones that open with an empty password. Any pypdf exception becomes `unreadable`. Files are written with mode `"xb"` under `<uuid4>.pdf`. These are plain functions; the HTTP endpoint comes with Stage 4.
**Reason:** Size before parsing means a huge file never reaches the parser. The PDF spec allows the header anywhere in the first 1024 bytes, but real PDFs start with it, and strict is safer for untrusted input. Made overnight on `stage-2-overnight`, pending review.

## 2026-11-10: Redaction errs on the side of redacting
**Decision:** `app/ingest/redact.py` redacts any 10- or 12-digit number shaped like `(CC)YYMMDD[sep]NNNN` whose month is 01-12 and day is 01-31 (personnummer) or 61-91 (samordningsnummer). Separators: none, `-`, `+`, PDF dash look-alikes, or one whitespace character including a line break. The Luhn checksum and calendar validity are not required. Matches become `[PERSONNUMMER]` or `[SAMORDNINGSNUMMER]`.
**Reason:** A mistyped personal number is still personal data, so requiring the checksum would let some through. The month check alone keeps org numbers safe (their "month" is 20 or higher). The known cost: date-shaped 10-digit numbers, such as some phone numbers, are redacted too. Hiding one number too many is the safer mistake. Made overnight on `stage-2-overnight`, pending review.

## 2026-11-10: Eval packets are generated, committed, and checked
**Decision:** `evals/make_packets.py` (fpdf2, dev only) writes each packet to `evals/packets/<name>/` as PDFs plus `expected.json` (`template`, `description`, `expected` status per requirement code, `expectedRedactions`). Output is deterministic, and the generated PDFs are committed. A test regenerates them and fails if the committed files differ. Every page is stamped "SYNTETISKT TESTDOKUMENT". `check.sh` now lints `evals/` as well as `backend/`.
**Reason:** Committed packets make eval runs reproducible without running the generator first. The regeneration test keeps the generator as the single source of truth. Where `evals/run.py` lives (CLAUDE.md shows both `evals/` and `cd backend && python -m evals.run`) is left for the Stage 6 slice. Made overnight on `stage-2-overnight`, pending review.

## 2026-11-11: Redaction marks uncertain cases and asks a person to check
**Decision:** Updates the 2026-11-10 redaction decision. A standard-layout number with a valid Luhn checksum becomes `[PERSONNUMMER]` or `[SAMORDNINGSNUMMER]`. One with a wrong checksum is still hidden, but as `[POSSIBLE PERSONNUMMER]`, and noted as uncertain. An unusual layout (`800101 12 31`) is hidden as possible only if the checksum is valid; otherwise it is left alone (most likely a phone number such as `070-123 45 67`). A number split across a page break is hidden and noted. `redact_pages` returns notes `{page, kind, count}`. The Document model gets `redactionNotesJson` (approved by the developer, built in Stage 4) so the UI can say "check the original document" (Stage 5).
**Reason:** The developer pointed out that phone numbers matter to PMs. They stay available in the original PDF, and they aren't evidence for any requirement, so hiding them from the model costs nothing. The marker `[PERSONNUMMER]` on a phone number was misleading, though, and the PM should know when the tool was unsure. Notes never hold the number itself.

## 2026-11-16: Presentation moved to Thursday; framed as an orchestrated agent system
**Decision:** The assignment asks for one or many agents that achieve a business outcome. The project is framed as an orchestrated agent system: an Assessor agent proposes a status with quotes, code guardrails in `domain/` verify and can only weaken, a Verifier agent can only downgrade to `unclear`, and the PM decides. The Stage 7 verifier moves into scope. Presentation is Thursday 2026-11-19, which replaces the 2026-11-17 deadline.
**Reason:** One LLM call per requirement is a pipeline, not an agent. Orchestration (Assessor plus Verifier plus code checks plus human) is the part the assignment asks for, and it was already designed as a safe pattern. The Verifier is kept only if evals show a benefit; the result gets logged either way.

## 2026-11-16: Ollama is now required for the demo
**Decision:** Supersedes the 2026-11-10 "Ollama setup deferred" decision. The Thursday demo runs on the `ollama` provider, labeled "Local model". `scripted` stays as the test and fallback provider.
**Reason:** A real agent needs a real model, and simulated behaviour must not be presented as real. Results are reported as "local model, not representative of production quality". The Anthropic provider stays on hold (no key).

## 2026-11-16: Scope cuts for the Thursday demo
**Decision:** Cut the Anthropic provider, the summary screen (unless time remains), and extra packets beyond the existing 3 (except to cover a missing injection, expired or personnummer case). Stage 4 and 5 are built thin: only the endpoints and screens the demo needs. Redaction, upload checks, quote verification, status rules, DecisionLog, provider labels and the placeholder banner are not cut.
**Reason:** About 3.5 working days remain and Stages 3 to 6 were not started. Security and verification are the point of the project.

## 2026-11-16: OCR for scanned PDFs is not built for the Thursday demo
**Decision:** No OCR in v1. A PDF page with no text layer gets a visible warning ("No readable text found on page N. This may be a scan. Text from scans is not supported yet, so requirements may show as not found."). OCR is the first roadmap item after the school version.
**Reason:** It needs 2-3 new dependencies (Tesseract with the Swedish pack, a PDF page renderer, a Python wrapper) and about half a day, and `CLAUDE.md` lists OCR as not in v1. When built it must run locally and before redaction: sending page images to a hosted model would expose personnummer before they can be redacted, which breaks the hard rule that only redacted text goes to a model.

## 2026-11-16: Demo model is qwen2.5:7b with prompt assess-v2
**Decision:** Use `qwen2.5:7b` via Ollama as the demo model, with `PROMPT_VERSION = "assess-v2"`. The 3B model is kept only for quick plumbing tests.
**Reason:** On packet 03 the 3B model got 0 of 7 right, the 7B model with v1 got 3 of 7, and with v2 got 6 of 7. No false `found` in any run. A likely cause of the early misses was the language mismatch (English requirements, Swedish documents), which v2 addresses by asking for matching on meaning. Single runs, labeled "local model, not representative of production quality". Cost: about 8 seconds per requirement.

## 2026-11-16: Verifier agent is on by default, behind VERIFIER_ENABLED
**Decision:** After the code checks, a `found` or `partial` finding goes to a second model call (`verify-v1`) that sees only the requirement and the verified quotes. It can only downgrade to `unclear`. If it returns no valid answer after one retry, the finding is left unchanged and a note says so. `VERIFIER_ENABLED=false` switches it off for the with/without comparison. No data model change: the reason is appended to the finding's notes.
**Reason:** Quote verification proves a quote exists, not that it supports the requirement. Packet 04 showed the 7B model quoting an injected sentence as evidence, and only the expiry rule happened to catch it. Kept pending eval numbers: per the plan, if the with/without comparison shows no benefit it is removed, and the result is logged either way. Cost: one extra model call per found or partial finding.

## 2026-11-16: evals/run.py runs as a script from the project root
**Decision:** The eval runner is `backend/.venv/bin/python evals/run.py` (run from the project root), not `cd backend && python -m evals.run`. It adds `backend/` to `sys.path` itself. `CLAUDE.md` is updated to match. Flags: `--runs N`, `--verifier on|off|both`, `--packets ...`. Results go to `evals/results/<date>_<provider>_<model>_<prompt versions>.json` and are committed so the report can cite them.
**Reason:** The packets, the generator and the results all live in `evals/` at the project root, and the runner is not part of the app. Settling the location that the 2026-11-10 packet decision left open. Repeated runs are built in because two runs of the same prompt on the same packet gave different answers.
