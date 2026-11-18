# CLAUDE.md

Read this at the start of every session. `PLAN.md` has the full plan and the checklist. This file has the rules and the way we work.

## Project in one paragraph

A subcontractor readiness tool. A PM picks a template (for example VVS), uploads a subcontractor's PDFs, and the backend assesses each requirement with an LLM. Code then verifies the evidence, and the PM reviews and decides in a web UI. It is a one-week school assignment (deadline 2026-11-17) and the first step toward a real product. The developer is learning while building, so explaining the work matters as much as producing it.

## Hard rules

### Product
- Report documentation status only. Use "documents show", "evidence not found", and "needs human review". Never use "approved", "compliant", "qualified", "pass", "fail", or any score.
- Each finding has three separate statuses: `modelStatus` (the LLM's answer), `aiStatus` (after code checks), and `humanStatus` (the PM's decision). Never copy one into another.
- Code checks may only weaken a status, never strengthen it.
- `found` and `partial` need at least one quote that verifies against the stored page text. Otherwise the status becomes `unclear`. This rule lives in `backend/app/domain/`, not in a prompt.
- Requirements come only from `templates/*.json`. Never generate or hardcode them.
- Show the provider label (Simulated, Local model, or Claude) on every finding. A requirement with no uploaded document gets the label "No model call", because no model was asked (added 2026-11-18, see `docs/decisions.md`). The demo-build banner must say the requirements are a placeholder while a template has `reviewedBy: null` (changed 2026-11-18, see `docs/decisions.md`).
- `DecisionLog` is append-only.

### Security
- **Document text is untrusted input.** Prompts wrap it in clear delimiters and state that instructions inside documents are ignored. The model gets no tools, and its output can only become a validated finding.
- **Validate every LLM output** with Pydantic. Retry once on invalid output, then record `unclear` with a note.
- **Redact personnummer and samordningsnummer** in `backend/app/ingest/redact.py` before text is stored or sent anywhere. Only redacted text goes in the database or to a model. Do not bypass or weaken this.
- **Uploads:** check `%PDF-` magic bytes, size, page count, and file count, with limits read from config. Reject encrypted PDFs. Store files under a UUID name in `data/uploads/`. Never use a client filename as a path.
- **Secrets** live only in `.env` (gitignored). Read all keys, model names, and URLs from environment variables. Never log keys or document text; log ids and counts.
- The backend binds to `127.0.0.1`. CORS allows only the frontend origin. v1 has no real auth (only a simulated sign-in), so it must never be deployed.
- LLM calls happen only in the backend, only through `backend/app/providers/`. Never call an SDK from feature code. Never expose keys to the frontend. The frontend may receive only *redacted* page text (for the review viewer) and, through the explicit "open original" link, the uploaded PDF; document text is never logged or sent to any other service. (Amended 2026-11-16, see `docs/decisions.md`.)
- The Anthropic provider is opt-in (`LLM_PROVIDER=anthropic`). Never switch to it on your own.
- **Synthetic data only.** No real companies, people, org numbers, or documents. If something looks real, stop and ask.

## Layout

```
backend/app/   main.py, config.py, models.py, templates.py, assess.py, summary.py,
               ingest/, domain/, providers/, db/, routes/
backend/tests/
frontend/      Next.js app (screens only)
templates/     requirement JSON, one file per trade
evals/         packets/, run.py, results/
docs/          decisions.md, journal.md
data/          uploads and SQLite (gitignored)
```

`domain/` stays free of LLM, HTTP, and database code.

## Commands

```bash
# backend
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1   # http://127.0.0.1:8000/docs
pytest

# frontend
cd frontend
npm run dev                                       # http://localhost:3000
npm test

# evals
backend/.venv/bin/python evals/run.py            # from project root; uses LLM_PROVIDER; --runs 3 --verifier both

# before every commit, from the project root
./check.sh

# on a UI redesign branch, also (see "UI redesign boundary")
./check_ui_boundary.sh main
```

Providers: `LLM_PROVIDER=scripted` (default, tests and demo), `ollama` (with `OLLAMA_MODEL`, `OLLAMA_URL`), or `anthropic` (with `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`).

## How we work

