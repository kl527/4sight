"""Unit tests for Modal vision inference client/session helpers."""

from __future__ import annotations

import sys
from types import SimpleNamespace

from app.services.vision_inference import ModalVisionInferenceClient


async def test_open_session_without_credentials_returns_noop(monkeypatch):
    monkeypatch.delenv("MODAL_TOKEN_ID", raising=False)
    monkeypatch.delenv("MODAL_TOKEN_SECRET", raising=False)
    monkeypatch.delenv("FORESIGHT_MODAL_TOKEN_ID", raising=False)
    monkeypatch.delenv("FORESIGHT_MODAL_TOKEN_SECRET", raising=False)

    client = ModalVisionInferenceClient()
    session = await client.open_session(headers={})
    result = await session.infer_chunk([b"frame"], 0.0, 1.0, "prompt")
    assert result == {}


async def test_open_session_with_modal_calls_remote(monkeypatch):
    state: dict[str, object] = {}

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

    class RemoteMethod:
        def __init__(self, func):
            self._func = func

        def remote(self, *args, **kwargs):
            return self._func(*args, **kwargs)

    class FakeRemoteInstance:
        def __init__(self):
            self.closed = False
            state["remote_instance"] = self
            self.infer_chunk = RemoteMethod(
                lambda frames, start, end, prompt: {
                    "caption": "running",
                    "chunk_start_s": start,
                    "chunk_end_s": end,
                }
            )
            self.close = RemoteMethod(self._close)

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
            return FakeRemoteClass()

    fake_modal = SimpleNamespace(Client=FakeClientFactory, Cls=FakeCls)
    monkeypatch.setitem(sys.modules, "modal", fake_modal)
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_ID", "token-id")
    monkeypatch.setenv("FORESIGHT_MODAL_TOKEN_SECRET", "token-secret")

    client = ModalVisionInferenceClient()
    session = await client.open_session(
        headers={"x-modal-app-name": "custom-app", "x-modal-class-name": "CustomClass"}
    )
    result = await session.infer_chunk([b"frame"], 2.0, 3.0, "prompt")

    assert result["caption"] == "running"
    assert state["token_id"] == "token-id"
    assert state["token_secret"] == "token-secret"
    assert state["app_name"] == "custom-app"
    assert state["class_name"] == "CustomClass"
    assert state["from_name_client"] is state["client"]

    await session.close()
    assert state["client"].closed is True
    assert state["remote_instance"].closed is True
