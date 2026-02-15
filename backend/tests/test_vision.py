"""Integration tests for the /vision/stream WebSocket endpoint."""

import asyncio
import time

import pytest
from starlette.testclient import TestClient

import app.routers.vision as vision_router
from app.main import app


@pytest.fixture
def sync_client():
    return TestClient(app)


class StubInferenceSession:
    def __init__(
        self,
        *,
        result: dict | None = None,
        error: Exception | None = None,
        delay_s: float = 0.0,
    ):
        self.result = result or {}
        self.error = error
        self.delay_s = delay_s
        self.closed = False

    async def infer_chunk(
        self,
        frames: list[bytes],
        start_ts_s: float,
        end_ts_s: float,
        prompt: str,
    ) -> dict:
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        if self.error:
            raise self.error
        payload = dict(self.result)
        payload.setdefault("chunk_start_s", start_ts_s)
        payload.setdefault("chunk_end_s", end_ts_s)
        return payload

    async def close(self) -> None:
        self.closed = True


class StubInferenceClient:
    def __init__(self, session: StubInferenceSession):
        self.session = session

    async def open_session(self, headers=None):
        return self.session


def test_websocket_single_frame(sync_client):
    """Send one frame and verify the ack."""
    with sync_client.websocket_connect("/vision/stream") as ws:
        ws.send_bytes(b"\xff\xd8fake-jpeg-data")
        ack = ws.receive_json()
        assert ack["frame"] == 1
        assert ack["bytes"] == len(b"\xff\xd8fake-jpeg-data")


def test_websocket_multiple_frames(sync_client):
    """Send several frames and verify incrementing frame count."""
    with sync_client.websocket_connect("/vision/stream") as ws:
        for i in range(5):
            payload = bytes(range(i * 10, (i + 1) * 10))
            ws.send_bytes(payload)
            ack = ws.receive_json()
            assert ack["frame"] == i + 1
            assert ack["bytes"] == len(payload)


def test_websocket_empty_frame(sync_client):
    """Empty frames should still get acked."""
    with sync_client.websocket_connect("/vision/stream") as ws:
        ws.send_bytes(b"")
        ack = ws.receive_json()
        assert ack["frame"] == 1
        assert ack["bytes"] == 0


def test_websocket_inference_result_is_attached_to_ack(sync_client, monkeypatch):
    session = StubInferenceSession(result={"caption": "opening the fridge", "latency_ms": 42})
    monkeypatch.setattr(vision_router, "vision_inference_client", StubInferenceClient(session))
    monkeypatch.setattr(vision_router, "VISION_CHUNK_SECONDS", 0.0)

    with sync_client.websocket_connect("/vision/stream") as ws:
        ws.send_bytes(b"frame-one")
        ack1 = ws.receive_json()
        assert ack1["frame"] == 1
        assert "caption" not in ack1

        ws.send_bytes(b"frame-two")
        ack2 = ws.receive_json()
        assert ack2["frame"] == 2
        assert ack2["caption"] == "opening the fridge"
        assert ack2["latency_ms"] == 42


def test_websocket_inference_error_does_not_break_stream(sync_client, monkeypatch):
    session = StubInferenceSession(error=RuntimeError("modal call failed"))
    monkeypatch.setattr(vision_router, "vision_inference_client", StubInferenceClient(session))
    monkeypatch.setattr(vision_router, "VISION_CHUNK_SECONDS", 0.0)

    with sync_client.websocket_connect("/vision/stream") as ws:
        ws.send_bytes(b"frame-one")
        ws.receive_json()
        ws.send_bytes(b"frame-two")
        ack2 = ws.receive_json()
        assert ack2["frame"] == 2
        assert "modal call failed" in ack2["inference_error"]


def test_websocket_ack_remains_responsive_while_inference_runs(sync_client, monkeypatch):
    session = StubInferenceSession(result={"caption": "walking outside"}, delay_s=0.25)
    monkeypatch.setattr(vision_router, "vision_inference_client", StubInferenceClient(session))
    monkeypatch.setattr(vision_router, "VISION_CHUNK_SECONDS", 0.0)

    with sync_client.websocket_connect("/vision/stream") as ws:
        ws.send_bytes(b"frame-one")
        ws.receive_json()

        start = time.monotonic()
        ws.send_bytes(b"frame-two")
        ack2 = ws.receive_json()
        elapsed = time.monotonic() - start
        assert ack2["frame"] == 2
        assert "caption" not in ack2
        assert elapsed < 0.2

        time.sleep(0.3)
        ws.send_bytes(b"frame-three")
        ack3 = ws.receive_json()
        assert ack3["frame"] == 3
        assert ack3["caption"] == "walking outside"


def test_websocket_fps_logging_at_frame_30(sync_client):
    """Send 30 frames to cover the FPS logging branch (frame_count % 30 == 0)."""
    with sync_client.websocket_connect("/vision/stream") as ws:
        for i in range(30):
            ws.send_bytes(b"x")
            ack = ws.receive_json()
            assert ack["frame"] == i + 1
