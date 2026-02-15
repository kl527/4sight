"""Unit tests for Modal vision inference client/session helpers."""

from __future__ import annotations

import sys
from types import SimpleNamespace

import pytest

from app.services.vision_inference import (
    DEFAULT_MODAL_APP_NAME,
    DEFAULT_MODAL_CLASS_NAME,
    ModalVisionInferenceClient,
    ModalVisionInferenceSession,
    NoopVisionInferenceSession,
    _header_value,
)


# ---------------------------------------------------------------------------
# _header_value
# ---------------------------------------------------------------------------


def test_header_value_returns_none_when_headers_is_none():
    assert _header_value(None, "x-foo") is None


def test_header_value_finds_exact_key():
    assert _header_value({"x-foo": "bar"}, "x-foo") == "bar"


def test_header_value_finds_lowercase_key():
    assert _header_value({"x-foo": "bar"}, "X-Foo") == "bar"


def test_header_value_finds_uppercase_key():
    assert _header_value({"X-FOO": "baz"}, "x-foo") == "baz"


def test_header_value_strips_whitespace():
    assert _header_value({"x-foo": "  bar  "}, "x-foo") == "bar"


def test_header_value_returns_none_for_missing_key():
    assert _header_value({"x-bar": "val"}, "x-foo") is None


def test_header_value_returns_none_for_empty_string():
    assert _header_value({"x-foo": ""}, "x-foo") is None


# ---------------------------------------------------------------------------
# NoopVisionInferenceSession
# ---------------------------------------------------------------------------


async def test_noop_session_infer_chunk_returns_empty():
    session = NoopVisionInferenceSession()
    result = await session.infer_chunk([b"frame"], 0.0, 1.0, "prompt")
    assert result == {}


async def test_noop_session_close_returns_none():
    session = NoopVisionInferenceSession()
    result = await session.close()
    assert result is None


# ---------------------------------------------------------------------------
# ModalVisionInferenceClient.open_session — no credentials
# ---------------------------------------------------------------------------


async def test_open_session_without_credentials_returns_noop(monkeypatch):
    monkeypatch.delenv("MODAL_TOKEN_ID", raising=False)
    monkeypatch.delenv("MODAL_TOKEN_SECRET", raising=False)
    monkeypatch.delenv("FORESIGHT_MODAL_TOKEN_ID", raising=False)
    monkeypatch.delenv("FORESIGHT_MODAL_TOKEN_SECRET", raising=False)

    client = ModalVisionInferenceClient()
    session = await client.open_session(headers={})
    result = await session.infer_chunk([b"frame"], 0.0, 1.0, "prompt")
    assert result == {}


async def test_open_session_without_credentials_headers_none(monkeypatch):
    """Cover _header_value(None, ...) path when headers=None (the default)."""
    monkeypatch.delenv("MODAL_TOKEN_ID", raising=False)
    monkeypatch.delenv("MODAL_TOKEN_SECRET", raising=False)
    monkeypatch.delenv("FORESIGHT_MODAL_TOKEN_ID", raising=False)
    monkeypatch.delenv("FORESIGHT_MODAL_TOKEN_SECRET", raising=False)

    client = ModalVisionInferenceClient()
    session = await client.open_session()  # headers defaults to None
    assert isinstance(session, NoopVisionInferenceSession)


# ---------------------------------------------------------------------------
# ModalVisionInferenceClient.open_session — Modal SDK unavailable
# ---------------------------------------------------------------------------


async def test_open_session_falls_back_when_modal_import_fails(monkeypatch):
    """When 'import modal' raises ImportError, fall back to noop session."""
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_ID", "id")
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_SECRET", "secret")
    # Remove modal from sys.modules and make import fail
    monkeypatch.delitem(sys.modules, "modal", raising=False)

    import builtins

    real_import = builtins.__import__

    def fail_modal(name, *args, **kwargs):
        if name == "modal":
            raise ImportError("no modal")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fail_modal)

    client = ModalVisionInferenceClient()
    session = await client.open_session(headers={})
    assert isinstance(session, NoopVisionInferenceSession)


# ---------------------------------------------------------------------------
# Helper to set up a fake modal module
# ---------------------------------------------------------------------------


class RemoteMethod:
    def __init__(self, func):
        self._func = func

    def remote(self, *args, **kwargs):
        return self._func(*args, **kwargs)


