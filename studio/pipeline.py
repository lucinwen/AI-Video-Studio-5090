from __future__ import annotations

import hashlib
import json
import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .comfyui_client import ComfyUIClient
from .errors import PipelineError
from .media import probe_and_decode
from .registry import load_registry, require_workflow
from .workflow import apply_bindings, load_json, safe_slug


def file_metadata(path: Path) -> dict[str, Any]:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return {"path": str(path), "bytes": path.stat().st_size, "sha256": digest.hexdigest()}


class ImageVideoPipeline:
    """Orchestrates registered ComfyUI API workflows without hard-coding model graphs."""

    def __init__(
        self,
        studio_root: Path,
        registry_path: Path,
        base_url: str | None = None,
        timeout_seconds: int = 3600,
    ):
        self.studio_root = studio_root.expanduser().resolve()
        self.registry_path = registry_path.expanduser().resolve()
        if not self.studio_root.is_dir():
            raise PipelineError(f"StudioRoot does not exist: {self.studio_root}")
        self.registry = load_registry(self.registry_path, self.studio_root)
        comfy_cfg = self.registry.get("comfyui", {})
        self.client = ComfyUIClient(
            base_url or comfy_cfg.get("base_url", "http://127.0.0.1:8188"),
            timeout=int(comfy_cfg.get("request_timeout", 30)),
        )
        self.timeout_seconds = timeout_seconds

    def _new_run(self, project_id: str) -> tuple[str, Path]:
        project = safe_slug(project_id)
        run_id = datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:8]
        run_root = self.studio_root / "05_PROJECTS" / project / "runs" / run_id
        for folder in ("images", "videos", "metadata", "inputs"):
            (run_root / folder).mkdir(parents=True, exist_ok=True)
        return run_id, run_root

    def _run_stage(
        self,
        workflow_key: str,
        context: dict[str, Any],
        run_root: Path,
        expected_kind: str,
        destination_folder: str,
        timeout_seconds: int | None = None,
    ) -> tuple[list[Path], dict[str, Any]]:
        entry = require_workflow(self.registry, workflow_key)
        graph_path = Path(entry["_resolved_api_workflow"])
        graph = apply_bindings(load_json(graph_path), entry.get("bindings") or [], context)
        submitted_graph = run_root / "metadata" / f"{workflow_key}.api.json"
        submitted_graph.write_text(json.dumps(graph, ensure_ascii=False, indent=2), encoding="utf-8")
        started = time.monotonic()
        prompt_id = self.client.queue_prompt(graph)
        history = self.client.wait_for_completion(
            prompt_id,
            timeout_seconds=timeout_seconds or self.timeout_seconds,
        )
        elapsed = round(time.monotonic() - started, 3)
        found = self.client.artifacts_from_history(history)
        artifacts = [item for item in found if item.kind == expected_kind and item.folder_type == "output"]
        if not artifacts:
            raise PipelineError(
                f"Workflow {workflow_key!r} completed but produced no {expected_kind} artifact. "
                f"Found: {[item.kind + ':' + item.filename for item in found]}"
            )
        saved: list[Path] = []
        artifact_records = []
        media = self.registry.get("media_validation")
        for index, artifact in enumerate(artifacts):
            suffix = Path(artifact.filename).suffix or (".png" if expected_kind == "image" else ".mp4")
            name = f"{workflow_key}-{index + 1:02d}{suffix}"
            path = self.client.download_artifact(
                artifact,
                run_root / destination_folder / name,
            )
            saved.append(path)
            artifact_record = file_metadata(path)
            artifact_record["comfyui_node_id"] = artifact.node_id
            artifact_record["comfyui_filename"] = artifact.filename
            if media:
                artifact_record["media_validation"] = probe_and_decode(
                    path, expected_kind, media["ffprobe"], media["ffmpeg"]
                )
            artifact_records.append(artifact_record)
        stage_record = {
            "workflow_key": workflow_key,
            "workflow_id": entry.get("id", workflow_key),
            "model_ids": entry.get("model_ids", []),
            "model_revisions": entry.get("model_revisions", {}),
            "api_workflow": str(graph_path),
            "submitted_graph": file_metadata(submitted_graph),
            "prompt_id": prompt_id,
            "elapsed_seconds": elapsed,
            "seed": context.get("seed"),
            "artifacts": artifact_records,
            "status": "SMOKE_TESTED",
        }
        return saved, stage_record

    def prompt_to_image_to_video(
        self,
        prompt: str,
        video_prompt: str,
        project_id: str = "prompt-to-video",
        negative_prompt: str = "",
        style_prompt: str = "",
        seed: int = 0,
        video_seed: int | None = None,
        image_index: int | None = None,
    ) -> dict[str, Any]:
        if not prompt.strip() or not video_prompt.strip():
            raise PipelineError("Both prompt and video_prompt are required.")
        run_id, run_root = self._new_run(project_id)
        image_context = {
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "style_prompt": style_prompt,
            "seed": int(seed),
        }
        images, image_stage = self._run_stage(
            "text_to_image", image_context, run_root, "image", "images"
        )
        selection_mode = "interactive" if image_index is None else "explicit_index"
        if image_index is None:
            print("Generated image candidates:")
            for index, candidate in enumerate(images):
                print(f"  [{index}] {candidate}")
            try:
                image_index = int(input("Select the keyframe index to animate: ").strip())
            except (EOFError, ValueError) as exc:
                raise PipelineError(
                    "Interactive image selection was unavailable or invalid. "
                    "Run again with --image-index N to select a candidate explicitly."
                ) from exc
        if image_index < 0 or image_index >= len(images):
            raise PipelineError(
                f"image_index {image_index} is out of range; generated {len(images)} candidate(s). "
                "Use --image-index to select another candidate."
            )
        selected = images[image_index]
        remote_name = f"studio-keyframe-{run_id}{selected.suffix or '.png'}"
        uploaded = self.client.upload_image(selected, remote_name=remote_name)
        video_context = {
            "prompt": video_prompt,
            "motion_prompt": video_prompt,
            "negative_prompt": negative_prompt,
            "camera_prompt": "",
            "seed": int(video_seed if video_seed is not None else seed + 1),
            "image_filename": uploaded["name"],
        }
        videos, video_stage = self._run_stage(
            "image_to_video", video_context, run_root, "video", "videos"
        )
        return self._write_run_record(
            run_id,
            run_root,
            "prompt_to_image_to_video",
            {
                "prompt": prompt,
                "video_prompt": video_prompt,
                "negative_prompt": negative_prompt,
                "style_prompt": style_prompt,
                "seed": seed,
                "video_seed": video_context["seed"],
                "selection_mode": selection_mode,
                "selected_image_index": image_index,
                "selected_image": file_metadata(selected),
            },
            [image_stage, video_stage],
            images,
            videos,
        )

    def image_to_video(
        self,
        image_path: Path,
        prompt: str,
        project_id: str = "image-to-video",
        negative_prompt: str = "",
        camera_prompt: str = "",
        seed: int = 0,
    ) -> dict[str, Any]:
        if not prompt.strip():
            raise PipelineError("A motion prompt is required for image-to-video.")
        run_id, run_root = self._new_run(project_id)
        source = image_path.expanduser().resolve()
        if not source.is_file():
            raise PipelineError(f"Input image does not exist: {source}")
        input_copy = run_root / "inputs" / source.name
        shutil.copy2(source, input_copy)
        remote_name = f"studio-input-{run_id}{input_copy.suffix or '.png'}"
        uploaded = self.client.upload_image(input_copy, remote_name=remote_name)
        context = {
            "prompt": prompt,
            "motion_prompt": prompt,
            "negative_prompt": negative_prompt,
            "camera_prompt": camera_prompt,
            "seed": int(seed),
            "image_filename": uploaded["name"],
        }
        videos, stage = self._run_stage(
            "image_to_video", context, run_root, "video", "videos"
        )
        return self._write_run_record(
            run_id,
            run_root,
            "image_to_video",
            {
                "input_image": file_metadata(input_copy),
                "prompt": prompt,
                "negative_prompt": negative_prompt,
                "camera_prompt": camera_prompt,
                "seed": seed,
            },
            [stage],
            [],
            videos,
        )

    def _write_run_record(
        self,
        run_id: str,
        run_root: Path,
        pipeline_id: str,
        inputs: dict[str, Any],
        stages: list[dict[str, Any]],
        images: list[Path],
        videos: list[Path],
    ) -> dict[str, Any]:
        record = {
            "schema_version": 1,
            "run_id": run_id,
            "pipeline_id": pipeline_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "studio_root": str(self.studio_root),
            "run_root": str(run_root),
            "inputs": inputs,
            "stages": stages,
            "images": [file_metadata(path) for path in images],
            "videos": [file_metadata(path) for path in videos],
            "status": "SMOKE_TESTED",
            "note": (
                "ComfyUI execution, artifact download, FFprobe and full decode passed. "
                "Review the result visually before delivery."
                if self.registry.get("media_validation")
                else "ComfyUI execution and artifact download passed. Check the media before delivery."
            ),
        }
        record_path = run_root / "metadata" / "run.json"
        record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        return record