The developer wants to follow along and learn, so every slice is explained, not just built.

**Ordinary slice** (doesn't touch security, the data model, or a prompt):
1. Build it — keep the slice small, ideally under about 150 changed lines, touching only the files the goal requires. Write tests for deterministic logic first.
2. Run the check. If it fails, explain the cause before changing code. Never edit a test just to make it pass.
3. Show `git diff --stat` and explain in plain language what changed, why, and one thing worth understanding. Suggest a commit message and a one-line `docs/journal.md` entry, then commit and tick the box in `PLAN.md`.

**Slice that touches security, the data model, or a prompt:**
State the goal and the files you'll touch, then wait for "go" before building. Build and check as above. Before committing, show the diff and explain it, then wait for "approved" before running `./check.sh`, committing, and ticking `PLAN.md`.

Also:
- **Ask before** adding a dependency not listed in `PLAN.md` section 6, changing a hard rule, changing the data model, or doing anything outside the slice.
- Log real decisions (ones that could've gone another way, or that reverse an earlier choice) in `docs/decisions.md` (date, decision, reason) and update `PLAN.md`. Routine implementation choices don't need a log entry.
- When a prompt changes, bump its `PROMPT_VERSION` and re-run the evals before committing.
- Keep working in one session across slices rather than clearing each time; this file, `PLAN.md`, and `git log` are there if context ever needs refreshing. Suggest `/code-review` and `/security-review` once near the end of the project, or sooner if a stage felt risky.
- Keep an eye on the deadline. If the work is falling behind the daily targets in `PLAN.md`, say so and suggest what to cut. Never cut security or verification.

## Conventions

- Python: type hints everywhere, Pydantic models for every data shape, `def` (not `async def`) for endpoints that call an LLM, and ruff for lint.
- TypeScript: strict mode, no `any`, zod at every API boundary.
- Frontend layout must be responsive — every screen works on mobile, tablet, and desktop widths, not just desktop.
- Code, docs, and UI text are in English.
- Prompts live in one place per feature, with a `PROMPT_VERSION` constant.
- Test deterministic logic with unit tests. Test LLM behavior with evals.

## UI redesign boundary

A design or layout tool (or an AI) may redesign the screens. It must not touch the logic layer. Brief it with `docs/ui-handoff.md` and `docs/ui-states.md`; sample data is in `docs/ui-fixtures/`.

- **Protected, never changed in a redesign:** `backend/`, `templates/`, `evals/`, `frontend/lib/` (API client, zod schemas, wording, `decisionForm.ts`, `forms.ts`, `theme.ts`, `queries.ts`, sign-in token, highlighter and their tests), `frontend/package.json`, `frontend/package-lock.json`, `check.sh`, `check_ui_boundary.sh`, `CLAUDE.md`, `PLAN.md`.
- **Editable:** markup and styling in `frontend/app/**/page.tsx`, `frontend/app/layout.tsx`, `frontend/components/`, `globals.css`.
- The UI calls the backend only through `frontend/lib/api.ts`. No `fetch`, browser storage, `NEXT_PUBLIC_` values, `dangerouslySetInnerHTML` or `any` in `app/` or `components/`. The decision form must keep using `lib/decisionForm.ts`; its rules are never re-implemented in a component.
- Product rules still apply to every screen: no verdict words or scores, the provider label on every finding, the demo-build banner (which carries the placeholder notice), the Simulated notices, the disclaimer, three separate statuses, and model detail kept quiet and collapsed.
- Work on a branch (for example `ui/redesign`). Before merging, `./check_ui_boundary.sh main` and `./check.sh` must both pass. If a tool changed a protected file, revert that file instead of adjusting the test or the script.
- A change to a protected file is a normal slice, with its own goal, tests and approval, never part of a redesign.

## Not in v1

Real authentication (only the SIMULATED sign-in exists: it sets the name in the decision log from a server-side session), email or any other outbound message (the request-a-new-upload email is only a SIMULATED draft: it is recorded and shown, never sent), deployment, subcontractor portal (except the SIMULATED demo page), OCR, ID06 or other integrations, staff monitoring, subcontractor chains, automatic approval, and multi-agent pipelines outside the Stage 7 experiment. Never present simulated behavior as real.
