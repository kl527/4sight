"""Unit tests for the caption_store service."""

import httpx
import pytest

from app.services import caption_store


async def test_store_caption_noops_when_env_unset(monkeypatch):
    """store_caption should silently return when WORKER_BASE_URL or MAGIC_WORD is empty."""
    monkeypatch.setattr(caption_store, "WORKER_BASE_URL", "")
    monkeypatch.setattr(caption_store, "MAGIC_WORD", "")

    # Should not raise or make any HTTP call
    await caption_store.store_caption(
        caption="test caption",
        chunk_start_s=0.0,
        chunk_end_s=5.0,
    )


async def test_store_caption_noops_when_only_url_set(monkeypatch):
    """store_caption should no-op if MAGIC_WORD is missing."""
    monkeypatch.setattr(caption_store, "WORKER_BASE_URL", "https://worker.example.com")
    monkeypatch.setattr(caption_store, "MAGIC_WORD", "")

    await caption_store.store_caption(
        caption="test caption",
        chunk_start_s=0.0,
        chunk_end_s=5.0,
    )


async def test_store_caption_posts_correct_payload(monkeypatch):
    """store_caption should POST the right body and headers to the worker."""
    captured = {}

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["body"] = request.content
        return httpx.Response(200, json={"ok": True})

    transport = httpx.MockTransport(mock_handler)

    monkeypatch.setattr(caption_store, "WORKER_BASE_URL", "https://worker.example.com")
    monkeypatch.setattr(caption_store, "MAGIC_WORD", "secret123")

    # Patch httpx.AsyncClient to use our mock transport
    original_init = httpx.AsyncClient.__init__

    def patched_init(self, **kwargs):
        kwargs["transport"] = transport
        original_init(self, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", patched_init)

    await caption_store.store_caption(
        caption="a person eating pizza",
        chunk_start_s=1.5,
        chunk_end_s=4.5,
        latency_ms=200,
        tokens_generated=42,
    )

    assert captured["url"] == "https://worker.example.com/captions/upload"
    assert captured["headers"]["x-magic-word"] == "secret123"

    import json

    body = json.loads(captured["body"])
    assert body["caption"] == "a person eating pizza"
    assert body["chunkStartS"] == 1.5
    assert body["chunkEndS"] == 4.5
    assert body["latencyMs"] == 200
    assert body["tokensGenerated"] == 42
    assert body["windowId"].startswith("cap-1.500-4.500-")


async def test_store_caption_swallows_http_errors(monkeypatch):
    """store_caption should log but not raise on HTTP errors."""

    async def error_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="Internal Server Error")

    transport = httpx.MockTransport(error_handler)

    monkeypatch.setattr(caption_store, "WORKER_BASE_URL", "https://worker.example.com")
    monkeypatch.setattr(caption_store, "MAGIC_WORD", "secret123")

    original_init = httpx.AsyncClient.__init__

    def patched_init(self, **kwargs):
        kwargs["transport"] = transport
        original_init(self, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", patched_init)

    # Should not raise
    await caption_store.store_caption(
        caption="test",
        chunk_start_s=0.0,
        chunk_end_s=1.0,
    )


async def test_store_caption_swallows_connection_errors(monkeypatch):
    """store_caption should log but not raise on connection errors."""

    async def raise_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    transport = httpx.MockTransport(raise_handler)

    monkeypatch.setattr(caption_store, "WORKER_BASE_URL", "https://worker.example.com")
    monkeypatch.setattr(caption_store, "MAGIC_WORD", "secret123")

    original_init = httpx.AsyncClient.__init__

    def patched_init(self, **kwargs):
        kwargs["transport"] = transport
        original_init(self, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", patched_init)

    # Should not raise
    await caption_store.store_caption(
        caption="test",
        chunk_start_s=0.0,
        chunk_end_s=1.0,
    )


async def test_store_caption_optional_fields_default_none(monkeypatch):
    """store_caption should send null for optional fields when not provided."""
    captured = {}

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = request.content
        return httpx.Response(200, json={"ok": True})

    transport = httpx.MockTransport(mock_handler)

    monkeypatch.setattr(caption_store, "WORKER_BASE_URL", "https://worker.example.com")
    monkeypatch.setattr(caption_store, "MAGIC_WORD", "secret123")

    original_init = httpx.AsyncClient.__init__

    def patched_init(self, **kwargs):
        kwargs["transport"] = transport
        original_init(self, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", patched_init)

    await caption_store.store_caption(
        caption="test",
        chunk_start_s=0.0,
        chunk_end_s=1.0,
    )

    import json

    body = json.loads(captured["body"])
    assert body["latencyMs"] is None
    assert body["tokensGenerated"] is None
