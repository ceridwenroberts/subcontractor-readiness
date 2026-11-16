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

## 2026-11-16: Keep the verifier on, but do not claim it improved the numbers
**Decision:** Keep `VERIFIER_ENABLED=true`. The eval (3 runs per setting, `qwen2.5:7b`) showed no measurable difference: false `found` was 0 with and without it, and the accuracy ranges overlap (79-89% without, 82-93% with). It adds about 30% run time. Report this plainly.
**Reason:** The plan said to keep it only if the numbers show a benefit. They do not, but the baseline false `found` was already zero because the assessor was not swayed in these runs, so the packets could not show a difference. The direct probe shows the verifier catches what quote verification cannot (12 of 12 injected or vague quotes rejected, 4 of 4 real quotes accepted, 2 of 2 mismatched pairs rejected). It is cheap insurance and it only weakens. More packets where the assessor is actually fooled would be needed to measure a benefit.

## 2026-11-16: Four changes from the developer's review of the UI
**Decision (developer's answers):**
1. **Document viewer with highlights: build it as a redacted-text viewer.** This amends the hard rule "never expose document text to the frontend": the frontend may receive *redacted* page text for the review screen (never original text, never keys). The viewer highlights the cited quote and links to the original PDF at that page. `CLAUDE.md` is amended in the same slice as the code.
2. **Decision-log name from a simulated sign-in.** The server records the name from the session, not from the request. Labeled Simulated. Real authentication stays on the roadmap ("Not in v1" otherwise unchanged).
3. **Data deletion date: add `delete_after` to Project** with a labeled placeholder recommendation (not legal advice) and an overdue banner. No deletion is built. **Note, open:** a purge (manual or automatic) needs a decision on how it interacts with the append-only DecisionLog, which holds PM comments and names, and on whether original PDFs, stored text and findings are removed together. Roadmap item.
4. **Personnummer opt-in/out: not built.** Redaction stays always on.
**Reason:** The viewer is the main way a PM can check a finding, so it is worth a narrow rule change. A server-decided identity is the correct architecture for the audit log even before real login exists. A deletion date states the retention intent without the unresolved audit-log question. Weakening redaction is the riskiest change and the least needed for the demo.

## 2026-11-16: Known privacy gaps to state in the report
**Names are not redacted.** Only personnummer and samordningsnummer are. People on certificates are identified by name text only, and the tool never links a person across documents. Names are personal data and go to the model. An opt-in for personnummer (if ever built) should apply to local models only, with a stated justification, and names need their own decision.

## 2026-11-16: Assessment shows progress by streaming; UI notes from the developer's review
**Decision:** `POST /engagements/{id}/assess/stream` reports `start`, a `working` event before each requirement, then `done` or `error` as newline-delimited JSON. The page shows "Checking requirement 3 of 7: <title>" and a progress bar. The plain `/assess` endpoint stays. Findings are still saved only after every requirement finishes. Small UI fixes made with it: a confirmation after a decision is recorded, no pre-selected choice unless the documents show evidence, and a neutral "Choose a status…" placeholder.
**Reason:** A one to two minute wait with no sign of life looks like a freeze.

## 2026-11-16: Notes for later (developer's UI review), not built yet
- **Optional "reviewer must open the document before confirming"** (a project setting). Needs a record that a signed-in reviewer opened that document, so it is a data-model change and waits for a decision.
- **Confirming the shown result should not require a comment**; a comment stays required when the reviewer changes the result.
- **Request a new upload by email**, **a dashboard of documents that need a new upload**, and **rejection reasons**. Wording rule: the UI says "needs a new upload" and "documents do not show evidence", never "failed" or "does not pass" (CLAUDE.md bans verdict words). Email is not in v1, so any email is SIMULATED: a draft is recorded and shown, and nothing is sent.

## 2026-11-16: Request a new upload, with a simulated email and a dashboard
**Decision:** A reviewer can ask the subcontractor for a new upload when the recorded status is not `found`, choosing a reason (expired, wrong document type, unreadable or a scan, information missing, other). Optionally an email is requested: it is SIMULATED, so a draft (to, subject, body) is built and stored and shown as "Simulated, nothing was sent". New: `engagements.contact_email` (reserved fictional domains only, such as .example, .test, example.com) and an append-only `upload_requests` table linked to the decision. The home page lists open requests (project, subcontractor, requirement, reason, whether an email draft was recorded, link). A request is open while its decision is still the latest decision for that requirement in that engagement, so a later decision that does not ask for a new upload closes it, and re-assessing alone does not. Wording: "Needs a new upload", never "failed" or "does not pass". A comment is now optional only when the reviewer confirms the shown result; it stays required when changing the result or requesting an upload.
**Reason:** The developer asked for it after reviewing the UI. Nothing leaves the machine, and a real address cannot be stored, which keeps the "synthetic data only" and "never present simulated behavior as real" rules. Real sending needs an email service, consent and approved templates. Tying the request to a decision gives a clear closing rule without a separate status to maintain. Relaxing the comment on confirm weakens the audit record slightly, by the developer's choice; changes and requests still carry a reason.

## 2026-11-16: Refuse unknown Host headers (found by the security review)
**Decision:** Add `TrustedHostMiddleware` with `ALLOWED_HOSTS` (default `localhost` and `127.0.0.1`; wildcards and empty lists are rejected at startup). Tests add `testserver` through `tests/conftest.py`, so the shipped default stays strict.
**Reason:** The `/security-review` found that binding to 127.0.0.1 plus CORS does not stop DNS rebinding: a web page whose domain is re-pointed at 127.0.0.1 is same-origin to the browser, so CORS never applies. It could read documents (including the original PDFs served by the new viewer endpoint) and get a sign-in token with no credentials. Rejected requests get no CORS headers. This does not replace real authentication, which is still required before any non-local use.

## 2026-11-16: Read the expiry date from a verified quote when the model gives none
**Decision:** For requirements that expire, if the model gave no `valid_until`, `check_finding` uses the date written in the verified quotes, but only if they contain exactly one distinct date in YYYY-MM-DD form (real calendar dates only). With two or more different dates, or none, the finding stays `unclear` with a note, because the code cannot tell which date is the expiry. A date the model did give must still be inside a verified quote. Dates in unverified quotes are never read. The final guard that code may only weaken a status is unchanged. The old test `test_expiring_requirement_without_date_becomes_unclear` asserted the previous rule and was replaced on purpose with tests for the new cases.
**Reason:** The first real eval showed `qwen2.5:7b` quoting the right sentence but leaving the date field empty, so correct `found` answers were downgraded to `unclear` (model alone 93-96% accurate, final status 82-86%, none of the `unclear` results correct). The date is already in the verified quote, so using it loses no safety. Risk accepted: a real quote that contains one future date but does not support the requirement can now stay `found` on an expiring requirement. The verifier is the guard for that, and the eval after this change checks that false `found` stays at zero.

**Approval note (2026-11-16):** The developer approved this change before the post-change eval numbers were available, on the reasoning above: the date is already inside a verified quote, so reading it in code loses no safety, and the verifier remains the guard for a real quote that does not support the requirement. The approval is conditional on the eval: if the 3-run `qwen2.5:7b` comparison (verifier on) shows any false `found`, or accuracy that is not higher than the earlier 82-93%, this change is to be reverted or tightened, and the result recorded here either way. Result: pending, see the entry below once the run finishes.
