import asyncio
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/vision", tags=["vision"])


@router.websocket("/stream")
async def video_stream(ws: WebSocket):
    """Receive live video frames from Meta Ray-Bans.

    Expects binary messages (JPEG/PNG frames). Sends back JSON acks.
    Will be wired to a VLM on Modal for live action transcription.
    """
    await ws.accept()
    frame_count = 0
    start_time = time.monotonic()
    logger.info("Vision stream connected")

    try:
        while True:
            data = await ws.receive_bytes()
            frame_count += 1
            elapsed = time.monotonic() - start_time

            # TODO: forward frame to Modal VLM for action transcription

            if frame_count % 30 == 0:
                fps = frame_count / elapsed if elapsed > 0 else 0
                logger.info("Vision stream: %d frames, %.1f fps", frame_count, fps)

            await ws.send_json({
                "frame": frame_count,
                "bytes": len(data),
            })
    except WebSocketDisconnect:
        logger.info("Vision stream disconnected after %d frames", frame_count)
