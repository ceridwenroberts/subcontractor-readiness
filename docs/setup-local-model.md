# Running with a local model, and other setup details

The quick start in the main README uses the `scripted` provider, which needs nothing installed. This page covers the real model path and common setup problems.

## Providers

Set `LLM_PROVIDER` in `.env`:

| Value | What it does | Label in the UI |
|---|---|---|
| `scripted` (default) | No network. Fixed answers, so tests and demos are repeatable. | Simulated |
| `ollama` | A model running on your machine through [Ollama](https://ollama.com). | Local model |
| `anthropic` | Hosted Claude model. Opt-in and not evaluated yet. Needs `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`. | Claude |

A requirement with no uploaded document never calls any provider. Its finding is labelled "No model call".

## Local model with Ollama

```bash
brew install ollama && brew services start ollama
ollama pull qwen2.5:7b
```

Then in `.env`:

```
LLM_PROVIDER=ollama
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b
```

Restart the backend. Expect roughly 1.5 to 2 minutes per subcontractor on a laptop.

`VERIFIER_ENABLED=true` (default) turns on the second check, which costs one extra model call for each finding that shows evidence. Set it to `false` to compare.

## Evaluation

From the project root:

```bash
backend/.venv/bin/python evals/run.py                        # provider from .env, verifier off and on
LLM_PROVIDER=ollama OLLAMA_MODEL=qwen2.5:7b backend/.venv/bin/python evals/run.py --runs 3
```

It prints overall accuracy, the false "found" rate (target: zero) and the "unclear" rate, and saves each run to `evals/results/`. There are four synthetic packets: complete, missing items, expired plus personnummer, and prompt injection.

Read the numbers honestly. `scripted` runs prove the plumbing and the code checks. `ollama` runs come from a small local model and are not representative of production quality. No hosted-model evaluation has been run. Even at temperature 0 the same packet gave different answers on different runs, so a single run proves little.

## Troubleshooting

- **"Cannot reach the backend" in the browser.** The backend allows one frontend origin (`FRONTEND_ORIGIN`, default `http://localhost:3000`). If port 3000 is busy, Next.js starts on 3001. Set `FRONTEND_ORIGIN=http://localhost:3001` in `.env` and restart the backend.
- **Use `localhost`, not `127.0.0.1`, in the browser.** They count as different origins, and the backend only answers to `localhost` and `127.0.0.1` host names.
- **Port 8000 already in use.** Another service is on it. Stop it, or start this backend on 8001 and the frontend with `NEXT_PUBLIC_API_URL=http://127.0.0.1:8001`. Check which one is running with `curl http://127.0.0.1:8000/openapi.json`: the title must be "Subcontractor readiness".
- **Errors after pulling new code.** New database columns are added on startup. Restart the backend once.
- **Slow or no answer from Ollama.** Switch to `LLM_PROVIDER=scripted` and restart to confirm everything else works.

## Before every commit

From the project root: `./check.sh` (ruff, backend tests, secret scan, frontend lint and tests).
