# Plan: tag each uploaded document with the requirements it is for

Status: built 2026-11-18 (tag `document-tagging` marks the commit, `before-document-tagging` the start). Phases B to D of the several-requirements plan are not built.

## Why
Today every requirement is checked against every uploaded document. Upload two PDFs and the assessment still runs seven requirement checks, and the five with no evidence count as "missing". The PM thinks in documents ("the tax certificate"), the tool thinks in requirements. Tagging joins the two and means no model call is spent on a requirement that has no document.

## Rules
1. A document has a list of requirement codes (its tags), chosen by the PM. One tag is the normal case. Several tags is how one PDF covers several requirements (see the multi-requirement section).
2. A requirement is assessed only against documents tagged for it, plus **untagged** documents. An untagged document means "not sure" and is used for every requirement, so today's behaviour and the evals stay unchanged.
3. A requirement with no document (none tagged, none untagged) gets **no model call**. Code writes a `missing` finding with the note "No document was uploaded for this requirement." and the provider label "No model call", so the three-status model and the provider label rule still hold.
4. Tags can be changed later. A changed tag affects the next assessment only. Earlier findings keep the documents they cited.
5. Tags are never used as evidence: the quote check and the verifier are untouched. A tag only decides which pages the assessor is shown.
6. The assessor prompt does not change, so `PROMPT_VERSION` stays `assess-v2`. The evals must still run to show that untagged behaviour is identical.

## Build (one protected slice)
**Backend**
- `backend/app/db/models.py`: nullable JSON column `documents.requirement_codes` (a list of codes, empty or null = untagged). Not append-only: tags are editable.
- `backend/app/db/session.py`: add the column to the startup migration list.
- `backend/app/assess.py`: `documents_for(requirement, documents)` (tagged for it, plus untagged) and `no_document_result(requirement)`.
- `backend/app/routes/findings.py`: `/assess` and `/assess/stream` pick documents per requirement. A requirement with no documents skips the provider. The stream still reports every requirement ("Checking requirement 3 of 7", with "no document" for skipped ones).
- `backend/app/routes/documents.py`: upload accepts tags per file (a JSON list aligned with the files), `DocumentOut` returns `requirement_codes`, and `PATCH /documents/{id}` sets them. Codes are validated against the project's template.
- Tests: document selection, a skipped requirement makes no provider call (counting provider calls), an unknown code is rejected, untagged behaves as before, the migration adds the column to an existing database.

**Frontend, protected (`lib/`)**
- `schemas.ts`: `requirement_codes` on documents. `api.ts`: tags on upload, `updateDocumentTags`. Tests for both.

**Frontend, UI**
- Upload queue: a requirement picker per file (multi-select, default "Not sure, check all"). A "Needs a document" row's Upload button preselects that requirement.
- Documents tab: "Used for: VVS-01, VVS-03" with an Edit control and a short line that changing it applies to the next assessment.
- Requirements table: a row with no document says "Needs a document", with an Upload button.
- The assess button says how many requirements will be checked ("Assess 2 of 7 requirements, 5 have no document").

## Checks before commit
Backend and frontend tests, `./check.sh`, the boundary check, the scripted evals (`python evals/run.py`, accuracy must equal the earlier scripted run), and a manual run: upload two documents tagged to two requirements, assess, and confirm five requirements show "Needs a document" with no model call.

## Risks
- A wrong tag hides the right evidence from the assessor and gives a false `missing`. It fails safe (the PM sees "Not found" and can check), but the picker should show the document name and the requirement title so the choice is easy to check, and "Not sure" must stay the default.
- Existing documents have no tags, so they stay untagged and nothing changes until a PM edits them.

---

# Plan: several requirements in one PDF

One PDF often holds several certificates (for example insurance and tax on separate pages). Tagging already allows this, because a document can have several tags. What is added on top, in order:

1. **Phase A, in the tagging slice (no extra work):** tag one PDF with several requirements. Each of those requirements is assessed against the whole PDF. This is correct but reads more pages than needed.
2. **Phase B, page ranges per tag:** a tag becomes `{code, pages}` (for example VVS-02 on pages 1-2, VVS-03 on pages 3-4). The assessor sees only those pages for that requirement, which is faster, cheaper and cuts the chance of a quote from the wrong certificate. Needs a second small migration, a page-range input in the picker (with a viewer preview of the pages), tests that pages outside the range are never sent to the provider, and a check that the quote verifier still looks up the page in the full stored text. Still no prompt change.
3. **Phase C, suggested tags (optional):** a first model call reads each page and suggests which requirement it belongs to, shown as a pre-filled picker the PM confirms. This is a new prompt (new `PROMPT_VERSION`), needs evals with a multi-certificate packet, and the suggestion is never used without the PM confirming it, since a wrong automatic tag would hide evidence. It matches the "document type suggestion" item in the later list in `PLAN.md`.
4. **Phase D, split a PDF into separate documents (only if needed):** cut the original into several stored documents so each has one tag. Needs a PDF writer, a decision on what happens to the original file and its retention date, and more privacy review. Phase B gives most of the benefit without this.

Recommended order: A now, B after the presentation, C only if evals show it helps, D probably never.

Test data needed for B and C: an evals packet with one PDF holding three certificates, with expected statuses per requirement.