def _make_fake_modal(
    *,
    state: dict,
    has_from_credentials: bool = True,
    infer_func=None,
    close_func=None,
    from_name_raises: Exception | None = None,
):
    """Build a fake 'modal' SimpleNamespace for injection into sys.modules."""

    class FakeClient:
        def __init__(self):
            self.closed = False

        def close(self):
            self.closed = True

    class FakeClientFactory:
        @staticmethod
        def from_credentials(token_id: str, token_secret: str):
            state["token_id"] = token_id
            state["token_secret"] = token_secret
            client = FakeClient()
            state["client"] = client
            return client

    class FakeRemoteInstance:
        def __init__(self):
            self.closed = False
            state["remote_instance"] = self
            self.infer_chunk = RemoteMethod(
                infer_func
                or (
                    lambda frames, start, end, prompt: {
                        "caption": "ok",
                        "chunk_start_s": start,
                        "chunk_end_s": end,
                    }
                )
            )
            self.close = RemoteMethod(
                close_func or self._close
            )

        def _close(self):
            self.closed = True

    class FakeRemoteClass:
        def __call__(self):
            return FakeRemoteInstance()

    class FakeCls:
        @staticmethod
        def from_name(app_name: str, class_name: str, client=None):
            state["app_name"] = app_name
            state["class_name"] = class_name
            state["from_name_client"] = client
            if from_name_raises:
                raise from_name_raises
            return FakeRemoteClass()

    if has_from_credentials:
        return SimpleNamespace(Client=FakeClientFactory, Cls=FakeCls)
    else:
        # Client exists but without from_credentials
        return SimpleNamespace(Client=SimpleNamespace(), Cls=FakeCls)


# ---------------------------------------------------------------------------
# ModalVisionInferenceClient.open_session — happy path with from_credentials
# ---------------------------------------------------------------------------


async def test_open_session_with_modal_calls_remote(monkeypatch):
    state: dict[str, object] = {}
    fake_modal = _make_fake_modal(state=state)
    monkeypatch.setitem(sys.modules, "modal", fake_modal)
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_ID", "token-id")
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_SECRET", "token-secret")

    client = ModalVisionInferenceClient()
    session = await client.open_session(
        headers={"x-modal-app-name": "custom-app", "x-modal-class-name": "CustomClass"}
    )
    result = await session.infer_chunk([b"frame"], 2.0, 3.0, "prompt")

    assert result["caption"] == "ok"
    assert state["token_id"] == "token-id"
    assert state["token_secret"] == "token-secret"
    assert state["app_name"] == "custom-app"
    assert state["class_name"] == "CustomClass"
    assert state["from_name_client"] is state["client"]

    await session.close()
    assert state["client"].closed is True
    assert state["remote_instance"].closed is True


async def test_open_session_uses_gemma_defaults_when_app_and_class_missing(monkeypatch):
    state: dict[str, object] = {}
    fake_modal = _make_fake_modal(state=state)
    monkeypatch.setitem(sys.modules, "modal", fake_modal)
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_ID", "token-id")
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_SECRET", "token-secret")
    monkeypatch.delenv("FORESIGHT_MODAL_APP_NAME", raising=False)
    monkeypatch.delenv("FORESIGHT_MODAL_CLASS_NAME", raising=False)
    monkeypatch.delenv("MODAL_APP_NAME", raising=False)
    monkeypatch.delenv("MODAL_CLASS_NAME", raising=False)

    client = ModalVisionInferenceClient()
    session = await client.open_session(headers={})
    await session.infer_chunk([b"frame"], 0.0, 1.0, "prompt")

    assert state["app_name"] == DEFAULT_MODAL_APP_NAME
    assert state["class_name"] == DEFAULT_MODAL_CLASS_NAME


# ---------------------------------------------------------------------------
# ModalVisionInferenceClient.open_session — fallback without from_credentials
# ---------------------------------------------------------------------------


async def test_open_session_fallback_without_from_credentials(monkeypatch):
    """When Client.from_credentials doesn't exist, fall back to env vars."""
    state: dict[str, object] = {}
    fake_modal = _make_fake_modal(state=state, has_from_credentials=False)
    monkeypatch.setitem(sys.modules, "modal", fake_modal)
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_ID", "tid")
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_SECRET", "tsec")

    client = ModalVisionInferenceClient()
    session = await client.open_session(headers={})
    result = await session.infer_chunk([b"frame"], 0.0, 1.0, "p")
    assert result["caption"] == "ok"
    # Should NOT have passed client to from_name
    assert state["from_name_client"] is None


