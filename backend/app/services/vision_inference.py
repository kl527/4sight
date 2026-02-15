"""Vision inference client abstraction for Modal-backed VLM inference."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Protocol

logger = logging.getLogger(__name__)

DEFAULT_MODAL_APP_NAME = "foresight-gemma3-vlm"
DEFAULT_MODAL_CLASS_NAME = "Gemma3VLMSession"


@dataclass(frozen=True)
class ModalConfig:
    token_id: str | None
    token_secret: str | None
    app_name: str
    class_name: str


class VisionInferenceSession(Protocol):
    async def infer_chunk(
        self,
        frames: list[bytes],
        start_ts_s: float,
        end_ts_s: float,
        prompt: str,
    ) -> dict[str, Any]:
        ...

    async def close(self) -> None:
        ...


class VisionInferenceClient(Protocol):
    async def open_session(self, headers: Mapping[str, str] | None = None) -> VisionInferenceSession:
        ...


def _header_value(headers: Mapping[str, str] | None, name: str) -> str | None:
    if headers is None:
        return None
    value = headers.get(name)
    if value is None:
        value = headers.get(name.lower())
    if value is None:
        value = headers.get(name.upper())
    if not value:
        return None
    return value.strip()


def _resolve_modal_config(headers: Mapping[str, str] | None) -> ModalConfig:
    token_id = (
        _header_value(headers, "x-modal-token-id")
        or os.getenv("MODAL_TOKEN_ID")
        or os.getenv("FORESIGHT_MODAL_TOKEN_ID")
    )
    token_secret = (
        _header_value(headers, "x-modal-token-secret")
        or os.getenv("MODAL_TOKEN_SECRET")
        or os.getenv("FORESIGHT_MODAL_TOKEN_SECRET")
    )
    app_name = (
        _header_value(headers, "x-modal-app-name")
        or os.getenv("MODAL_APP_NAME")
        or os.getenv("FORESIGHT_MODAL_APP_NAME")
        or DEFAULT_MODAL_APP_NAME
    )
    class_name = (
        _header_value(headers, "x-modal-class-name")
        or os.getenv("MODAL_CLASS_NAME")
        or os.getenv("FORESIGHT_MODAL_CLASS_NAME")
        or DEFAULT_MODAL_CLASS_NAME
    )
    return ModalConfig(
        token_id=token_id,
        token_secret=token_secret,
        app_name=app_name,
        class_name=class_name,
    )


class NoopVisionInferenceSession:
    async def infer_chunk(
        self,
        frames: list[bytes],
        start_ts_s: float,
        end_ts_s: float,
        prompt: str,
    ) -> dict[str, Any]:
        return {}

    async def close(self) -> None:
        return None


class ModalVisionInferenceSession:
    def __init__(self, remote_instance: Any, client: Any | None):
        self._remote_instance = remote_instance
        self._client = client

    async def infer_chunk(
        self,
        frames: list[bytes],
        start_ts_s: float,
        end_ts_s: float,
        prompt: str,
    ) -> dict[str, Any]:
        started = time.perf_counter()
        response = await asyncio.to_thread(
            self._remote_instance.infer_chunk.remote,
            frames,
            start_ts_s,
            end_ts_s,
            prompt,
        )
        if not isinstance(response, dict):
            raise RuntimeError("Modal inference returned a non-dict payload")
        response.setdefault("latency_ms", int((time.perf_counter() - started) * 1000))
        return response

    async def close(self) -> None:
        try:
            await asyncio.to_thread(self._remote_instance.close.remote)
        except Exception:
            logger.exception("Failed to close Modal inference session")

        if self._client is not None and hasattr(self._client, "close"):
            try:
                await asyncio.to_thread(self._client.close)
            except Exception:
                logger.exception("Failed to close Modal client")


class ModalVisionInferenceClient:
    async def open_session(self, headers: Mapping[str, str] | None = None) -> VisionInferenceSession:
        config = _resolve_modal_config(headers)
        if not config.token_id or not config.token_secret:
            logger.info("Modal credentials not configured; vision inference disabled")
            return NoopVisionInferenceSession()

        try:
            import modal
        except ImportError:
            logger.warning("Modal SDK unavailable; vision inference disabled")
            return NoopVisionInferenceSession()

        client = None
        try:
            client_factory = getattr(getattr(modal, "Client", None), "from_credentials", None)
            if callable(client_factory):
                client = client_factory(
                    token_id=config.token_id,
                    token_secret=config.token_secret,
                )
                remote_cls = modal.Cls.from_name(config.app_name, config.class_name, client=client)
            else:
                os.environ.setdefault("MODAL_TOKEN_ID", config.token_id)
                os.environ.setdefault("MODAL_TOKEN_SECRET", config.token_secret)
                remote_cls = modal.Cls.from_name(config.app_name, config.class_name)

            remote_instance = remote_cls()
            return ModalVisionInferenceSession(remote_instance=remote_instance, client=client)
        except Exception:
            logger.exception(
                "Failed to initialize Modal inference session (app=%s class=%s)",
                config.app_name,
                config.class_name,
            )
            if client is not None and hasattr(client, "close"):
                try:
                    await asyncio.to_thread(client.close)
                except Exception:
                    logger.exception("Failed to close Modal client after init error")
            return NoopVisionInferenceSession()


vision_inference_client: VisionInferenceClient = ModalVisionInferenceClient()
