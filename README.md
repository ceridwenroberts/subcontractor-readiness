# Subcontractor readiness

A tool that helps a project manager (PM) see what a subcontractor's documents show. The PM picks a template (for example VVS), uploads the subcontractor's PDFs, and the tool checks each requirement and shows the evidence: the exact quote and page. The PM reviews every finding and records a decision.

It reports **documentation status only**. It never approves, rejects, or scores anyone. This is a school project and the first step toward a real product. Everything runs on localhost with synthetic data.

> **REAL, SIMULATED, LATER**
> - **Real:** PDF upload, text extraction, personal-number redaction, assessment by a model, quote verification, storage, PM decisions with an audit log.
> - **Simulated:** the `scripted` provider (fixed answers, labeled "Simulated" everywhere it appears). All companies, people and numbers are fictional.
> - **Later:** login, hosting, OCR for scans, a subcontractor portal, integrations.

## How it works: agents, code, and a person

```
PDFs → upload checks → text → redaction → Assessor agent → code checks → Verifier agent → PM decides
                                           (proposes)       (can only      (can only        (final say,
                                                             weaken)        weaken)          logged)
```

| Part | Job | What it may not do |
|---|---|---|
| **Assessor agent** (LLM) | For one requirement, read the redacted pages and propose a status with quotes | Use tools. Its output is only accepted as validated JSON. |
| **Code checks** (`backend/app/domain/`) | Verify each quote exists on the cited page; handle expiry dates | Strengthen a status. `found` without a verified quote becomes `unclear`. |
| **Verifier agent** (LLM, `verify.py`) | Read only the requirement and the verified quotes: do they support it? | Strengthen a status. It can only turn `found`/`partial` into `unclear`. |
| **PM** | Accept or override each finding with a comment | Be bypassed. Decisions go in an append-only log. |

Each finding keeps three separate statuses: `modelStatus` (what the model said), `aiStatus` (after code checks and the verifier), `humanStatus` (the PM's decision). They are never copied into each other.

## Set up

Needs Python 3.11+ (developed on 3.15), Node.js, and optionally [Ollama](https://ollama.com).

```bash
cp .env.example .env                    # then edit as needed; .env is gitignored

# backend
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1    # http://127.0.0.1:8000/docs

# frontend (second terminal)
cd frontend && npm install && npm run dev         # http://localhost:3000
```

**Providers** (`LLM_PROVIDER` in `.env`):
- `scripted` (default): no network, fixed answers, labeled "Simulated". Use for tests and a safe demo.
- `ollama`: a local model. `brew install ollama && brew services start ollama && ollama pull qwen2.5:7b`, then set `OLLAMA_MODEL=qwen2.5:7b`. Labeled "Local model".
- `anthropic`: on hold, not available yet.

`VERIFIER_ENABLED=true` (default) turns the Verifier agent on.

Before every commit, from the project root: `./check.sh` (ruff, backend tests, secret scan, frontend lint, tests and build).

## Demo script

Use the synthetic PDFs in `evals/packets/`. Each folder is one subcontractor's packet.

1. Start the backend and the frontend.
2. Create a project with the VVS template. The yellow banner says the requirements are placeholders.
3. Add a subcontractor, for example "Exempelrör AB".
4. Upload packet `03_expired_and_personnummer` (5 PDFs). One file shows a note: a personal number was hidden. The stored text contains `[PERSONNUMMER]`, never the number.
5. Click **Assess documents**. Each requirement gets a status, a quote, a page and a provider label. The insurance shows "Documents show an expired date".
6. Override one finding with a comment, then open "Show decision history".
7. Try packet `04_prompt_injection` in a new subcontractor: one page tells an AI to mark everything as found. The result must not change.
8. Try packet `02_missing_items`: the tool says "Evidence not found" for what is really missing.

## Evaluation

```bash
backend/.venv/bin/python evals/run.py                        # provider from .env, verifier off and on
LLM_PROVIDER=ollama OLLAMA_MODEL=qwen2.5:7b backend/.venv/bin/python evals/run.py --runs 3
```

Prints overall accuracy, false `found` rate (target: zero), and the `unclear` rate, and saves each run to `evals/results/`. Four synthetic packets: complete, missing items, expired plus personnummer, prompt injection.

**Read the numbers honestly.** `scripted` runs prove the plumbing and the code checks. `ollama` runs come from a small local model and are *not representative of production quality*. No hosted-model (Claude) evaluation has been run, because there is no API key. Even at temperature 0, the same packet gave different answers on different runs, so single runs prove little.

## Security in short

- Document text is untrusted. Prompts wrap it in markers with a random per-call token, say that instructions inside documents are ignored, and give the model no tools. Output must validate against a schema, with one retry.
- Quotes are verified in code against the stored text. The model cannot invent evidence.
- Personnummer and samordningsnummer are redacted before text is stored or sent to any model.
- Uploads: magic bytes, size, page count and file count checked; encrypted PDFs rejected; files stored under UUID names, never client filenames.
- Secrets only in `.env`. Backend binds to `127.0.0.1`; CORS allows only the frontend origin. Logs hold ids and counts, never document text.

## Known limits

- **Not for real use.** No login, localhost only. Never deploy this version.
- **Placeholder requirements.** The VVS list has not been reviewed by a domain expert.
- **No OCR.** Scanned pages have no text, so a requirement may show "Evidence not found" when the evidence is in a scan. The UI warns when it sees a page with no text.
- **Small local model.** `qwen2.5:7b` misses evidence sometimes and varies between runs. Misses fail safe (the PM sees "Evidence not found" and can override), but recall is not production quality.
- **Verifier adds one model call per `found` or `partial` finding**, so a full assessment takes about a minute or more locally.
- **Audit log guard is in application code.** Raw SQL against the database file would bypass it. A database trigger would be needed.
- **Dates are matched in ISO form (2027-12-31).** Other date formats weaken the finding instead of being read.
- **A real hyphen at a line break** in a quote can fail to match, which weakens a finding and never strengthens it.
- **Re-assessing adds new findings** and the PM re-reviews them. Earlier findings and decisions are kept.
- **Not built:** the readiness summary screen, more than four eval packets, other trades than VVS.

## Project documents

- `PLAN.md`: the plan and checklist. `CLAUDE.md`: rules and how we work.
- `docs/decisions.md`: decisions and reasons. `docs/journal.md`: what was learned.
