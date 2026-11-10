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
