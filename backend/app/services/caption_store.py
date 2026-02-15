"""Fire-and-forget caption persistence to the Cloudflare Worker D1 endpoint."""

import logging
import os
import uuid

import httpx

logger = logging.getLogger(__name__)


async def store_caption(
    *,
    caption: str,
    chunk_start_s: float,
    chunk_end_s: float,
    latency_ms: int | None = None,
    tokens_generated: int | None = None,
) -> None:
    """POST a caption window to the Worker's /captions/upload endpoint.

    Generates a deterministic-ish window_id from the chunk timestamps so
    re-sends for the same chunk are idempotent (INSERT OR IGNORE).
    """
    worker_base_url = os.getenv("WORKER_BASE_URL", "")
    magic_word = os.getenv("MAGIC_WORD", "")

    if not worker_base_url or not magic_word:
        logger.warning(
            "Caption store disabled — WORKER_BASE_URL=%r, MAGIC_WORD=%s",
            worker_base_url,
            "set" if magic_word else "EMPTY",
        )
        return

    window_id = f"cap-{chunk_start_s:.3f}-{chunk_end_s:.3f}-{uuid.uuid4().hex[:8]}"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"{worker_base_url}/captions/upload",
                headers={"x-magic-word": magic_word},
                json={
                    "windowId": window_id,
                    "timestamp": chunk_start_s,
                    "chunkStartS": chunk_start_s,
                    "chunkEndS": chunk_end_s,
                    "caption": caption,
                    "latencyMs": latency_ms,
                    "tokensGenerated": tokens_generated,
                },
            )
            resp.raise_for_status()
            logger.info("Stored caption window %s (status %d)", window_id, resp.status_code)
    except Exception:
        logger.exception("Failed to store caption window %s", window_id)
