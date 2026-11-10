# Journal

What was built, what was learned, and any problems. Two or three lines per slice.

## 2026-11-10 (day 1)
- **Skeleton.** Set up the repo with `.gitignore` and `.env.example` before the first commit, so secrets and `data/` can never be tracked. Seeded `decisions.md` with five decisions. Learned that `.gitignore` only stops git from starting to track a file, so the order matters.
- **Python and venv.** Chose the installed Python 3.15 over installing 3.12, after confirming that every approved package has a prebuilt wheel (`--only-binary=:all:`). Pinned exact versions in `requirements.txt`. Learned that a venv is a project-private Python, and that pinning makes the install reproducible.
- **check.sh.** Added a pre-commit check script: lint, tests, a secret scan over tracked and untracked (non-ignored) files, and a frontend step that turns on once `frontend/` exists. Learned that `set -e` would treat pytest's "no tests" exit code 5 as a failure, so that one code is handled explicitly. Tested the scan with a fake key: it failed in a normal file and was ignored in the gitignored `.env`, as intended.
- **FastAPI /health.** Added `config.py` (pydantic-settings reads `.env`) and `main.py` with CORS that allows only `FRONTEND_ORIGIN`. Tests cover `/health` and that other origins are blocked. Learned that a `create_app(settings)` factory keeps tests independent of my local `.env`, and that ruff needs `src` set to know which imports are our own. Replaced a Starlette deprecation warning by adding `httpx2`, after confirming it is the package Starlette's own code imports and not a lookalike name.

## Troubleshooting notes
- **CORS: only one frontend origin.** The backend accepts browser calls only from `FRONTEND_ORIGIN` (default `http://localhost:3000`, set in `.env`). If another project is already using port 3000, Next.js starts on 3001 instead. The UI then gets CORS errors in the browser console ("blocked by CORS policy"), even though `curl` and `/docs` still work. Fix: stop the other project, or set `FRONTEND_ORIGIN` to the new port and restart the backend. `localhost` and `127.0.0.1` count as different origins, too.
