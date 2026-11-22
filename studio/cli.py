from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from .errors import StudioError
from .pipeline import ImageVideoPipeline
from .registry import load_registry
from .workflow import safe_slug


def default_registry(root: Path) -> Path:
    return root / "00_CONTROL" / "manifests" / "image-video-pipeline.json"


def init_layout(root: Path, repo_root: Path) -> Path:
    root = root.expanduser().resolve()
    if not root.is_dir():
        raise StudioError(f"StudioRoot must already exist: {root}")
    folders = [
        "00_CONTROL/manifests",
        "00_CONTROL/reports",
        "03_WORKFLOWS/api/image/text_to_image",
        "03_WORKFLOWS/api/video/image_to_video",
        "03_WORKFLOWS/api/image/reference_to_image",
        "03_WORKFLOWS/api/pipelines",
    ]
    for relative in folders:
        (root / relative).mkdir(parents=True, exist_ok=True)
    target = default_registry(root)
    if not target.exists():
        example = repo_root / "config" / "image-video-pipeline.example.json"
        if not example.is_file():
            raise StudioError(f"Registry template not found: {example}")
        shutil.copy2(example, target)
        print(f"Created local registry: {target}")
    else:
        print(f"Preserved existing local registry: {target}")
    return target


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ai-video-studio",
        description="Run registry-driven image-to-video pipelines through local ComfyUI.",
    )
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="AI-Video-Studio root directory.")
    parser.add_argument("--registry", type=Path, help="Local pipeline registry JSON.")
    sub = parser.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init", help="Create image/video workflow folders and seed a local registry.")
    init.set_defaults(action="init")

    validate = sub.add_parser("validate", help="Validate enabled API workflows and node bindings.")
    validate.set_defaults(action="validate")

    health = sub.add_parser("health", help="Check the local ComfyUI API.")
    health.set_defaults(action="health")

    run = sub.add_parser("run", help="Run one of the image/video pipelines.")
    run.add_argument("pipeline", choices=("prompt-to-image-to-video", "image-to-video"))
    run.add_argument("--prompt", required=True, help="Image prompt or motion prompt.")
    run.add_argument("--video-prompt", help="Motion prompt for the generated image-to-video stage.")
    run.add_argument("--image", type=Path, help="Input image for image-to-video.")
    run.add_argument("--negative-prompt", default="")
    run.add_argument("--style-prompt", default="")
    run.add_argument("--camera-prompt", default="")
    run.add_argument("--project", default="ai-video-project")
    run.add_argument("--seed", type=int, default=0)
    run.add_argument("--video-seed", type=int)
    run.add_argument("--image-index", type=int, default=None, help="Candidate index; omit to choose interactively.")
    run.add_argument("--timeout", type=int, default=3600)
    run.set_defaults(action="run")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    root = args.root.expanduser().resolve()
    repo_root = Path(__file__).resolve().parents[1]
    registry_path = args.registry.expanduser().resolve() if args.registry else default_registry(root)
    try:
        if args.action == "init":
            init_layout(root, repo_root)
            return 0
        if args.action == "validate":
            registry = load_registry(registry_path, root)
            enabled = [key for key, value in registry["workflows"].items() if value.get("enabled")]
            planned = [key for key, value in registry["workflows"].items() if not value.get("enabled")]
            print(json.dumps({"valid": True, "enabled": enabled, "planned": planned}, ensure_ascii=False, indent=2))
            return 0
        pipeline = ImageVideoPipeline(root, registry_path, timeout_seconds=getattr(args, "timeout", 3600))
        if args.action == "health":
            print(json.dumps(pipeline.client.health(), ensure_ascii=False, indent=2))
            return 0
        if args.action == "run":
            project = safe_slug(args.project)
            if args.pipeline == "prompt-to-image-to-video":
                if not args.video_prompt:
                    raise StudioError("--video-prompt is required for prompt-to-image-to-video.")
                result = pipeline.prompt_to_image_to_video(
                    prompt=args.prompt,
                    video_prompt=args.video_prompt,
                    project_id=project,
                    negative_prompt=args.negative_prompt,
                    style_prompt=args.style_prompt,
                    seed=args.seed,
                    video_seed=args.video_seed,
                    image_index=args.image_index,
                )
            else:
                if not args.image:
                    raise StudioError("--image is required for image-to-video.")
                result = pipeline.image_to_video(
                    image_path=args.image,
                    prompt=args.prompt,
                    project_id=project,
                    negative_prompt=args.negative_prompt,
                    camera_prompt=args.camera_prompt,
                    seed=args.seed,
                )
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0
    except StudioError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
