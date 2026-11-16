# UI states and logic

Every screen, the states it can be in, what must be on it, and the rules behind it. Companion to `docs/ui-handoff.md`. Sample data for each state is in `docs/ui-fixtures/`.

Conventions: "required" means the element must stay (restyle and move it freely). All screens are client components that load data through `frontend/lib/api.ts`.

## Navigation map

```
/                                  Home: "Needs a new upload" table, new project, project list
/projects/[projectId]              Project: add subcontractor, requirements in the template
/engagements/[engagementId]        Engagement: upload, assess, findings, decisions
/engagements/[engagementId]/summary  Documentation summary
/documents/[documentId]?page=&quote=  Document viewer (redacted text, quote highlighted)
Header on every page: product name, "Documentation status only. A person reviews and decides.", sign-in bar
```

A "subcontractor on a project" is called an **engagement** in the code and API; the UI says "subcontractor".

## Header and sign-in bar (`SessionBar`)

| State | What shows |
|---|---|
| Not ready (checking a stored token) | Nothing visible, space reserved. |
| Signed out | "Sign in as" dropdown of demo users, "Sign in" button, badge "Simulated, not real authentication". |
| Sign-in error | The error text next to the form. |
| Signed in | "Signed in as {name}" with a "Simulated" badge, and "Sign out". |

Required: the Simulated badge in both states. Demo users: `session-users.json`.

## Home `/`

Sections in order: **Needs a new upload** (table), **New project** (form), **Your projects** (list).

| State | What shows |
|---|---|
| Loading | "Loading…" in the projects list. |
| Backend unreachable | Error box: "Cannot reach the backend at … Check that it is running, then reload." |
| No projects | "No projects yet. Create one above." |
| No open requests | "Nothing needs a new upload right now." |
| Open requests | Count badge by the title. Table columns: Project (link), Subcontractor, Requirement (code + title), Reason, Request, "Open documents" link. The Request cell shows either "Request email recorded (simulated, nothing sent)" or "No email request", plus who and when. The table scrolls sideways on narrow screens. Data: `open-requests.json`. |
| New project form | Fields: project name, template dropdown, "Delete data by" date (prefilled with a suggestion). Collapsed "About the deletion date" with placeholder advice. Placeholder banner if the chosen template is not expert-reviewed. States: idle, saving ("Creating…"), form error (for example a past date: "The deletion date must be today or later."). The button is disabled without a name or template. |
| Project row | Link, template name, and either "Delete by {date}" or, if the date passed, "Deletion overdue {date}" emphasised. |

## Project `/projects/[projectId]`

| State | What shows |
|---|---|
| Loading / not found | "Loading…" / error box with the backend message. |
| Banners | Placeholder banner if the template is not reviewed. Overdue banner if the deletion date passed. Otherwise a quiet line "Delete the data for this project by {date}." |
| Add subcontractor | Fields: name (required), contact email (optional, fictional only). Help text: "Fictional addresses only: ending in .example, .test or example.com." States: idle, saving, error (a real-looking address is refused with that explanation). |
| Subcontractor list | Each name links to the engagement page. Empty: "None yet. Add one above, then upload their documents." |
| Requirements | Code, title, "(optional)" or "(has an expiry date)", description. |

## Engagement `/engagements/[engagementId]`

Header: subcontractor name, template name, contact email line ("Contact (fictional): …" or "No contact email is set for this subcontractor."). Banners as on the project page. Then four blocks:

### 1. Upload documents
- Limits sentence: PDF only, up to 10 MB and 50 pages each, up to 10 files, scans are not read yet, synthetic documents only.
- States: no file picked (button disabled), files picked ("Upload N files"), uploading, error message, result list.
- Result list per file: **accepted** (green: "{name}: uploaded."), or **rejected** (red: message + hint, for example "notes.txt: The file is not a PDF." "Only PDF files are accepted…"). Each file can also show amber **Note:** warnings (personal numbers hidden, or "may be a scan"). One bad file never discards the good ones. Data: `upload-rejected.json`.
- "Uploaded documents (N)" list: name, pages, warnings. Empty: "Nothing uploaded yet."

### 2. Assess
- The button is disabled without documents. Label: "Assess documents", or "Assess again" if findings exist.
- **While assessing:** a live region shows "Starting…" then "Checking requirement {index} of {total}: {title}", a progress bar (done = index − 1 of total), and the notes "Keep this page open…" and "Nothing is saved until all of them are done." Assessing takes seconds with the scripted provider and 1 to 2 minutes with the real model, so progress must stay visible and calm.
- Error: error box with a plain message (backend down: "The assessment service isn't available…").
- After a first assessment: "Assessing again adds new findings. Earlier findings and your decisions on them are kept."

### 3. Findings (only when findings exist)
- Title with count, and a "View summary" link.
- **About these results** (collapsed, quiet): provider label and model; the four-step explanation (AI model, automatic code check, second AI check if used, a person); prompt version. A Simulated notice sits above it when the provider is `scripted`.
- One **finding card** per requirement, in template order. See below.

