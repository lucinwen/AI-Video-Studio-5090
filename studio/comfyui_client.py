from __future__ import annotations

import json
import mimetypes
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .errors import ComfyUIError


@dataclass
class Artifact:
    filename: str
    subfolder: str
    folder_type: str
    kind: str
    node_id: str


class ComfyUIClient:
    """Small standard-library client for ComfyUI's local HTTP API."""

    def __init__(self, base_url: str = "http://127.0.0.1:8188", timeout: int = 30):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.client_id = str(uuid.uuid4())

    def _request(
        self,
        path: str,
        data: bytes | None = None,
        headers: dict[str, str] | None = None,
        timeout: int | None = None,
    ) -> bytes:
        request = urllib.request.Request(
            self.base_url + path,
            data=data,
            headers=headers or {},
            method="POST" if data is not None else "GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout or self.timeout) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise ComfyUIError(f"ComfyUI returned HTTP {exc.code} for {path}: {detail[:3000]}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ComfyUIError(f"Cannot reach ComfyUI at {self.base_url}{path}: {exc}") from exc

    def health(self) -> dict[str, Any]:
        raw = self._request("/system_stats")
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ComfyUIError("ComfyUI /system_stats returned invalid JSON") from exc

    def upload_image(self, image_path: Path, remote_name: str | None = None) -> dict[str, Any]:
        image_path = image_path.expanduser().resolve()
        if not image_path.is_file():
            raise ComfyUIError(f"Input image does not exist: {image_path}")
        content_type = mimetypes.guess_type(image_path.name)[0] or "application/octet-stream"
        proposed_name = Path(remote_name or image_path.name).name
        safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", proposed_name)
        if not safe_name or safe_name.startswith("."):
            safe_name = "studio-upload-" + uuid.uuid4().hex + (image_path.suffix or ".png")
        boundary = "----AIVideoStudio" + uuid.uuid4().hex
        chunks: list[bytes] = []

        def field(name: str, value: str) -> None:
            chunks.append(f"--{boundary}\r\n".encode())
            chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
            chunks.append(value.encode())
            chunks.append(b"\r\n")

        chunks.append(f"--{boundary}\r\n".encode())
        chunks.append(
            f'Content-Disposition: form-data; name="image"; filename="{safe_name}"\r\n'.encode()
        )
        chunks.append(f"Content-Type: {content_type}\r\n\r\n".encode())
        chunks.append(image_path.read_bytes())
        chunks.append(b"\r\n")
        field("type", "input")
        field("overwrite", "false")
        chunks.append(f"--{boundary}--\r\n".encode())
        payload = b"".join(chunks)
        raw = self._request(
            "/upload/image",
            payload,
            {"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        try:
            result = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ComfyUIError("ComfyUI image upload returned invalid JSON") from exc
        if not result.get("name"):
            raise ComfyUIError(f"ComfyUI image upload did not return a filename: {result}")
        return result

    def queue_prompt(self, graph: dict[str, Any]) -> str:
        body = json.dumps(
            {"prompt": graph, "client_id": self.client_id},
            ensure_ascii=False,
        ).encode("utf-8")
        raw = self._request("/prompt", body, {"Content-Type": "application/json"})
        try:
            result = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ComfyUIError("ComfyUI /prompt returned invalid JSON") from exc
        prompt_id = result.get("prompt_id")
        if not prompt_id:
            raise ComfyUIError(f"ComfyUI rejected workflow submission: {result}")
        return str(prompt_id)

    def get_history(self, prompt_id: str) -> dict[str, Any] | None:
        raw = self._request("/history/" + urllib.parse.quote(prompt_id, safe=""))
        try:
            result = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ComfyUIError("ComfyUI history endpoint returned invalid JSON") from exc
        return result.get(prompt_id)

    def wait_for_completion(
        self,
        prompt_id: str,
        timeout_seconds: int = 3600,
        poll_interval: float = 2.0,
    ) -> dict[str, Any]:
        deadline = time.monotonic() + timeout_seconds
        last_status: Any = None
        while time.monotonic() < deadline:
            entry = self.get_history(prompt_id)
            if entry:
                status = entry.get("status") or {}
                last_status = status
                status_str = str(status.get("status_str", "")).lower()
                if status.get("completed") is True or status_str in ("success", "completed"):
                    return entry
                if status_str in ("error", "failed"):
                    raise ComfyUIError(
                        f"Workflow {prompt_id} failed. Status: {json.dumps(status, ensure_ascii=False)[:5000]}"
                    )
                if entry.get("outputs") and not status_str:
                    return entry
            time.sleep(poll_interval)
        raise ComfyUIError(
            f"Timed out waiting for workflow {prompt_id} after {timeout_seconds}s. "
            f"Last status: {last_status}"
        )

    @staticmethod
    def artifacts_from_history(entry: dict[str, Any]) -> list[Artifact]:
        artifacts: list[Artifact] = []
        output_types = {
            "images": "image",
            "gifs": "video",
            "videos": "video",
            "audio": "audio",
        }
        for node_id, output in (entry.get("outputs") or {}).items():
            if not isinstance(output, dict):
                continue
            for field, kind in output_types.items():
                values = output.get(field) or []
                if isinstance(values, dict):
                    values = [values]
                for value in values:
                    if not isinstance(value, dict) or not value.get("filename"):
                        continue
                    artifacts.append(
                        Artifact(
                            filename=str(value["filename"]),
                            subfolder=str(value.get("subfolder", "")),
                            folder_type=str(value.get("type", "output")),
                            kind=kind,
                            node_id=str(node_id),
                        )
                    )
        return artifacts

    def download_artifact(self, artifact: Artifact, destination: Path) -> Path:
        query = urllib.parse.urlencode(
            {
                "filename": artifact.filename,
                "subfolder": artifact.subfolder,
                "type": artifact.folder_type,
            }
        )
        raw = self._request("/view?" + query, timeout=max(self.timeout, 120))
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(raw)
        if not destination.is_file() or destination.stat().st_size == 0:
            raise ComfyUIError(f"Downloaded artifact is empty: {destination}")
        return destination
