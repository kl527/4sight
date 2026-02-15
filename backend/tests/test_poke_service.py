"""Unit tests for the PokeClient service."""

import httpx
import pytest

from app.services.poke import PokeClient


async def test_send_posts_correct_payload(monkeypatch):
    """Verify the actual send() method posts the right headers and body."""
    captured = {}

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["body"] = request.content
        return httpx.Response(200, json={"id": "msg_1", "status": "sent"})

    transport = httpx.MockTransport(mock_handler)

    original_init = httpx.AsyncClient.__init__

    def patched_init(self, **kwargs):
        kwargs["transport"] = transport
        original_init(self, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", patched_init)

    client = PokeClient()
    result = await client.send("drink water", "sk-test")

    assert result == {"id": "msg_1", "status": "sent"}
    assert captured["url"] == PokeClient.ENDPOINT
    assert captured["headers"]["authorization"] == "Bearer sk-test"


async def test_send_raises_on_http_error(monkeypatch):
    """Verify the client propagates HTTP errors."""

    async def error_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "unauthorized"})

    transport = httpx.MockTransport(error_handler)

    original_init = httpx.AsyncClient.__init__

    def patched_init(self, **kwargs):
        kwargs["transport"] = transport
        original_init(self, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", patched_init)

    client = PokeClient()
    with pytest.raises(httpx.HTTPStatusError):
        await client.send("test", "bad-key")
