from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from .errors import PipelineError


def _run_tool(command: list[str], path: Path) -> str:
    try:
        result = subprocess.run(
            command, capture_output=True, encoding="utf-8", errors="replace", check=False
        )
    except OSError as exc:
        raise PipelineError(f"Could not run {command[0]} for {path}: {exc}") from exc
    if result.returncode:
        detail = result.stderr.strip()[-3000:]
        raise PipelineError(f"{command[0]} failed for {path} (exit {result.returncode}): {detail}")
    return result.stdout


def probe_and_decode(path: Path, kind: str, ffprobe: Path, ffmpeg: Path) -> dict[str, Any]:
    """Read media metadata and fully decode the local artifact into a null sink."""
    if kind not in {"image", "video"}:
        raise PipelineError(f"Unsupported media kind: {kind!r}")
    path = path.resolve()
    try:
        if not path.is_file() or not path.stat().st_size:
            raise PipelineError(f"Missing or empty {kind} artifact: {path}")
    except OSError as exc:
        raise PipelineError(f"Cannot read {kind} artifact {path}: {exc}") from exc

    raw = _run_tool(
        [str(ffprobe), "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", "-i", str(path)],
        path,
    )
    try:
        info = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise PipelineError(f"FFprobe returned invalid JSON for {path}") from exc
    if not isinstance(info, dict) or not isinstance(info.get("format"), dict):
        raise PipelineError(f"FFprobe returned no format metadata for {path}")
    streams = info.get("streams")
    if not isinstance(streams, list) or not any(
        isinstance(stream, dict) and stream.get("codec_type") == "video" for stream in streams
    ):
        raise PipelineError(f"FFprobe found no image or video stream in {path}")

    _run_tool(
        [
            str(ffmpeg), "-nostdin", "-v", "error", "-xerror", "-abort_on", "empty_output_stream",
            "-i", str(path), "-map", "0:v", "-map", "0:a?", "-f", "null", "-",
        ],
        path,
    )
    return {"format": info["format"], "streams": streams, "decode_exit": 0}
