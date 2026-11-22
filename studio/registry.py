from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .errors import RegistryError
from .workflow import validate_api_workflow


def load_registry(path: Path, studio_root: Path) -> dict[str, Any]:
    try:
        registry = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RegistryError(f"Cannot read pipeline registry {path}: {exc}") from exc
    if registry.get("schema_version") != 1:
        raise RegistryError("Unsupported pipeline registry schema_version; expected 1.")
    if not isinstance(registry.get("workflows"), dict):
        raise RegistryError("Registry must contain a workflows object.")
    root = studio_root.resolve()
    for key, entry in registry["workflows"].items():
        if not isinstance(entry, dict):
            raise RegistryError(f"Workflow entry {key!r} must be an object.")
        if not entry.get("enabled", False):
            continue
        rel = entry.get("api_workflow")
        if not rel:
            raise RegistryError(f"Enabled workflow {key!r} has no api_workflow path.")
        workflow_path = (root / rel).resolve()
        if root not in workflow_path.parents:
            raise RegistryError(f"Workflow path escapes StudioRoot: {rel}")
        bindings = entry.get("bindings") or []
        validate_api_workflow(workflow_path, bindings)
        entry["_resolved_api_workflow"] = str(workflow_path)
    return registry


def require_workflow(registry: dict[str, Any], key: str) -> dict[str, Any]:
    entry = registry.get("workflows", {}).get(key)
    if not entry:
        raise RegistryError(f"Workflow {key!r} is not registered.")
    if not entry.get("enabled", False):
        raise RegistryError(
            f"Workflow {key!r} is not enabled. Export a ComfyUI API workflow, configure its node bindings, "
            "validate it, then set enabled=true in the local registry."
        )
    return entry
