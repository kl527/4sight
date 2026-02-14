#!/usr/bin/env python3
"""Replay a local video file to the /vision/stream websocket endpoint."""

from __future__ import annotations

import argparse
import asyncio
import importlib
import json
import os
import shutil
import subprocess
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse


def _build_url_with_magic_word(url: str, magic_word: str | None) -> str:
    if not magic_word:
        return url
    parsed = urlparse(url)
    query = parse_qs(parsed.query, keep_blank_values=True)
    query["magic_word"] = [magic_word]
    new_query = urlencode(query, doseq=True)
    return urlunparse(parsed._replace(query=new_query))


def _ffmpeg_qscale(jpeg_quality: int) -> int:
    quality = max(0, min(100, int(jpeg_quality)))
    # ffmpeg: lower q:v means better quality; map 0..100 -> 31..2
    return max(2, min(31, 31 - round((quality / 100.0) * 29)))


def _probe_fps_ffprobe(video_path: str) -> float | None:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None
    cmd = [
        ffprobe,
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=r_frame_rate",
        "-of",
        "default=nokey=1:noprint_wrappers=1",
        video_path,
    ]
    try:
        out = subprocess.check_output(cmd, text=True, stderr=subprocess.STDOUT, timeout=10).strip()
    except Exception:
        return None
    if not out:
        return None
    if "/" in out:
        num_str, den_str = out.split("/", 1)
        try:
            num = float(num_str)
            den = float(den_str)
            if den > 0:
                return num / den
        except ValueError:
            return None
    try:
        return float(out)
    except ValueError:
        return None


def _get_send_fps(video_path: str, override: float | None) -> float:
    if override is not None and override > 0:
        return override
    fps = _probe_fps_ffprobe(video_path) or 15.0
    if fps <= 1.0:
        fps = 15.0
    return fps


def _import_or_exit(module_name: str, *, install_name: str) -> Any:
    try:
        return importlib.import_module(module_name)
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "Missing dependency: "
            f"{module_name}. Install and rerun with: "
            f"`uv run --with {install_name} scripts/replay_video_to_vision_ws.py ...`"
        ) from exc


def _iter_jpeg_frames_ffmpeg(video_path: str, *, jpeg_quality: int, output_fps: float | None):
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required but not found on PATH")

    cmd = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        video_path,
    ]
    if output_fps is not None and output_fps > 0:
        cmd.extend(["-vf", f"fps={output_fps}"])
    cmd.extend(
        [
            "-f",
            "image2pipe",
            "-vcodec",
            "mjpeg",
            "-q:v",
            str(_ffmpeg_qscale(jpeg_quality)),
            "-",
        ]
    )

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert proc.stdout is not None
    assert proc.stderr is not None

    buffer = bytearray()
    chunk_size = 64 * 1024
    try:
        while True:
            chunk = proc.stdout.read(chunk_size)
            if not chunk:
                break
            buffer.extend(chunk)

            while True:
                soi = buffer.find(b"\xff\xd8")
                if soi < 0:
                    # Keep tiny tail in case marker is split.
                    if len(buffer) > 1:
                        del buffer[:-1]
                    break
                if soi > 0:
                    del buffer[:soi]
                eoi = buffer.find(b"\xff\xd9", 2)
                if eoi < 0:
                    break
                frame = bytes(buffer[: eoi + 2])
                del buffer[: eoi + 2]
                yield frame
    finally:
        proc.stdout.close()
        stderr_data = proc.stderr.read().decode("utf-8", errors="ignore")
        proc.stderr.close()
        return_code = proc.wait(timeout=30)
        if return_code != 0:
            raise RuntimeError(f"ffmpeg failed with code {return_code}: {stderr_data.strip()}")


def _normalize_ws_url(url: str) -> str:
    parsed = urlparse(url)
    scheme = parsed.scheme.lower()
    if scheme == "https":
        parsed = parsed._replace(scheme="wss")
    elif scheme == "http":
        parsed = parsed._replace(scheme="ws")
    elif scheme in {"ws", "wss"}:
        pass
    else:
        raise ValueError(
            f"Unsupported URL scheme `{parsed.scheme}`. Use ws://, wss://, http://, or https://."
        )

    path = parsed.path or ""
    if path in {"", "/"}:
        path = "/vision/stream"
    parsed = parsed._replace(path=path)
    return urlunparse(parsed)


def _load_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--url",
        default=os.getenv("VISION_WS_URL", ""),
        help="WebSocket URL for /vision/stream (or set VISION_WS_URL)",
    )
    parser.add_argument(
        "--video",
        default=os.getenv("VIDEO_PATH", ""),
        help="Local video path (or set VIDEO_PATH)",
    )
    parser.add_argument(
        "--magic-word",
        default=os.getenv("MAGIC_WORD"),
        help="Magic word to pass as query param (?magic_word=...)",
    )
    parser.add_argument(
        "--fps",
        type=float,
        default=3.0,
        help="Sample/send FPS (default: 3)",
    )
    parser.add_argument(
        "--jpeg-quality",
        type=int,
        default=85,
        help="JPEG quality [0-100]",
    )
    parser.add_argument(
        "--max-frames",
        type=int,
        default=0,
        help="Stop after N frames (0 = no limit)",
    )
    parser.add_argument(
        "--log-every",
        type=int,
        default=30,
        help="Print ack every N frames",
    )
    parser.add_argument(
        "--no-sleep",
        action="store_true",
        help="Send as fast as possible instead of realtime cadence",
    )
    return parser.parse_args()


async def _run(args: argparse.Namespace) -> None:
    if not args.url:
        raise ValueError("Missing --url (or VISION_WS_URL)")
    if not args.video:
        raise ValueError("Missing --video (or VIDEO_PATH)")

    websockets = _import_or_exit("websockets", install_name="websockets")

    ws_url = _normalize_ws_url(args.url)
    ws_url = _build_url_with_magic_word(ws_url, args.magic_word)
    send_fps = _get_send_fps(args.video, args.fps)
    sent = 0
    inference_count = 0

    try:
        async with websockets.connect(ws_url, max_size=16_000_000) as ws:
            for frame in _iter_jpeg_frames_ffmpeg(
                args.video,
                jpeg_quality=args.jpeg_quality,
                output_fps=args.fps,
            ):
                await ws.send(frame)
                raw_ack = await ws.recv()
                ack: dict[str, Any] = json.loads(raw_ack)
                sent += 1

                if args.log_every > 0 and sent % args.log_every == 0:
                    print("ack", {"frame": ack.get("frame"), "bytes": ack.get("bytes")})

                if "caption" in ack or "inference_error" in ack:
                    inference_count += 1
                    print("inference", ack)

                if args.max_frames > 0 and sent >= args.max_frames:
                    break

                if not args.no_sleep:
                    await asyncio.sleep(1.0 / send_fps)
    finally:
        pass

    print(
        json.dumps(
            {
                "sent_frames": sent,
                "inference_events": inference_count,
                "send_fps": send_fps,
                "url": ws_url,
            }
        )
    )


def main() -> None:
    args = _load_args()
    asyncio.run(_run(args))


if __name__ == "__main__":
    main()
