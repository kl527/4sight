# backend/

FastAPI app + Cloudflare Worker proxy. Python 3.12, managed with uv.

## layout

- `app/main.py` — FastAPI app, mounts routers, has `/health` endpoint
- `app/models.py` — Pydantic request/response models (`SendMessageRequest`, `SendMessageResponse`)
- `app/routers/poke.py` — `POST /poke/send` — sends iMessage/SMS via Poke API. Reads API key from `x-poke-api-key` header (injected by Worker). Returns 500 if key missing, 502 on upstream failure.
- `app/routers/vision.py` — `WebSocket /vision/stream` — receives binary video frames from Meta Ray-Bans, acks with JSON `{frame, bytes}`. Logs FPS every 30 frames. TODO: forward to Modal VLM.
- `app/services/poke.py` — `PokeClient` async HTTP client. POSTs to `https://poke.com/api/v1/inbound-sms/webhook` with Bearer auth.
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
