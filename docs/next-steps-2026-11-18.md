# What is left (refreshed 2026-11-18, evening before the presentation)

Done and committed on `ui/figma-layout` (tag `pre-presentation`): bug fixes, overview endpoint and glance state, short labels, Dashboard and Issues deep links, assessment that survives navigation, viewer with all cited quotes, tagging documents to requirements, "No document" state, plain-English emails. `./check.sh` passes.

## Before the presentation
1. Browser run-through of `docs/presentation.md` in light and dark mode (scripted provider as the fallback).
2. Decide how to merge: see the merge notes in the chat history (option B: demo from the branch or the tag, merge after).

## Waiting on the owner
- Phase 3 demo-wording clean-up: keep or delete the About page, shorten the repeated "Simulated" labels, `labels.ts` wording edits.
- Tagging default: keep "Not sure, check all" or require a tag.

## UI polish
- Phase 4: remove the repeated name, contact and template blocks; merge the Overview list and the Requirements table; hide "About these results" unless Model details is on; "Next requirement" in the panel; neutral "Decision" label.
- Phase 5: consistent terms, viewer "quote not found" only on the cited page, loading and not-found pages, warn before closing the upload dialog with queued files, verifier provenance wording.
- Tagging follow-ups: "Assess now" after saving tags; decision history wording for a no-document decision.

## After Thursday
Engagement decision (hard-rule change), re-assess keeps earlier decisions visible (backend), Claude provider (needs a key and an eval budget), page ranges per tag, suggested tags, VVS-05 prompt tweak, more eval packets, `/code-review` and `/security-review`, school report.
