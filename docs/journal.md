# Journal

What was built, what was learned, and any problems. Two or three lines per slice.

## 2026-11-10 (day 1)
- **Skeleton.** Set up the repo with `.gitignore` and `.env.example` before the first commit, so secrets and `data/` can never be tracked. Seeded `decisions.md` with five decisions. Learned that `.gitignore` only stops git from starting to track a file, so the order matters.
- **Python and venv.** Chose the installed Python 3.15 over installing 3.12, after confirming that every approved package has a prebuilt wheel (`--only-binary=:all:`). Pinned exact versions in `requirements.txt`. Learned that a venv is a project-private Python, and that pinning makes the install reproducible.
