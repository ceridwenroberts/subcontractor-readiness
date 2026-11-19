# The end-to-end sequence diagram, explained

Companion to `docs/sequence-diagram-end-to-end.md`. The diagram shows one full run: open the app, sign in, create a project, upload, assess, review and decide, then follow-up. This document explains who the lifelines are and what happens in each phase.

## How to read the diagram

- Each vertical line is a **lifeline**: one actor or part of the system.
- Arrows go top to bottom in time order, and `autonumber` numbers them.
- A solid arrow is a call. A dashed arrow is a reply.
- `rect` boxes are phases, `loop` repeats, `alt` is either/or, `opt` is optional.

## Lifelines at a glance

| # | Lifeline | What it is | Trust level |
|---|---|---|---|
| 1 | **Human PM** | The project manager using the browser. | Makes the final decision |
| 2 | **Next.js UI** | Screens. Talks to the backend only through `frontend/lib/api.ts`, cached by TanStack Query. | Untrusted client |
| 3 | **FastAPI backend** | Routes, validation, and the place where everything is wired together. | Trusted |
| 4 | **Session store** | In-memory map from token to simulated user. Lets the server, not the browser, write the name in the decision log. | Trusted, simulated sign-in |
| 5 | **Ingest** | `check_pdf`, text extraction and redaction of personnummer. | Code, deterministic |
| 6 | **data/uploads** | The original PDFs under UUID names. Client file names are never used as paths. | Disk |
| 7 | **SQLite** | Projects, documents (redacted text only), findings, and the append-only decision and request logs. | Trusted |
| 8 | **Orchestrator** | `assess_requirement`: builds the prompt, calls the provider, validates, runs the checks. | Code |
| 9 | **Code checks** | `domain/check_finding`: verifies quotes and dates. Can only weaken a status. | Code, deterministic |
| 10 | **Provider** | One interface, `complete_json`, in front of the scripted or Ollama backend. The only place an LLM is reached. | Boundary |
| 11 | **Ollama model** | The local LLM (`qwen2.5:7b`). No tools. | Untrusted output |
| 12 | **Verifier agent** | A second model call that reads only the requirement and the verified quotes. Can only downgrade. | Untrusted output, bounded |

The pattern to remember: **agents propose** (11, 12), **code verifies** (5, 8, 9), **the human decides** (1).

## Phase by phase

### 0. Opening the app (steps 1 to 5)
The UI checks `GET /health`, then loads templates, projects, expiring documents and open upload requests. The backend reads from SQLite. Expiry tiers are computed from today's date. No model is involved. If the backend is not running, the UI shows that it cannot reach it.

### 1. Simulated sign-in
The PM picks a demo user and the UI sends `POST /session`. The backend stores token to user in the session store and returns the token. Later requests send it as a Bearer token. It is **simulated**: there is no password and no real identity, and the screen says so.

### 2. Create project and subcontractor
`POST /projects` stores a project with a template and a deletion date. `POST /projects/{id}/engagements` adds a subcontractor with a fictional contact address. Requirements come only from `templates/*.json`.

### 3. Upload documents
The PM drops PDFs and can tick which requirements each file is for ("Used for", default "Not sure"). The UI sends multipart files plus tags.

1. The backend checks the file count.
2. For each file (one bad file never blocks the others), `check_pdf` tests the `%PDF-` magic bytes, size, page count and encryption.
3. If invalid or encrypted, that file is rejected with a hint.
4. If valid, text is extracted, personnummer are redacted (with a Luhn check), and warnings are collected (scan suspected, something redacted).
5. The original PDF is stored under a UUID name, and only the **redacted** text goes in the database.

The PM gets one report per file.

### 4. Assess (streamed)
This is the core. `POST /engagements/{id}/assess/stream`.

- No documents: the backend answers 400.
- Otherwise it streams `start`, then one `working` event per requirement (the "Checking requirement 3 of 7" text), then `done`.

For each requirement:

1. **Pick the documents.** `documents_for` returns the files tagged for this requirement plus untagged files.
2. **No document applies:** `no_document_result` records `missing` with the provider label "No model call". No model is asked, so the tool cannot invent a result about something that was not uploaded.
3. **At least one document:** the orchestrator builds the prompt. The document text sits between markers with a random nonce, and the prompt says instructions inside documents are ignored. It calls `complete_json` on the provider, which for Ollama makes an HTTP chat request with no tools.
4. **Validation:** the reply must match the Pydantic schema. If not, one retry with a short note. If still invalid, the result is `unclear` with a note.
5. **Code checks:** `check_finding` looks for each quote on the cited page and checks the dates. The result is `ai_status`, which can only be equal to or weaker than the model's answer. "Found" or "partial" with no verified quote becomes `unclear`.
6. **Verifier (optional):** if the verifier is on and `ai_status` is found or partial, the verifier reads only the requirement and the verified quotes. If it says they do not support the requirement, the status drops to `unclear`. If it gives no valid answer, nothing changes.

At the end:

- A `ProviderError` (for example Ollama is down) returns 503 and **nothing is saved**.
- Otherwise one Finding per requirement is inserted. Older findings are kept. The latest ones go back to the UI.

### 5. Review and decide
- The UI loads the latest finding per requirement, with three separate statuses (`model_status`, `ai_status`, `human_status`) and the provider label.
- Opening a cited quote loads the **redacted** page text and highlights the quote. Optionally "open original" fetches the PDF, and the file path is re-checked as a UUID name.
- The PM decides with `PATCH /findings/{id}` and the Bearer token. The backend:
  - returns **401** if not signed in,
  - returns **422** if the rules in `_check_decision` fail (for example a reason is missing),
  - otherwise appends a `DecisionLog` row with `decided_by` taken from the session, optionally builds a **simulated** email draft and appends an `UploadRequest`, and sets `human_status`.
- The decision history is then loaded. Nothing is ever sent by email.

### 6. Overview and follow-up
- `GET /projects/{id}/overview` combines findings, decisions, requests, documents and tags into one view per subcontractor: requirement statuses, "No document" flags and a glance state. No model call.
- `GET /engagements/{id}/summary` returns counts and lists, with no scores.
- Issues show expiring documents (by tier) and open requests. Reminder drafts are simulated.

### 7. Re-upload after a request
The PM uploads a new document and assesses again. New findings are added, and earlier findings and decisions stay in the log.

## The rules the diagram encodes

| Rule | Where it shows in the diagram |
|---|---|
| Document text is untrusted | Prompt with nonce markers, model has no tools |
| Validate every model output | Pydantic check and one retry, then `unclear` |
| Code can only weaken a status | `check_finding` and the verifier downgrade |
| Quote must exist on the cited page | `Dom` verifies each quote |
| Three separate statuses | Finding carries model, ai and human status |
| Redact before storage | `Ing` runs before `DB` and `Disk` |
| No document means no model call | `no_document_result` branch |
| Decision log is append-only | Only "append" arrows go to the log |
| LLM only through the provider | Only `Prov` reaches `LLM` |
| Simulated things are labelled | Sign-in and email drafts |

## Things the diagram does not show
- The scripted provider replaces the Ollama lifeline in tests and the fallback demo.
- The Anthropic provider is built but opt-in and not used.
- The decision history for a no-document requirement still reads "Evidence not found" (known wording gap).
- Changing a tag affects only the next assessment, since earlier findings keep what they cited.