# ---------------------------------------------------------------------------
# ModalVisionInferenceClient.open_session — init failure + client cleanup
# ---------------------------------------------------------------------------


async def test_open_session_returns_noop_on_init_failure(monkeypatch):
    """When from_name() raises, return noop and clean up client."""
    state: dict[str, object] = {}
    fake_modal = _make_fake_modal(
        state=state, from_name_raises=RuntimeError("bad init")
    )
    monkeypatch.setitem(sys.modules, "modal", fake_modal)
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_ID", "tid")
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_SECRET", "tsec")

    client = ModalVisionInferenceClient()
    session = await client.open_session(headers={})
    assert isinstance(session, NoopVisionInferenceSession)
    # Client should have been cleaned up
    assert state["client"].closed is True


async def test_open_session_handles_client_close_failure_on_init_error(monkeypatch):
    """When from_name() raises AND client.close() also raises, still return noop."""
    state: dict[str, object] = {}

    class FailingCloseClient:
        def close(self):
            raise RuntimeError("close failed")

    class FakeClientFactory:
        @staticmethod
        def from_credentials(token_id, token_secret):
            client = FailingCloseClient()
            state["client"] = client
            return client

    class FakeCls:
        @staticmethod
        def from_name(app_name, class_name, client=None):
            raise RuntimeError("init failed")

    fake_modal = SimpleNamespace(Client=FakeClientFactory, Cls=FakeCls)
    monkeypatch.setitem(sys.modules, "modal", fake_modal)
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_ID", "tid")
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_SECRET", "tsec")

    client = ModalVisionInferenceClient()
    session = await client.open_session(headers={})
    assert isinstance(session, NoopVisionInferenceSession)


# ---------------------------------------------------------------------------
# ModalVisionInferenceSession.infer_chunk
# ---------------------------------------------------------------------------


async def test_modal_session_infer_chunk_raises_on_non_dict(monkeypatch):
    """infer_chunk raises RuntimeError when Modal returns a non-dict."""
    state: dict[str, object] = {}
    fake_modal = _make_fake_modal(
        state=state,
        infer_func=lambda frames, start, end, prompt: "not-a-dict",
    )
    monkeypatch.setitem(sys.modules, "modal", fake_modal)
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_ID", "tid")
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_SECRET", "tsec")

    client = ModalVisionInferenceClient()
    session = await client.open_session(headers={})

    with pytest.raises(RuntimeError, match="non-dict"):
        await session.infer_chunk([b"frame"], 0.0, 1.0, "p")


async def test_modal_session_infer_chunk_sets_latency(monkeypatch):
    """infer_chunk sets latency_ms if not already present."""
    state: dict[str, object] = {}
    fake_modal = _make_fake_modal(
        state=state,
        infer_func=lambda frames, start, end, prompt: {"caption": "hi"},
    )
    monkeypatch.setitem(sys.modules, "modal", fake_modal)
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_ID", "tid")
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_SECRET", "tsec")

    client = ModalVisionInferenceClient()
    session = await client.open_session(headers={})
    result = await session.infer_chunk([b"frame"], 0.0, 1.0, "p")
    assert "latency_ms" in result
    assert isinstance(result["latency_ms"], int)


# ---------------------------------------------------------------------------
# ModalVisionInferenceSession.close — error paths
# ---------------------------------------------------------------------------


async def test_modal_session_close_swallows_remote_close_error(monkeypatch):
    """close() logs but doesn't raise when remote close fails."""
    state: dict[str, object] = {}

    def failing_close():
        raise RuntimeError("close failed")

    fake_modal = _make_fake_modal(state=state, close_func=failing_close)
    monkeypatch.setitem(sys.modules, "modal", fake_modal)
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_ID", "tid")
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_SECRET", "tsec")

    client = ModalVisionInferenceClient()
    session = await client.open_session(headers={})

    # Should not raise
    await session.close()


async def test_modal_session_close_swallows_client_close_error(monkeypatch):
    """close() logs but doesn't raise when client.close() fails."""
    state: dict[str, object] = {}
    fake_modal = _make_fake_modal(state=state)
    monkeypatch.setitem(sys.modules, "modal", fake_modal)
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_ID", "tid")
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_SECRET", "tsec")

    client = ModalVisionInferenceClient()
    session = await client.open_session(headers={})

    # Sabotage the client's close method
    state["client"].close = lambda: (_ for _ in ()).throw(RuntimeError("boom"))

    # Should not raise
    await session.close()
