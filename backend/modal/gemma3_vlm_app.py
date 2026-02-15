"""Modal app that serves stateful Gemma 3 chunk inference."""

from __future__ import annotations

import os
import time
from typing import Any

import modal

APP_NAME = os.getenv("GEMMA3_VLM_MODAL_APP_NAME", "foresight-gemma3-vlm")
MODEL_ID = os.getenv("GEMMA3_MODEL_ID", "google/gemma-3-4b-it")
GPU_TYPE = os.getenv("GEMMA3_GPU", "L40S")

HF_CACHE = modal.Volume.from_name("gemma3-vlm-hf-cache", create_if_missing=True)
HF_SECRET_NAME = os.getenv("GEMMA3_HF_SECRET_NAME", "").strip()

image = (
    modal.Image.from_registry("python:3.11-slim-bookworm")
    .apt_install("ffmpeg")
    .pip_install(
        "accelerate==1.8.1",
        "numpy==2.2.6",
        "opencv-python-headless==4.12.0.88",
        "pillow==11.3.0",
        "safetensors==0.5.3",
        "torch==2.7.1",
        "torchaudio==2.7.1",
        "torchvision==0.22.1",
        "transformers==4.52.4",
    )
)

app = modal.App(APP_NAME)

CLS_KWARGS: dict[str, Any] = {
    "image": image,
    "gpu": GPU_TYPE,
    "timeout": 1200,
    "scaledown_window": 300,
    "min_containers": 1,
    "volumes": {"/root/.cache/huggingface": HF_CACHE},
}
if HF_SECRET_NAME:
    CLS_KWARGS["secrets"] = [modal.Secret.from_name(HF_SECRET_NAME)]


