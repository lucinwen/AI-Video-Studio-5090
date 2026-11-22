# Workflow catalog

Every workflow must be a versioned, testable asset. Store both UI workflow JSON and API-format JSON where supported.

## Workflow contract

Each workflow folder should contain:
- workflow.json — ComfyUI UI graph.
- workflow_api.json — API submission graph.
- workflow.yaml — workflow metadata and pinned dependencies.
- README.md — purpose, input instructions, settings, limitations.
- tests/ — small test inputs and expected technical output.
- evidence/ — logs, screenshots/contact sheets, FFprobe report (do not commit large media).

## Required families

### Image generation
- Text-to-image: prompt, negative prompt, seed, dimensions/aspect ratio, style preset; output one or more keyframe candidates.
- Reference-to-image: input reference image(s), prompt, denoise/strength and optional identity/style conditioning; output a refined keyframe.
- Character sheet: reference-driven turnaround or expression/pose sheet. Treat consistency as an evaluated capability, not a promise.

### Video generation
- Text-to-video.
- Image-to-video.
- First/last frame where the selected model supports it.
- Character/reference consistency and motion/animation, with temporal artifacts recorded.

### Pipelines
- Prompt → image → video: run T2I, save candidates, select one, upload it as I2V input, run video workflow.
- Image + prompt → video: upload a local image and run I2V directly.
- References → keyframe → video: optional extension, enable only after separate testing.

## Runtime orchestration

The repository package studio/ provides a standard-library-only ComfyUI API client and registry-driven pipeline runner. It does not hard-code any model's node graph. Actual API workflows are exported from the installed ComfyUI instance and mapped through the local registry at 00_CONTROL/manifests/image-video-pipeline.json.

Each workflow entry declares:
- api_workflow: path relative to StudioRoot;
- bindings: actual API node ID, input name, and pipeline context source;
- model_ids: real model registry IDs;
- enabled: true only after graph validation and local smoke test.

See docs/IMAGE_VIDEO_PIPELINES.zh-CN.md for setup and commands.

## Project naming and outputs

Use project IDs and shot IDs, e.g. project_slug/shot_001/model_workflow_version/seed_timestamp/.

Never overwrite. Every generation creates a unique run directory and metadata sidecar containing prompt, input asset hashes, model/node versions, workflow hash, seed, parameters, ComfyUI queue ID, output path/checksum and QA status. Approved outputs are immutable.
