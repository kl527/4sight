#!/usr/bin/env python3
"""Replay a local video file to the /vision/stream websocket endpoint."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import cv2
import websockets


def _build_url_with_magic_word(url: str, magic_word: str | None) -> str:
    if not magic_word:
        return url
    parsed = urlparse(url)
    query = parse_qs(parsed.query, keep_blank_values=True)
    query["magic_word"] = [magic_word]
    new_query = urlencode(query, doseq=True)
    return urlunparse(parsed._replace(query=new_query))


def _get_send_fps(cap: cv2.VideoCapture, override: float | None) -> float:
    if override is not None and override > 0:
        return override
    fps = cap.get(cv2.CAP_PROP_FPS) or 15.0
    if fps <= 1.0:
        fps = 15.0
    return fps


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
        default=None,
        help="Force send FPS instead of source FPS",
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

    ws_url = _build_url_with_magic_word(args.url, args.magic_word)
    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {args.video}")

    send_fps = _get_send_fps(cap, args.fps)
    sent = 0
    inference_count = 0

    try:
        async with websockets.connect(ws_url, max_size=16_000_000) as ws:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break

                ok, encoded = cv2.imencode(
                    ".jpg",
                    frame,
                    [int(cv2.IMWRITE_JPEG_QUALITY), int(args.jpeg_quality)],
                )
                if not ok:
                    continue

                await ws.send(encoded.tobytes())
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
        cap.release()

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
