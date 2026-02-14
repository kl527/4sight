"""Unit tests for the PokeClient service."""

import httpx
import pytest

from app.services.poke import PokeClient


async def test_send_posts_correct_payload():
    """Verify the client sends the right headers and body to Poke."""
    captured = {}

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["body"] = request.content
        return httpx.Response(200, json={"id": "msg_1", "status": "sent"})

    transport = httpx.MockTransport(mock_handler)
    client = PokeClient()
    # Monkey-patch to inject our mock transport
    original_send = client.send

    async def patched_send(message: str, api_key: str) -> dict:
        async with httpx.AsyncClient(transport=transport) as c:
            resp = await c.post(
                PokeClient.ENDPOINT,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={"message": message},
            )
            resp.raise_for_status()
            return resp.json()

    result = await patched_send("drink water", "sk-test")
    assert result == {"id": "msg_1", "status": "sent"}
    assert captured["url"] == PokeClient.ENDPOINT
    assert captured["headers"]["authorization"] == "Bearer sk-test"


async def test_send_raises_on_http_error():
    """Verify the client propagates HTTP errors."""

    async def error_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "unauthorized"})

    transport = httpx.MockTransport(error_handler)
    client = PokeClient()

    with pytest.raises(httpx.HTTPStatusError):
        async with httpx.AsyncClient(transport=transport) as c:
            resp = await c.post(
                PokeClient.ENDPOINT,
                headers={"Authorization": "Bearer bad-key", "Content-Type": "application/json"},
                json={"message": "test"},
            )
            resp.raise_for_status()
