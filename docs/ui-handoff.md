# UI hand-off: briefing for a design or layout tool

Read this first. It tells you what the product is, what you may change, what you must not, and how your work will be checked. `docs/ui-states.md` lists every screen and state. `docs/ui-fixtures/` has real sample data for every API response, so you can design without running the backend.

## What the product is

A subcontractor readiness tool for construction project managers (PMs). A PM picks a requirement template (for example VVS), uploads a subcontractor's PDF documents, and the tool checks each requirement against them. For every requirement it shows a status, the exact quote and page the status is based on, and who or what produced it. The PM reviews each finding and records a decision. The tool never decides anything.

**The single most important idea:** the tool reports *what the documents show*. It is not an approval system. If a design makes a status look like a verdict, a grade, or a pass/fail result, the design is wrong.

Users: **PM** (creates projects, uploads, reviews, decides) and **reviewer** (reviews and decides). The subcontractor does not use the app in this version.

It is a school project and a first step toward a real product. It runs on localhost with fictional data only.

## Content rules (these are product rules, not style)

1. **Never use these words anywhere in the UI:** approved, compliant, qualified, pass, passed, fail, failed, score. No percentages, ratios, grades or traffic-light verdicts. Use "documents show", "evidence not found", "needs human review", "needs a new upload".
2. **Status wording is fixed.** Use exactly these labels (the wording lives in `frontend/lib/labels.ts` and is protected; the colours live in `STATUS_STYLE` in `frontend/components/ui.tsx` and are yours to change):

   | Status key | Label | Colour family now |
   |---|---|---|
   | `found` | Documents show evidence | emerald |
   | `partial` | Documents show part of it | amber |
   | `expired` | Documents show an expired date | rose |
   | `unclear` | Needs human review | violet |
   | `missing` | Evidence not found | slate |

   You may change colours, but keep five clearly distinct, accessible styles, and never imply "good" or "bad". Colour must never be the only signal (keep the text label).
