# Journal

What was built, what was learned, and any problems. Two or three lines per slice.

## 2026-11-10 (day 1)
- **Skeleton.** Set up the repo with `.gitignore` and `.env.example` before the first commit, so secrets and `data/` can never be tracked. Seeded `decisions.md` with five decisions. Learned that `.gitignore` only stops git from starting to track a file, so the order matters.
- **Python and venv.** Chose the installed Python 3.15 over installing 3.12, after confirming that every approved package has a prebuilt wheel (`--only-binary=:all:`). Pinned exact versions in `requirements.txt`. Learned that a venv is a project-private Python, and that pinning makes the install reproducible.
- **check.sh.** Added a pre-commit check script: lint, tests, a secret scan over tracked and untracked (non-ignored) files, and a frontend step that turns on once `frontend/` exists. Learned that `set -e` would treat pytest's "no tests" exit code 5 as a failure, so that one code is handled explicitly. Tested the scan with a fake key: it failed in a normal file and was ignored in the gitignored `.env`, as intended.