### 4. Footer disclaimer
"This tool describes what the uploaded documents show. It is not an approval. A person must review and decide." (exact text, from `DISCLAIMER` in `labels.ts`).

## Finding card

Data: one object from `findings-all-states.json`.

**Always shown:** requirement code and title ("(optional)" if not mandatory); a small quiet provider chip; the `ai_status` badge; a "Your decision: …" badge if `human_status` is set.

**Collapsed by default, quiet:** "How this result was made" (adds "· adjusted by automatic checks" when `model_status` differs from `ai_status`). Inside, a tagged chain: AI model answered X → automatic code check (N of M quotes found in the document text; result) → second AI check (only if it ran: supports, does not support so lowered, or no valid answer) → a person (decision or "Not decided yet"), then model and prompt version.

**Evidence:** zero or more quote blocks. Each shows the quote as plain text, the document name and page, a "View in document" link, and a quote status: "quote found in the document text" or "quote not found in the document text, so it is not used as evidence" (do not present an unverified quote as evidence). Zero quotes: "No quote is attached to this finding."

**Also:** "Date shown in the documents: …" when present; quiet notes from the automatic checks; the **new upload panel** if a request exists ("New upload requested: {reason}", who and when, "Request email recorded (simulated, nothing sent)" or "No email request", and an expandable "Email draft (simulated, not sent)" with to, subject and body).

**Footer:** the decision form (below), a "Decision recorded" confirmation, an error box, and "Show / Hide decision history".

### Decision form: the rules

These come from `frontend/lib/decisionForm.ts` and are covered by tests. Redraw the form freely, but call `initialAgree`, `evaluateDecision` and `buildDecision`, and keep these behaviours.

Controls: question "Do you agree with this result?" with the shown result; two radio options ("Yes, the documents show this" / "No, I read the documents differently" plus a status dropdown with the placeholder "Choose a status…"); when a new upload can be requested, a checkbox "Ask the subcontractor for a new upload", then a reason dropdown (placeholder "Choose a reason…", options from `upload-reasons.json`) and a checkbox "Also send the request by email" ("Simulated: a draft is recorded and nothing is sent", disabled with "Add a contact email for this subcontractor to use this." when there is no contact address); a reason text box; the "Record decision" button; a line "Recording as {name} (simulated sign-in)." or "Sign in at the top of the page to record a decision."

| Rule | Behaviour |
|---|---|
| Pre-selection | Only a result with `ai_status = found` pre-selects "Yes". For every other status nothing is selected, and a hint says "Choose one of the options above. Nothing is selected for you, because the documents did not clearly show evidence." |
| Comment | Optional only when confirming the shown result with no request. Required when changing the result or asking for a new upload. The label changes: "Your reason (optional when you confirm the result)" / "Your reason (required)". |
| Request section | Shown only when the status that would be recorded is not `found`. |
| Request needs | A reason. |
| Email | Only available with a contact address; otherwise never sent. |
| Button disabled when | saving, nobody signed in, no option chosen, "No" chosen with no status, a required comment is empty, or a request has no reason. `evaluateDecision(...).blockedBecause` names the first missing thing: `saving`, `sign_in`, `choose_option`, `choose_status`, `comment_required`, `reason_required`. |
| What is sent | `{ status, comment (trimmed), requestUpload? }`. Never a name: the server takes the name from the signed-in session. |
| After saving | Green "Decision recorded: {status}." plus "A new upload was requested." and "An email draft was recorded. Simulated: nothing was sent." when relevant, and "It is saved in the decision history below." |

Decision history (expand): per entry, time, who, old status → new status, and the comment (omitted when empty).

## Summary `/engagements/[engagementId]/summary`

Data: `summary.json`. Title, intro sentence, "Assessed by: …"; one card per status group in this order: found, partial, expired, unclear, missing, each with the status badge and a count, and a list of requirements with "reviewed by a person" or "not yet reviewed" and a note (date shown, new upload requested). Then a line about how many are not yet reviewed, and the disclaimer. No percentages, no ratios, no scores. States: loading, error, and empty groups are simply not shown.

## Document viewer `/documents/[documentId]?page=&quote=`

Data: `document-pages.json`. Back link to the findings; file name; "Page X of N"; Previous and Next buttons (disabled at the ends); a link "Open the original PDF at this page" (new tab) with the line "The original may show personal numbers that are hidden here."; the page text as plain text with the cited quote highlighted and scrolled into view; the legend "Highlighted: the quote this finding is based on." or "The quote was not found on this page."; for a page with no text "No readable text on this page. It may be a scan."; and the note "This is the text read from the PDF, with personal numbers hidden. It does not show the original layout." States: loading, error.

## Things that are never shown to the user

API keys, other people's sign-in tokens, raw stack traces, document text outside the viewer and the quotes. Errors use plain sentences (for example "Something went wrong on our side. Nothing was saved.").
