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
