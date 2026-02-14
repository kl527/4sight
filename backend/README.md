# backend/

FastAPI app + Cloudflare Worker proxy. Python 3.12, managed with `uv`.

## Layout

- `app/main.py` - FastAPI app, mounts routers, exposes `/health`
- `app/routers/poke.py` - `POST /poke/send`
- `app/routers/vision.py` - `WebSocket /vision/stream` for live frame acks + chunked Modal inference
- `app/services/vision_inference.py` - backend Modal SDK client/session abstraction
- `modal/streaming_vlm_app.py` - Modal app/class that serves stateful StreamingVLM chunk inference
- `worker/` - Cloudflare Worker proxy that injects secrets as headers

## Local commands

```sh
uv sync --group dev
make check
```

## Modal deployment

Deploy the inference app/class:

```sh
cd backend
modal deploy modal/streaming_vlm_app.py
```

Defaults:

- Modal app name: `foresight-streamingvlm`
- Modal class name: `StreamingVLMSession`
- Model: `mit-han-lab/StreamingVLM`
- GPU: `L40S`

## Required Worker secrets

Set these on `foresight-backend` Worker (in addition to existing `MAGIC_WORD` and `FORESIGHT_POKE_API_KEY`):

- `FORESIGHT_MODAL_TOKEN_ID`
- `FORESIGHT_MODAL_TOKEN_SECRET`
- `FORESIGHT_MODAL_APP_NAME` (optional override; default app name if omitted)
- `FORESIGHT_MODAL_CLASS_NAME` (optional override; default class name if omitted)

The Worker forwards them to backend headers:

- `x-modal-token-id`
- `x-modal-token-secret`
- `x-modal-app-name`
- `x-modal-class-name`

## CD behavior

`.github/workflows/deploy-backend.yml` now deploys Modal first, then deploys Worker:

1. Deploys `modal/streaming_vlm_app.py` to Modal.
2. Writes Worker secrets (including Modal token/app/class).
3. Deploys Worker to Cloudflare.

Optional repo variable for Modal environment selection:

- `FORESIGHT_MODAL_ENVIRONMENT` (defaults to `main`)