3. **Three separate statuses per finding, never merged:** `model_status` (what the AI model said), `ai_status` (after automatic code checks and a second check), `human_status` (the person's decision, may be empty). The big badge shows `ai_status`; a person's decision is a second badge labelled "Your decision". Do not show a single combined status.
4. **Always visible on every finding:** the provider label (`Simulated`, `Local model` or `Claude`). It may be small and quiet, but it must be there.
5. **Model and development detail is secondary.** Keep it as quiet, collapsed notes ("How this result was made", "About these results"). The result, the quote and the decision are the focus.
6. **Banners that must appear:** the placeholder banner when a template is not expert-reviewed; the "Simulated" notice when answers come from the scripted provider; the overdue banner when a project's deletion date has passed; the disclaimer on the engagement page and the summary page.
7. **Simulated things are labelled Simulated:** the sign-in ("Simulated, not real authentication") and the request email ("Simulated: nothing was sent"). Never make them look real.
8. **Fictional data only.** Never add real names, real companies or real email addresses to placeholders or examples. Use the fictional ones in the fixtures.
9. **Language:** English.

## What you may change

- Layout, spacing, typography, colour, icons, motion, and component structure in:
  - `frontend/app/**/page.tsx` and `frontend/app/layout.tsx` (markup and styling only)
  - `frontend/components/**`
  - `frontend/app/globals.css` and Tailwind configuration
- You may add new presentational components and new files under `frontend/components/`.
- You may add UI-only state (open/closed, hover, which tab is shown).

## What you must not change (the logic layer)

These files hold the rules. A restyle never needs to touch them. If you think one needs a change, stop and write down why instead.

| Path | What it is |
|---|---|
| `backend/**` | The API, the AI pipeline, the checks, the database. |
| `templates/**` | The requirement lists. They are never generated or edited by the UI. |
| `evals/**` | Evaluation packets and results. |
| `frontend/lib/**` | API client, data schemas, wording, decision-form rules, form validation rules (`forms.ts`), theme preference (`theme.ts`), query hooks (`queries.ts`), sign-in token, highlighter, and their tests. |
| `frontend/package.json`, `frontend/package-lock.json` | Dependencies. New packages need approval. |
| `check.sh`, `check_ui_boundary.sh`, `CLAUDE.md`, `PLAN.md` | Project rules and checks. |

Inside the editable files, also keep these behaviours exactly:

- All server calls go through the functions in `frontend/lib/api.ts`. Do not call `fetch` in a component or page, and do not add `localStorage`, cookies or `NEXT_PUBLIC_` variables.
- Never use `dangerouslySetInnerHTML`. Quotes and notes come from uploaded documents and must be rendered as plain text.
- The decision form's behaviour comes from `frontend/lib/decisionForm.ts` (`initialAgree`, `evaluateDecision`, `buildDecision`). You may redraw the form but must keep calling these functions and must not re-implement their rules in the component. Details in `docs/ui-states.md`.
- Keep every control that exists today (see "Required elements" per screen in `docs/ui-states.md`). You can restyle or move them, but not remove them.
- Keep the screens responsive and usable at about 400 px wide, 768 px and desktop. Tables scroll inside their own container. Keep at least a 16 px side gutter.
- Keep accessibility: labels on inputs, `role="status"` / `role="alert"` on live messages, visible focus, keyboard operation, sufficient contrast.

## How your work is checked

Work on a branch, for example `ui/redesign`. Before it is merged, both of these must pass from the project root:

```bash
./check_ui_boundary.sh main   # fails if protected files changed, or UI rules are broken
./check.sh                    # lint, backend tests, secret scan, frontend lint, tests and build
```

`check_ui_boundary.sh` lists protected files that changed, and greps the UI for forbidden things: `fetch(` outside `lib/`, `localStorage`, `dangerouslySetInnerHTML`, banned words, and missing required elements such as the provider label and the disclaimer.

## Running it

```bash
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --host 127.0.0.1   # API on :8000
cd frontend && npm run dev                                                                    # app on :3000
```

Open `http://localhost:3000` (not 127.0.0.1: only `localhost:3000` is allowed to call the API). `LLM_PROVIDER=scripted` in `.env` gives instant, deterministic answers for design work; the real model takes a minute or two per assessment.

## Tech you must keep

Next.js 16 (App Router), React 19, TypeScript in strict mode (no `any`), Tailwind CSS 4, zod for every API response. Do not add dependencies without asking: new packages need approval. This Next.js version has breaking changes: read `frontend/node_modules/next/dist/docs/` before using a Next.js API from memory. A dynamic route page that reads `params` needs a `loading.tsx` next to it or the production build fails.

## Where the facts are

- Data shapes: `frontend/lib/schemas.ts` (source of truth), and `docs/ui-fixtures/*.json` (real responses).
- Screens, states, and the decision-form rules: `docs/ui-states.md`.
- All wording: `frontend/lib/labels.ts`.
- Why things are the way they are: `docs/decisions.md`.

## Sample data

`docs/ui-fixtures/`:

| File | What it shows |
|---|---|
| `templates.json`, `template-vvs.json` | Template list and detail (7 requirements, placeholder flag). |
| `projects.json`, `project-detail.json` | A project with a deletion date and two subcontractors. |
| `engagement.json`, `documents.json` | One subcontractor with five uploaded documents and one redaction warning. |
| `findings.json` | Seven findings with one confirmed, one expired with a request and an email draft. |
| `findings-missing-items.json` | Mostly "Evidence not found", one open request without email. |
| `findings-all-states.json` | **Hand-made:** one of every status, a model answer lowered by the second check, an unverified quote, an expired finding with a request. Use this for the findings screen. |
| `summary.json` | The summary screen data. |
| `open-requests.json` | The "Needs a new upload" dashboard table. |
| `upload-rejected.json` | A rejected upload with a message and a hint. |
| `upload-reasons.json`, `session-users.json`, `retention-advice.json`, `document-pages.json`, `decisions.json` | Smaller responses. |
