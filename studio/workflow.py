from __future__ import annotations

import copy
import json
import re
from pathlib import Path
from typing import Any

from .errors import RegistryError


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RegistryError(f"Cannot read JSON file {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise RegistryError(f"Expected a JSON object in {path}")
    return value


def safe_slug(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip()).strip(".-_")
    if not slug:
        raise RegistryError("Project ID must contain at least one letter or number.")
    return slug[:80]


def cast_value(value: Any, cast: str | None) -> Any:
    if cast in (None, "", "auto"):
        return value
    try:
        if cast == "str":
            return str(value)
        if cast == "int":
            return int(value)
        if cast == "float":
            return float(value)
        if cast == "bool":
            if isinstance(value, bool):
                return value
            lowered = str(value).lower()
            if lowered in ("true", "1", "yes"):
                return True
            if lowered in ("false", "0", "no"):
                return False
            raise ValueError("expected true/false")
        if cast == "json":
            return value
    except (TypeError, ValueError) as exc:
        raise RegistryError(f"Cannot cast value {value!r} as {cast}: {exc}") from exc
    raise RegistryError(f"Unsupported binding cast: {cast}")


def apply_bindings(
    graph: dict[str, Any],
    bindings: list[dict[str, Any]],
    context: dict[str, Any],
) -> dict[str, Any]:
    """Return a copy of an API-format graph with declared input bindings applied."""
    result = copy.deepcopy(graph)
    for binding in bindings:
        node_id = str(binding.get("node_id", ""))
        input_name = str(binding.get("input", ""))
        source = binding.get("source")
        required = binding.get("required", True)
        if not node_id or not input_name or not source:
            if required:
                raise RegistryError(f"Invalid required binding; node_id/input/source are required: {binding}")
            continue
        if node_id not in result:
            if required:
                raise RegistryError(f"Binding references missing workflow node {node_id!r}")
            continue
        node = result[node_id]
        if not isinstance(node, dict) or not isinstance(node.get("inputs"), dict):
            if required:
                raise RegistryError(f"Workflow node {node_id!r} has no inputs object")
            continue
        if input_name not in node["inputs"]:
            if required:
                raise RegistryError(
                    f"Workflow node {node_id!r} has no input {input_name!r}; "
                    "re-export the API workflow or correct the binding."
                )
            continue
        if source not in context:
            if required:
                raise RegistryError(f"Pipeline input {source!r} required by node {node_id}:{input_name}")
            continue
        node["inputs"][input_name] = cast_value(context[source], binding.get("cast"))
    return result


def validate_api_workflow(path: Path, bindings: list[dict[str, Any]]) -> dict[str, Any]:
    graph = load_json(path)
    if not graph:
        raise RegistryError(f"API workflow is empty: {path}")
    for node_id, node in graph.items():
        if (
            not isinstance(node, dict)
            or not isinstance(node.get("class_type"), str)
            or not isinstance(node.get("inputs"), dict)
        ):
            raise RegistryError(
                f"{path} does not look like a ComfyUI API-format workflow; "
                f"node {node_id!r} is missing class_type/inputs."
            )
    for binding in bindings:
        node_id = str(binding.get("node_id", ""))
        input_name = str(binding.get("input", ""))
        if not binding.get("source"):
            raise RegistryError(f"{path}: binding {node_id}:{input_name} is missing a source")
        if node_id not in graph:
            raise RegistryError(f"{path}: binding node {node_id!r} does not exist")
        if input_name not in graph[node_id].get("inputs", {}):
            raise RegistryError(f"{path}: binding input {node_id}:{input_name} does not exist")
    return graph