def _int_or_default(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    return int(raw)


def _float_or_default(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    return float(raw)


def _bool_or_default(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "t", "yes", "y", "on"}


@app.cls(**CLS_KWARGS)
class Gemma3VLMSession:
    """Stateful chunk inference session with lightweight rolling context."""

    @modal.enter()
    def load(self) -> None:
        import cv2
        import numpy as np
        import torch
        from PIL import Image
        from transformers import AutoProcessor, Gemma3ForConditionalGeneration, set_seed

        set_seed(42)
        torch.set_float32_matmul_precision("high")
        torch._dynamo.config.disable = True

        self.cv2 = cv2
        self.np = np
        self.Image = Image
        self.torch = torch
        self.default_prompt = os.getenv(
            "GEMMA3_DEFAULT_PROMPT",
            "Provide a concise present-tense narration of the wearer's current actions and surroundings.",
        )
        self.max_frame_edge = _int_or_default("GEMMA3_MAX_FRAME_EDGE", 720)
        self.max_frames_per_chunk = _int_or_default("GEMMA3_MAX_FRAMES_PER_CHUNK", 6)
        self.max_history_entries = _int_or_default("GEMMA3_MAX_HISTORY_ENTRIES", 6)
        self.max_new_tokens = _int_or_default("GEMMA3_MAX_NEW_TOKENS", 64)
        self.temperature = _float_or_default("GEMMA3_TEMPERATURE", 0.2)
        self.top_p = _float_or_default("GEMMA3_TOP_P", 0.9)
        self.do_sample = _bool_or_default("GEMMA3_DO_SAMPLE", False)
        hf_token = os.getenv("GEMMA3_HF_TOKEN") or os.getenv("HF_TOKEN")

        attn_impl = "flash_attention_2" if torch.cuda.is_available() else "eager"
        model_kwargs: dict[str, Any] = {
            "torch_dtype": "auto",
            "device_map": "cuda" if torch.cuda.is_available() else "auto",
        }
        if hf_token:
            model_kwargs["token"] = hf_token

        try:
            self.model = Gemma3ForConditionalGeneration.from_pretrained(
                MODEL_ID,
                attn_implementation=attn_impl,
                **model_kwargs,
            )
        except Exception:
            # Flash attention is optional in deployment. Fall back to eager if unavailable.
            self.model = Gemma3ForConditionalGeneration.from_pretrained(
                MODEL_ID,
                attn_implementation="eager",
                **model_kwargs,
            )

        processor_kwargs: dict[str, Any] = {}
        if hf_token:
            processor_kwargs["token"] = hf_token
        self.processor = AutoProcessor.from_pretrained(MODEL_ID, use_fast=True, **processor_kwargs)
        self.model.generation_config.top_k = None
        self.model.generation_config.top_p = None
        self.model.eval()

        self.device = next(self.model.parameters()).device
        self.caption_history: list[str] = []

    def _resize_frame(self, frame: Any) -> Any:
        if self.max_frame_edge <= 0:
            return frame

        height, width = frame.shape[:2]
        edge = max(height, width)
        if edge <= self.max_frame_edge:
            return frame

        scale = self.max_frame_edge / edge
        return self.cv2.resize(
            frame,
            (max(int(width * scale), 1), max(int(height * scale), 1)),
            interpolation=self.cv2.INTER_AREA,
        )

    def _decode_chunk(self, frames: list[bytes]) -> list[Any]:
        decoded_frames: list[Any] = []
        for frame_bytes in frames:
            frame_buffer = self.np.frombuffer(frame_bytes, dtype=self.np.uint8)
            frame_bgr = self.cv2.imdecode(frame_buffer, self.cv2.IMREAD_COLOR)
            if frame_bgr is None:
                continue
            frame_rgb = self.cv2.cvtColor(frame_bgr, self.cv2.COLOR_BGR2RGB)
            resized = self._resize_frame(frame_rgb)
            decoded_frames.append(self.Image.fromarray(resized))

        if not decoded_frames:
            raise ValueError("Chunk contained no decodable image frames")

        if self.max_frames_per_chunk <= 0 or len(decoded_frames) <= self.max_frames_per_chunk:
            return decoded_frames

        frame_indices = self.np.linspace(
            0,
            len(decoded_frames) - 1,
            num=self.max_frames_per_chunk,
            dtype=self.np.int32,
        )
        return [decoded_frames[int(idx)] for idx in frame_indices]

    def _history_context(self) -> str:
        if self.max_history_entries <= 0 or not self.caption_history:
            return ""

        window = self.caption_history[-self.max_history_entries :]
        bullets = "\n".join(f"- {entry}" for entry in window)
        return f"Recent prior observations (may be stale):\n{bullets}\n\n"

    def _eos_token_id(self) -> int | None:
        tokenizer = getattr(self.processor, "tokenizer", None)
        if tokenizer is None:
            return None
        return tokenizer.eos_token_id

    @modal.method()
    def infer_chunk(
        self,
        frames: list[bytes],
        start_ts_s: float,
        end_ts_s: float,
        prompt: str,
    ) -> dict[str, Any]:
        started = time.perf_counter()

        if not frames:
            return {
                "caption": "",
                "chunk_start_s": float(start_ts_s),
                "chunk_end_s": float(end_ts_s),
                "latency_ms": 0,
                "tokens_generated": 0,
            }

        sampled_frames = self._decode_chunk(frames)
        query = prompt.strip() or self.default_prompt

        prompt_text = (
            f"Chunk time window: {start_ts_s:.1f}s to {end_ts_s:.1f}s.\n"
            f"{self._history_context()}"
            "Use only what is visible in the provided frames. "
            "Respond with exactly one concise sentence in present tense.\n\n"
            f"Task: {query}"
        )

        content: list[dict[str, Any]] = [{"type": "text", "text": prompt_text}]
        for frame in sampled_frames:
            content.append({"type": "image", "image": frame})

        messages = [{"role": "user", "content": content}]

        inputs = self.processor.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
        ).to(self.device)

        input_length = int(inputs["input_ids"].shape[1])
        generation_kwargs: dict[str, Any] = {
            "max_new_tokens": self.max_new_tokens,
            "do_sample": self.do_sample,
        }
        eos_token_id = self._eos_token_id()
        if eos_token_id is not None:
            generation_kwargs["pad_token_id"] = eos_token_id
        if self.do_sample:
            generation_kwargs["temperature"] = self.temperature
            generation_kwargs["top_p"] = self.top_p

        with self.torch.inference_mode():
            generated = self.model.generate(
                **inputs,
                **generation_kwargs,
            )

        new_tokens = generated[:, input_length:]
        raw_response = self.processor.batch_decode(new_tokens, skip_special_tokens=True)[0]
        caption = " ".join(raw_response.strip().split())

        if caption and self.max_history_entries > 0:
            self.caption_history.append(f"{start_ts_s:.1f}-{end_ts_s:.1f}s: {caption}")
            if len(self.caption_history) > self.max_history_entries:
                self.caption_history = self.caption_history[-self.max_history_entries :]

        latency_ms = int((time.perf_counter() - started) * 1000)
        return {
            "caption": caption,
            "chunk_start_s": float(start_ts_s),
            "chunk_end_s": float(end_ts_s),
            "latency_ms": latency_ms,
            "tokens_generated": int(new_tokens.shape[1]),
        }

    @modal.method()
    def close(self) -> None:
        self.caption_history = []
        if self.torch.cuda.is_available():
            self.torch.cuda.empty_cache()
