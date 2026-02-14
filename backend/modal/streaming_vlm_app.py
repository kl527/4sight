"""Modal app that serves stateful StreamingVLM chunk inference."""

from __future__ import annotations

import os
import time
from typing import Any

import modal

APP_NAME = os.getenv("STREAMING_VLM_MODAL_APP_NAME", "foresight-streamingvlm")
MODEL_PATH = os.getenv("STREAMING_VLM_MODEL_PATH", "mit-han-lab/StreamingVLM")
MODEL_BASE = os.getenv("STREAMING_VLM_MODEL_BASE", "Qwen2_5")
GPU_TYPE = os.getenv("STREAMING_VLM_GPU", "A100")

HF_CACHE = modal.Volume.from_name("streaming-vlm-hf-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git")
    .pip_install(
        "accelerate==1.8.1",
        "decord==0.6.0",
        "numpy==2.2.6",
        "opencv-python-headless==4.12.0.88",
        "qwen-vl-utils==0.0.11",
        "safetensors==0.5.3",
        "torch==2.7.1",
        "torchaudio==2.7.1",
        "torchvision==0.22.1",
        "transformers==4.52.4",
    )
    .run_commands(
        "git clone --depth 1 https://github.com/mit-han-lab/streaming-vlm.git /root/streaming-vlm",
        "pip install -e /root/streaming-vlm/streaming_vlm/livecc_utils/",
    )
)

app = modal.App(APP_NAME)


