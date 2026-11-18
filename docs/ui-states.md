# UI states and logic

Every screen, the states it can be in, what must be on it, and the rules behind it. Companion to `docs/ui-handoff.md`. Sample data for each state is in `docs/ui-fixtures/`.

Conventions: "required" means the element must stay (restyle and move it freely). All screens are client components that load data through `frontend/lib/api.ts`.

## Layout (from the Figma)

A left sidebar on wide screens (a slide-over menu behind a menu button on narrow ones): product name, **Workspace** navigation (Dashboard, Projects, Issues with a count badge), then at the bottom the **Model details** switch, the theme button, the "Documentation status only…" line, and the simulated sign-in card. Every page has a title band (title, subtitle, page actions) above a content area. Creating a project or adding a subcontractor opens a dialog; uploading opens a dialog; reviewing a requirement opens a panel from the right.

## Navigation map

```
/                                  Dashboard: overview numbers, projects needing attention
/projects                          All projects, with search
/issues                            Issues: expiring document dates, requests waiting for a new upload
/projects/[projectId]              Project: numbers, tabs Subcontractors and Requirements
/engagements/[engagementId]        Subcontractor: upload, assess, status, tabs Overview, Documents, Requirements, History
/engagements/[engagementId]/summary  Documentation summary
/documents/[documentId]?page=&quote=  Document viewer (redacted text, quote highlighted)
```

Not in the Figma because the data does not exist: project codes, per-project document totals, trade, company number, phone, notification bell, global search, help card, "approved" document states, percentages. Do not invent them.

## Tagging documents (2026-11-18)
Each uploaded file has a "Used for" choice: nothing ticked means "Not sure, check all requirements" (the default); ticking several is how one PDF covers several requirements. It is set per file in the upload queue (an Upload button on a "Needs a document" row preselects that requirement) and changed later under Documents with Change and Save ("Applies from the next assessment"). A requirement with no document is not sent to a model: it shows as Not found with the note "No document was uploaded for this requirement." and the provider label "No model call". The subcontractor page says how many requirements will be checked and how many have no document. Data: `documents.json` has `requirement_codes`.

## Dashboard `/`

Sections in order: three metric cards (**Waiting for your decision**, **Waiting for a new upload**, **Expired or ending soon**; the last two open the Issues page already filtered), then the **Projects** table with a Documentation column that counts subcontractors per review state. While data loads the cards show a dash, never 0. **New project** opens a dialog.

| State | What shows |
|---|---|
| Loading | "Loading…" in the projects list. |
| Backend unreachable | Error box: "Cannot reach the backend at … Check that it is running, then reload." |
| No projects | "No projects yet. Create one above." |
| No open requests | "Nothing needs a new upload right now." |
| Issues: expiry | Documents whose date has ended or is within 60 days (placeholder thresholds), most urgent first. Each row: tier chip (Expired, Urgent, Soon, Upcoming, shown by icon and fill, not colour meaning), "Expires in N days" / "Expired N days ago" / "Expires today", the date, requirement, subcontractor, project link, status, a "New upload requested" chip when one is open, "View reminder draft" (simulated, opens a side panel) and "Open documents". Empty: "No document dates are close to running out." Data: `issues-expiring.json`. |
| Open requests | Count badge by the title. Table columns: Project (link), Subcontractor, Requirement (code + title), Reason, Request, "Open documents" link. The Request cell shows either "Request email recorded (simulated, nothing sent)" or "No email request", plus who and when. The table scrolls sideways on narrow screens. Data: `open-requests.json`. |
| New project form | Fields: project name, template dropdown, "Delete data by" date (prefilled with a suggestion). Collapsed "About the deletion date" with placeholder advice. States: idle, saving ("Creating…"), form error (for example a past date: "The deletion date must be today or later."). The button is disabled without a name or template. |
| Project row | Link, template name, and either "Delete by {date}" or, if the date passed, "Deletion overdue {date}" emphasised. |

## Project `/projects/[projectId]`

