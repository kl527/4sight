"""Integration tests for the /vision/stream WebSocket endpoint."""

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app


@pytest.fixture
def sync_client():
    return TestClient(app)


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
