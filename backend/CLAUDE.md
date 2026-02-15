# backend/

FastAPI app + Cloudflare Worker proxy. Python 3.12, managed with uv.

## layout

- `app/main.py` — FastAPI app, mounts routers, has `/health` endpoint
- `app/models.py` — Pydantic request/response models (`SendMessageRequest`, `SendMessageResponse`)
- `app/routers/poke.py` — `POST /poke/send` — sends iMessage/SMS via Poke API. Reads API key from `x-poke-api-key` header (injected by Worker). Returns 500 if key missing, 502 on upstream failure.
- `app/routers/vision.py` — `WebSocket /vision/stream` — receives binary video frames from Meta Ray-Bans, sends per-frame JSON acks `{frame, bytes}`, and adds optional inference fields (`caption`, `latency_ms`, `chunk_start_s`, `chunk_end_s`, `inference_error`) from chunked Modal VLM inference.
- `app/services/poke.py` — `PokeClient` async HTTP client. POSTs to `https://poke.com/api/v1/inbound-sms/webhook` with Bearer auth.
- `app/services/vision_inference.py` — Modal SDK client/session abstraction with no-op fallback when Modal credentials are missing.
- `modal/gemma3_vlm_app.py` — Modal app/class (`Gemma3VLMSession`) for stateful Gemma 3 chunk inference.
- `modal/streaming_vlm_app.py` — legacy StreamingVLM app retained for rollback.
- `worker/` — Cloudflare Worker (TypeScript). Handles auth via magic word, forwards secrets as headers to the container. Uses Durable Objects for container lifecycle.
- `tests/` — pytest suite (unit + integration). Run with `make check`.

## commands

```sh
uv sync --group dev   # install deps
make check            # run tests with coverage
```

## testing

pytest with pytest-asyncio (auto mode). Tests use `httpx.ASGITransport` for async HTTP tests and `starlette.testclient.TestClient` for WebSocket tests. External services are mocked — never call real APIs in tests.

## deployment

Pushes to `main` touching `backend/**` trigger `.github/workflows/deploy-backend.yml` which deploys the Worker to Cloudflare. A separate CI check (`.github/workflows/check-backend.yml`) runs `make check` on pushes and PRs.

Worker secrets for vision inference:

- `FORESIGHT_MODAL_TOKEN_ID`
- `FORESIGHT_MODAL_TOKEN_SECRET`
- `FORESIGHT_MODAL_APP_NAME` (optional override)
- `FORESIGHT_MODAL_CLASS_NAME` (optional override)

CD deploy order (`.github/workflows/deploy-backend.yml`):

1. Deploy Modal app (`backend/modal/gemma3_vlm_app.py`) to Modal.
2. Sync Worker secrets (including Modal credentials + app/class).
3. Deploy Worker.

Optional CI variable:

- `FORESIGHT_MODAL_ENVIRONMENT` (Modal environment name; defaults to `main`).
- `FORESIGHT_GEMMA3_HF_SECRET_NAME` (optional Modal secret name that includes `HF_TOKEN` for gated HF models).
- `FORESIGHT_MODAL_CLASS_NAME_OVERRIDE` (optional class override; defaults to `Gemma3VLMSession`).
