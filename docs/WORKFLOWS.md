# Workflow catalog

Every workflow must be a versioned, testable asset. Store both UI workflow JSON and API-format JSON where supported.

## Workflow contract

Each workflow folder contains:
- `workflow.json` — ComfyUI UI graph.
- `workflow_api.json` — API submission graph, if applicable.
- `workflow.yaml` — workflow metadata and pinned dependencies.
- `README.md` — purpose, input instructions, settings, limitations.
- `tests/` — small test input references and expected technical output.
- `evidence/` — logs, screenshots/contact sheets, FFprobe report (do not commit large media).

Workflow manifest fields:
- workflow_id, version, purpose, model IDs/revisions;
- required node repositories/commit SHAs;
- required input files and schemas;
- tested resolution, frame count, fps, batch size;
- expected output codec/container/audio streams;
- peak VRAM/RAM and measured generation duration;
- status and evidence links;
- known failure modes and rollback.

## Required families

### 01 — Text-to-video
Prompt to video. Include shot duration, resolution, FPS, seed, and model profile. Include low-memory preset.

### 02 — Image-to-video
Use a still frame as visual anchor. Document aspect ratio, image dimensions, motion prompt, and any conditioning nodes.

### 03 — First/last frame
Generate controlled transition between keyframes where model supports it. Verify the exact upstream workflow and node implementation.

### 04 — Character/reference consistency
Reference images, character sheets, identity conditioning, and repeated shot tests. Compare face, hair, costume, body proportions, and style across multiple outputs. Treat identity score as advisory.

### 05 — Motion / animation
Pose, driving video, motion reference, or animation transfer. Record supported inputs, frame limits, and temporal artifacts.

### 06 — Video-to-video / editing
Video restyling, inpainting, object/region editing, background changes, and temporal consistency. Only include tools with verified current integration.

### 07 — Audio-video
Synchronized speech, ambient sound, or generated audio. Validate audio stream, duration, sample rate, and sync offset with FFprobe and listening review.

### 08 — Upscale / restoration
Video enhancement and upscaling. Preserve original input; write derived output to a new versioned path. Compare representative frames and avoid false detail claims.

### 09 — Frame interpolation
Interpolation to a target FPS. Check motion artifacts and duplicate/warped frames. Preserve source FPS and output settings in metadata.

### 10 — Assembly / delivery
FFmpeg-based cut, concat, mux, transcode, audio normalization, and export presets. Verify duration, dimensions, frame rate, codec, audio, and decode integrity.

## Project naming and outputs

Use project IDs and shot IDs, e.g.:
`project_slug/shot_001/model_workflow_version/seed_timestamp/`

Never overwrite. Every generation creates a unique run directory and a metadata sidecar containing:
- prompt and negative prompt;
- input asset hashes;
- model and node versions;
- workflow hash;
- seed and parameters;
- queue/prompt ID;
- output path and checksum;
- QA status.

Approved outputs are immutable. A revision creates a new version.
