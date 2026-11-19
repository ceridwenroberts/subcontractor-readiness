# Known limits

What this version does not do, stated plainly.

## Not for real use
- **No real login, localhost only.** Never deploy this version. The sign-in is simulated: two fixed demo users, sessions kept in memory.
- **Placeholder requirements.** The VVS list has not been reviewed by a domain expert.
- **Synthetic data only.** All companies, people and numbers are fictional.

## Reading documents
- **No OCR.** Scanned pages have no text, so a requirement may show "Evidence not found" when the evidence is in a scan. The upload warns when it sees a page with no text.
- **Dates are matched in ISO form** (2027-12-31). Other formats weaken the finding instead of being read.
- **A real hyphen at a line break** in a quote can fail to match. That weakens a finding and never strengthens it.

## Model quality
- **Small local model.** `qwen2.5:7b` sometimes misses evidence and varies between runs. Misses fail safe (the reviewer sees "Evidence not found" and can override), but recall is not production quality.
- **No hosted-model evaluation** has been run.
- **The verifier adds one model call** for each finding that shows evidence, so an assessment takes about a minute or two locally.
- **Only four evaluation packets** and one trade (VVS).

## Which document is for which requirement
- **Tags are chosen by the person.** Untagged files are read for every requirement. A wrong tag can hide the right evidence and give a false "no evidence" (this fails safe). Page ranges per tag and suggested tags are not built.

## Privacy
- **Names are not redacted.** Only personnummer and samordningsnummer are hidden. Names on certificates are personal data and reach the model. A privacy review is needed before real use.
- **No automatic deletion.** A project has a "delete data by" date and an overdue banner, with placeholder advice that is not legal advice. Original PDFs and stored text stay until someone deletes them by hand. A purge that respects the append-only decision log is not built.
- **The "open original" link serves the uploaded PDF**, which may still show personal numbers. It is labelled as such.

## Audit and decisions
- **The decision log guard is in application code.** Raw SQL against the database file would bypass it. A database trigger would be needed.
- **Re-assessing adds new findings**, and the reviewer decides again. Earlier findings and decisions are kept.
- **Confirming needs no comment.** A reason is required only when changing the result or asking for a new upload.
- **No decision about the subcontractor itself.** The tool shows what the documents show and where the review stands. It never says a subcontractor is approved or rejected.

## Email
- **Emails are simulated.** A request for a new upload records a draft and shows it. Nothing is sent, and only fictional addresses (.example, .test, example.com) are accepted.
