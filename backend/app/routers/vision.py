import asyncio
import contextlib
import logging
import os
import time
from collections import deque

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.vision_inference import vision_inference_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/vision", tags=["vision"])

VISION_CHUNK_SECONDS = max(float(os.getenv("VISION_CHUNK_SECONDS", "1.0")), 0.0)
VISION_MAX_BUFFER_FRAMES = max(int(os.getenv("VISION_MAX_BUFFER_FRAMES", "120")), 1)
VISION_PROMPT = os.getenv(
    "VISION_PROMPT",
    "Provide a concise present-tense narration of the wearer's current actions and surroundings.",
)


async def _consume_inference_task(
    task: asyncio.Task[dict[str, object]],
    *,
    frame_count: int,
) -> dict[str, object]:
    try:
        return await task
    except Exception as exc:
        logger.exception("Vision inference failed at frame %d", frame_count)
        return {"inference_error": str(exc)}


@router.websocket("/stream")
async def video_stream(ws: WebSocket):
    """Receive live video frames from Meta Ray-Bans.

    Expects binary messages (JPEG/PNG frames). Sends back JSON acks.
    Runs chunked StreamingVLM inference on Modal and appends optional fields
    to the next outgoing ack payload.
    """
    await ws.accept()
    frame_count = 0
    chunk_count = 0
    inference_failures = 0
    start_time = time.monotonic()
    chunk_window_start = start_time
    buffered_frames: deque[bytes] = deque(maxlen=VISION_MAX_BUFFER_FRAMES)
    pending_inference_task: asyncio.Task[dict[str, object]] | None = None
    latest_inference_result: dict[str, object] | None = None
    inference_session = await vision_inference_client.open_session(headers=ws.headers)
    logger.info("Vision stream connected")

    try:
        while True:
            data = await ws.receive_bytes()
            frame_count += 1
            now = time.monotonic()
            elapsed = time.monotonic() - start_time
            buffered_frames.append(data)

            if pending_inference_task is not None and pending_inference_task.done():
                latest_inference_result = await _consume_inference_task(
                    pending_inference_task,
                    frame_count=frame_count,
                )
                if latest_inference_result.get("inference_error"):
                    inference_failures += 1
                pending_inference_task = None

            window_elapsed = now - chunk_window_start
            if pending_inference_task is None and buffered_frames and window_elapsed >= VISION_CHUNK_SECONDS:
                chunk_start_s = max(chunk_window_start - start_time, 0.0)
                chunk_end_s = max(now - start_time, chunk_start_s)
                frames_for_inference = list(buffered_frames)
                buffered_frames.clear()
                chunk_window_start = now
                chunk_count += 1
                pending_inference_task = asyncio.create_task(
                    inference_session.infer_chunk(
                        frames=frames_for_inference,
                        start_ts_s=chunk_start_s,
                        end_ts_s=chunk_end_s,
                        prompt=VISION_PROMPT,
                    )
                )

            if frame_count % 30 == 0:
                fps = frame_count / elapsed if elapsed > 0 else 0
                logger.info("Vision stream: %d frames, %.1f fps", frame_count, fps)

            payload: dict[str, object] = {
                "frame": frame_count,
                "bytes": len(data),
            }
            if latest_inference_result:
                payload.update({k: v for k, v in latest_inference_result.items() if v is not None})
                latest_inference_result = None
            await ws.send_json(payload)
    except WebSocketDisconnect:
        logger.info("Vision stream disconnected after %d frames", frame_count)
    finally:
        if pending_inference_task is not None:
            if pending_inference_task.done():
                await _consume_inference_task(
                    pending_inference_task,
                    frame_count=frame_count,
                )
            else:
                pending_inference_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await pending_inference_task

        await inference_session.close()
        elapsed = time.monotonic() - start_time
        fps = frame_count / elapsed if elapsed > 0 else 0.0
        logger.info(
            "Vision stream summary: frames=%d chunks=%d inference_failures=%d fps=%.1f",
            frame_count,
            chunk_count,
            inference_failures,
            fps,
        )