def _int_or_default(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    return int(raw)


def _int_or_none(name: str, default: int | None) -> int | None:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    if raw.lower() in {"none", "null"}:
        return None
    return int(raw)


@app.cls(
    image=image,
    gpu=GPU_TYPE,
    timeout=1200,
    scaledown_window=300,
    volumes={"/root/.cache/huggingface": HF_CACHE},
)
class StreamingVLMSession:
    """Stateful inference session preserving StreamingVLM KV cache."""

    @modal.enter()
    def load(self) -> None:
        import sys

        if "/root/streaming-vlm" not in sys.path:
            sys.path.insert(0, "/root/streaming-vlm")

        import cv2
        import numpy as np
        import torch
        from streaming_vlm.inference.inference import (
            DEFAULT_REPETITION_PENALTY,
            DEFAULT_TEMPERATURE,
            DEFAULT_TEXT_ROUND,
            DEFAULT_TEXT_SINK,
            DEFAULT_TEXT_SLIDING_WINDOW,
            DEFAULT_WINDOW_SIZE,
            MAX_TOKEN_PER_DURATION,
            process_past_kv,
        )
        from streaming_vlm.inference.qwen2.patch_model import convert_qwen2_to_streaming
        from streaming_vlm.inference.qwen2_5.patch_model import convert_qwen2_5_to_streaming
        from streaming_vlm.inference.streaming_args import StreamingArgs
        from streaming_vlm.utils.get_qwen_range import SYSTEM_PROMPT_OFFSET, TOKEN_IDS
        from transformers import (
            AutoProcessor,
            Qwen2_5_VLForConditionalGeneration,
            Qwen2VLForConditionalGeneration,
            set_seed,
        )

        set_seed(42)

        self.cv2 = cv2
        self.np = np
        self.torch = torch
        self.token_ids = TOKEN_IDS
        self.system_prompt_offset = SYSTEM_PROMPT_OFFSET
        self.process_past_kv = process_past_kv
        self.streaming_args = StreamingArgs(pos_mode=os.getenv("STREAMING_VLM_POS_MODE", "shrink"))
        self.max_new_tokens = _int_or_default("STREAMING_VLM_MAX_NEW_TOKENS", MAX_TOKEN_PER_DURATION)
        self.temperature = float(os.getenv("STREAMING_VLM_TEMPERATURE", str(DEFAULT_TEMPERATURE)))
        self.repetition_penalty = float(
            os.getenv("STREAMING_VLM_REPETITION_PENALTY", str(DEFAULT_REPETITION_PENALTY))
        )
        self.window_size = _int_or_default("STREAMING_VLM_WINDOW_SIZE", DEFAULT_WINDOW_SIZE)
        self.text_round = _int_or_default("STREAMING_VLM_TEXT_ROUND", DEFAULT_TEXT_ROUND)
        self.text_sink = _int_or_none("STREAMING_VLM_TEXT_SINK", DEFAULT_TEXT_SINK)
        self.text_sliding_window = _int_or_none(
            "STREAMING_VLM_TEXT_SLIDING_WINDOW",
            DEFAULT_TEXT_SLIDING_WINDOW,
        )
        self.default_prompt = os.getenv(
            "STREAMING_VLM_DEFAULT_PROMPT",
            "Provide a concise present-tense narration of the wearer's current actions and surroundings.",
        )
        self.previous_text = os.getenv("STREAMING_VLM_PREVIOUS_TEXT", "")
        self.max_frame_edge = _int_or_default("STREAMING_VLM_MAX_FRAME_EDGE", 720)

        attn_impl = "flash_attention_2" if torch.cuda.is_available() else "eager"
        model_kwargs = {
            "torch_dtype": "auto",
            "device_map": "cuda" if torch.cuda.is_available() else "auto",
        }

        def _load_qwen2_5() -> Any:
            model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                MODEL_PATH,
                attn_implementation=attn_impl,
                **model_kwargs,
            )
            return convert_qwen2_5_to_streaming(model)

        def _load_qwen2() -> Any:
            model = Qwen2VLForConditionalGeneration.from_pretrained(
                MODEL_PATH,
                attn_implementation=attn_impl,
                **model_kwargs,
            )
            return convert_qwen2_to_streaming(model)

        try:
            if MODEL_BASE == "Qwen2":
                self.model = _load_qwen2()
            else:
                self.model = _load_qwen2_5()
        except Exception:
            # Flash attention is optional in deployment. Fall back to eager if unavailable.
            if MODEL_BASE == "Qwen2":
                self.model = Qwen2VLForConditionalGeneration.from_pretrained(
                    MODEL_PATH,
                    attn_implementation="eager",
                    **model_kwargs,
                )
                self.model = convert_qwen2_to_streaming(self.model)
            else:
                self.model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                    MODEL_PATH,
                    attn_implementation="eager",
                    **model_kwargs,
                )
                self.model = convert_qwen2_5_to_streaming(self.model)

        self.processor = AutoProcessor.from_pretrained(MODEL_PATH, use_fast=False)
        self.device = self.model.device

        self.assistant_start_bias = len(self.processor(text="<|im_start|>assistant\n")["input_ids"][0])
        self.assistant_end_bias = len(self.processor(text=" ...<|im_end|>")["input_ids"][0])

        self.chunk_index = 0
        self.past_key_values = None
        self.full_conversation_history: list[dict[str, Any]] = []
        self.prev_generated_ids = None
        self.recent_video_window_clips: list[Any] = []
        self.recent_pixel_values_videos: list[Any] = []

    def _resize_frame(self, frame: Any) -> Any:
        if self.max_frame_edge <= 0:
            return frame
        height, width = frame.shape[:2]
        edge = max(height, width)
        if edge <= self.max_frame_edge:
            return frame
        scale = self.max_frame_edge / edge
        resized = self.cv2.resize(
            frame,
            (max(int(width * scale), 1), max(int(height * scale), 1)),
            interpolation=self.cv2.INTER_AREA,
        )
        return resized

    def _decode_chunk(self, frames: list[bytes]) -> Any:
        decoded_frames = []
        for frame_bytes in frames:
            buffer = self.np.frombuffer(frame_bytes, dtype=self.np.uint8)
            frame_bgr = self.cv2.imdecode(buffer, self.cv2.IMREAD_COLOR)
            if frame_bgr is None:
                continue
            frame_rgb = self.cv2.cvtColor(frame_bgr, self.cv2.COLOR_BGR2RGB)
            decoded_frames.append(self._resize_frame(frame_rgb))
        if not decoded_frames:
            raise ValueError("Chunk contained no decodable image frames")
        return self.np.stack(decoded_frames, axis=0)

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

        current_video_chunk = self._decode_chunk(frames)
        chunk_duration = max(float(end_ts_s) - float(start_ts_s), 0.001)
        i = self.chunk_index
        query = prompt.strip() or self.default_prompt

        (
            self.past_key_values,
            self.prev_generated_ids,
            self.recent_video_window_clips,
            self.recent_pixel_values_videos,
        ) = self.process_past_kv(
            self.past_key_values,
            i,
            text_round=self.text_round,
            visual_round=self.window_size,
            full_conversation_history=self.full_conversation_history,
            prev_generated_ids=self.prev_generated_ids,
            assistant_start_bias=self.assistant_start_bias,
            assistant_end_bias=self.assistant_end_bias,
            recent_video_window_clips=self.recent_video_window_clips,
            recent_pixel_values_videos=self.recent_pixel_values_videos,
            text_sink=self.text_sink,
            text_sliding_window=self.text_sliding_window,
        )

        self.recent_video_window_clips.append(current_video_chunk)
        time_prompt = f"Time={start_ts_s:.1f}-{end_ts_s:.1f}s"

        if i == 0:
            user_content = [
                {"type": "text", "text": time_prompt},
                {"type": "video", "video": "stream_chunk.mp4"},
                {"type": "text", "text": query},
            ]
            self.full_conversation_history = [
                {"role": "previous text", "content": self.previous_text},
                {"role": "user", "content": user_content},
            ]
            text = self.processor.apply_chat_template(
                self.full_conversation_history,
                tokenize=False,
                add_generation_prompt=True,
            )
        else:
            user_content = [
                {"type": "text", "text": time_prompt},
                {
                    "type": "video",
                    "video": "stream_chunk.mp4",
                    "start": float(start_ts_s),
                    "duration": chunk_duration,
                },
            ]
            self.full_conversation_history.append({"role": "user", "content": user_content})
            text = self.processor.apply_chat_template(
                [{"role": "user", "content": user_content}],
                tokenize=False,
                add_generation_prompt=True,
            )
            text = "\n" + text[self.system_prompt_offset :]

        inputs = self.processor(
            text=[text],
            videos=self.recent_video_window_clips[-1],
            padding=True,
            return_tensors="pt",
        ).to(self.device)

        if self.prev_generated_ids is not None:
            if self.prev_generated_ids[:, -1].item() != self.token_ids["\n"]:
                inputs["input_ids"] = self.torch.cat(
                    [self.prev_generated_ids, inputs["input_ids"]],
                    dim=1,
                )
            else:
                inputs["input_ids"] = self.torch.cat(
                    [self.prev_generated_ids, inputs["input_ids"][:, 1:]],
                    dim=1,
                )
            inputs["attention_mask"] = self.torch.ones_like(inputs["input_ids"])

        self.recent_pixel_values_videos.append(inputs["pixel_values_videos"])
        self.streaming_args.input_ids = inputs["input_ids"]

        if i == 0:
            self.streaming_args.video_grid_thw = inputs["video_grid_thw"]
            self.streaming_args.second_per_grid_ts = inputs.get("second_per_grid_ts")
        else:
            self.streaming_args.video_grid_thw = self.torch.cat(
                [self.streaming_args.video_grid_thw, inputs["video_grid_thw"]],
                dim=0,
            )
            if inputs.get("second_per_grid_ts") is not None:
                if self.streaming_args.second_per_grid_ts is None:
                    self.streaming_args.second_per_grid_ts = inputs["second_per_grid_ts"]
                else:
                    self.streaming_args.second_per_grid_ts = self.torch.cat(
                        [self.streaming_args.second_per_grid_ts, inputs["second_per_grid_ts"]],
                        dim=0,
                    )

        current_input_len = inputs["input_ids"].shape[1]
        with self.torch.inference_mode():
            outputs = self.model.generate(
                **inputs,
                past_key_values=self.past_key_values,
                max_new_tokens=self.max_new_tokens,
                use_cache=True,
                return_dict_in_generate=True,
                do_sample=True,
                repetition_penalty=self.repetition_penalty,
                streaming_args=self.streaming_args,
                pad_token_id=self.token_ids["<|im_end|>"],
                temperature=self.temperature,
            )

        generated_ids = outputs.sequences
        if generated_ids[0, -1].item() != self.token_ids["<|im_end|>"]:
            generated_ids = self.torch.cat(
                [
                    generated_ids,
                    self.torch.tensor([[self.token_ids["<|im_end|>"]]], device=self.device),
                ],
                dim=1,
            )

        newly_generated_ids = generated_ids[:, current_input_len:]
        raw_response = self.processor.batch_decode(newly_generated_ids, skip_special_tokens=True)[0]
        caption = raw_response.removesuffix(" ...").strip()

        self.past_key_values = outputs.past_key_values
        self.prev_generated_ids = generated_ids.clone()
        self.full_conversation_history.append({"role": "assistant", "content": raw_response})
        self.chunk_index += 1

        latency_ms = int((time.perf_counter() - started) * 1000)
        return {
            "caption": caption,
            "chunk_start_s": float(start_ts_s),
            "chunk_end_s": float(end_ts_s),
            "latency_ms": latency_ms,
            "tokens_generated": int(newly_generated_ids.shape[1]),
        }

    @modal.method()
    def close(self) -> None:
        self.past_key_values = None
        self.prev_generated_ids = None
        self.recent_video_window_clips = []
        self.recent_pixel_values_videos = []
        self.full_conversation_history = []
        if self.torch.cuda.is_available():
            self.torch.cuda.empty_cache()