| State | What shows |
|---|---|
| Loading / not found | "Loading…" / error box with the backend message. |
| Banners | Overdue banner if the deletion date passed. Otherwise a quiet line "Delete the data for this project by {date}." |
| Add subcontractor | Fields: name (required), contact email (optional, fictional only). Help text: "Fictional addresses only: ending in .example, .test or example.com." States: idle, saving, error (a real-looking address is refused with that explanation). |
| Subcontractor list | Newest first. Each name links to the engagement page. A just-added subcontractor is highlighted with a checkmark and "Added" (and a toast). Fields validate when left and then as the person types. Empty: "None yet. Add one above, then upload their documents." |
| Requirements | Code, title, "(optional)" or "(has an expiry date)", description. |

## Engagement `/engagements/[engagementId]`

Header: subcontractor name, template name, contact email line ("Contact (fictional): …" or "No contact email is set for this subcontractor."). Banners as on the project page. Then three blocks:

### 1. Upload documents
- A drop area (also a labelled file input, operable by keyboard) with the limits sentence: PDF only, up to 10 MB and 50 pages each, up to 10 files, scans are not read yet, synthetic documents only.
- **Queue:** one row per picked or dropped file with name, size and a Remove button. Row states: ready, uploading, not accepted (with message and hint, from the browser's early checks or from the server), or a possible duplicate (same name as an uploaded document): shown with a warning and an "Upload anyway" button, and excluded until chosen. One bad file never discards the good ones.
- The Upload button shows the number of files, a spinner while uploading, and says why it cannot act yet. A toast summarises the result with an "Assess documents" action.
- **Uploaded documents (N):** one row per document with name, pages, a "Review text" link to the viewer, and its notes. A scan warning is shown as "Scan detected, not read yet" (an in-progress icon, tooltip with the full note), other warnings as plain notes. Empty: "Nothing uploaded yet."

### 2. Assess
- A large button, "Assess documents" ("Assess again" when findings exist) with the number of documents. It says "Upload at least one document first." when there are none.
- **While assessing:** a live region shows "Starting…" then "Checking requirement {index} of {total}: {title}", a progress bar, and "Keep this page open… Nothing is saved until all of them are done." (the sentence about local-model timing is `dev-only`). Progress must stay visible and calm.
- Error: an alert with a plain message.
- After a first assessment: "Assessing again adds new findings. Earlier findings and your decisions on them are kept."

### 3. Required documents and results
- An explanation at the top: the documents are pre-selected from the template, can't be edited here, and each row opens to what it means. Before an assessment each row shows an Upload documents button (nothing uploaded yet) or an Assess button (documents uploaded), never a "not assessed" label.
- **One table with every requirement of the template, always visible.** Columns: Requirement (code, title, optional / has an expiry date), Status (the status badge, or, with no result, an Upload documents button (nothing uploaded yet) or an Assess button (documents uploaded); plus "Your decision" and "New upload requested" when they apply), Documents (documents cited by verified quotes, linked to the viewer; hidden on narrow screens), Date in documents (hidden on narrow screens).
- Status filter chips with counts (counts are allowed, percentages are not) and a "Sort by status" toggle.
- **A row opens** to the description, the words the check looks for, and the finding card (or "No result yet").
- **Other uploaded documents:** documents that no requirement cites, so every uploaded file appears.
- Above the table, when findings exist: "View summary" link and the "About these results" note (`dev-only`) with the Simulated notice always visible.

### Footer disclaimer
"This tool describes what the uploaded documents show. It is not an approval. A person must review and decide." (exact text, from `DISCLAIMER` in `labels.ts`).

## Finding card

Data: one object from `findings-all-states.json`.

**Always shown:** the `ai_status` badge, a "Your decision: …" badge if `human_status` is set, and the provider chip (Simulated, Local model or Claude, always visible).

**Evidence:** zero or more quote blocks. Each shows the quote as plain text, the document name and page, a "View in document" link, and a quote status: "quote found in the document text" or "quote not found in the document text, so it is not used as evidence" (do not present an unverified quote as evidence). Zero quotes: "No quote is attached to this finding."

**Also:** "Date shown in the documents: …" when present; the **new upload panel** if a request exists ("New upload requested: {reason}", who and when, "Request email recorded (simulated, nothing sent)" or "No email request", and a "View email draft" button that opens the simulated draft in a side panel).

**Model and development detail (`dev-only`, hidden unless "Model details" is on):** the notes from the automatic checks, and "How this result was made": a tagged chain AI model answered X → automatic code check (N of M quotes found; result) → second AI check (only if it ran) → a person, then model and prompt version.

**Decision area:** a **Decision** disclosure, always visible, showing "Your decision: …" (or "Not decided yet"), who and when, with the full append-only history inside (time, who, old → new status, reason, note). Once a decision exists the form is hidden and an **Edit decision** button reopens it (with Cancel). The history is never edited: a new decision is a new entry.

### Decision form: the rules

These come from `frontend/lib/decisionForm.ts` and are covered by tests. Redraw the form freely, but call `initialAgree`, `evaluateDecision` and `buildDecision`, and keep these behaviours.

Controls: question "Do you agree with this result?" with the shown result; two radio options ("Yes, the documents show this" / "No, I read the documents differently" plus a status dropdown with the placeholder "Choose a status…"); a reason dropdown that is always available (placeholder "Choose a reason…", options from `upload-reasons.json`); when a new upload can be requested, a checkbox "Ask the subcontractor for a new upload" (never required), then a checkbox "Also send the request by email" ("Simulated: a draft is recorded and nothing is sent", disabled with "Add a contact email for this subcontractor to use this." when there is no contact address); a note text box; the "Record decision" button; a line "Recording as {name} (simulated sign-in)." or "Sign in at the top of the page to record a decision."

| Rule | Behaviour |
|---|---|
| Pre-selection | Only a result with `ai_status = found` pre-selects "Yes". For every other status nothing is selected, and a hint says "Choose one of the options above. Nothing is selected for you, because the documents did not clearly show evidence." |
| Reason (from the list) | Optional when confirming the shown result. **Required** when changing the result or asking for a new upload. The label says which: "(optional when you confirm the result)" / "(required when you change the result or ask for a new upload)". Stored in the decision log and shown in the history. |
| Note (typed text) | Required **only** when the reason is "Other". Label: "Your note (required when the reason is Other)" / "Your note (optional)". |
| Request section | Shown only when the status that would be recorded is not `found`. |
| Request needs | The reason chosen above. Asking for a new upload is never required. |
| Email | Only available with a contact address; otherwise never sent. |
| Button unavailable when | saving, nobody signed in, no option chosen, "No" chosen with no status, a required reason is missing, or the reason is "Other" with no note. `evaluateDecision(...).blockedBecause` names the first missing thing: `saving`, `sign_in`, `choose_option`, `choose_status`, `reason_required`, `comment_required`. |
| What is sent | `{ status, comment (trimmed), reason?, requestUpload?: { sendEmail } }`. Never a name: the server takes the name from the signed-in session. |
| After saving | Green "Decision recorded: {status}." plus "A new upload was requested." and "An email draft was recorded. Simulated: nothing was sent." when relevant, and "It is saved in the decision history below." |

Decision history (expand): per entry, time, who, old status → new status, the reason (when one was given) and the note (omitted when empty).

## Summary `/engagements/[engagementId]/summary`

Data: `summary.json`. Title, intro sentence, "Assessed by: …"; one card per status group in this order: found, partial, expired, unclear, missing, each with the status badge and a count, and a list of requirements with "reviewed by a person" or "not yet reviewed" and a note (date shown, new upload requested). Then a line about how many are not yet reviewed, and the disclaimer. No percentages, no ratios, no scores. States: loading, error, and empty groups are simply not shown.

## Document viewer `/documents/[documentId]?page=&quote=`

Data: `document-pages.json`. Back link to the findings; file name; "Page X of N"; Previous and Next buttons (disabled at the ends); a link "Open the original PDF at this page" (new tab) with the line "The original may show personal numbers that are hidden here."; the page text as plain text with the cited quote highlighted and scrolled into view; the legend "Highlighted: the quote this finding is based on." or "The quote was not found on this page."; for a page with no text "No readable text on this page. It may be a scan."; and the note "This is the text read from the PDF, with personal numbers hidden. It does not show the original layout." States: loading, error.

## Things that are never shown to the user

API keys, other people's sign-in tokens, raw stack traces, document text outside the viewer and the quotes. Errors use plain sentences (for example "Something went wrong on our side. Nothing was saved.").
