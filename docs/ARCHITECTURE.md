# Architecture and storage layout

## Design goals

1. Local-first: inference and media processing run on the workstation.
2. Agent-operable: stable CLI/API, structured manifests, predictable paths, logs, and recovery.
3. Reproducible: pinned versions and environment-specific locks.
4. Modular: incompatible nodes/models do not contaminate the production runtime.
5. Expandable: additional models and workflow packs can be added without moving existing weights.
6. Safe: localhost-only services, no destructive disk operations, and no automatic overwrite of approved media.

## Logical architecture

```text
User / Local Agent
       |
       v
Project & Shot Manager ---- Asset / Reference Library
       |
       v
Orchestrator API (localhost)
       |
       +---- Workflow Registry / Model Registry
       |
       v
ComfyUI API (localhost)
       |
       +---- Video generation (Wan, LTX, validated alternatives)
       +---- Image / keyframe generation
       +---- Character / motion workflows
       +---- Video edit / repair
       +---- Audio workflows
       |
       v
Post-production
  FFmpeg / FFprobe / interpolation / upscale / audio
       |
       v
QA + human approval + delivery
```

ComfyUI is the node-based execution engine. It is not by itself the director, project database, asset manager, quality gate, or final editing policy. The orchestration layer should be built only after the ComfyUI API is working reliably.

## Physical storage

Detect the Samsung SSD volume. Use the actual detected mount point in all configuration. Example only:

```text
D:\AI-Video-Studio\
  00_CONTROL\
    config\
    manifests\
    reports\
    recovery\
  01_RUNTIME\
    comfyui\
    environments\
    nodes\
  02_MODELS\
    checkpoints\
    diffusion_models\
    text_encoders\
    clip\
    vae\
    loras\
    controlnet\
    upscale_models\
    video_models\
    audio_models\
    embeddings\
  03_WORKFLOWS\
    ui\
    api\
    templates\
    tests\
  04_ASSETS\
    characters\
    locations\
    props\
    style_frames\
    audio\
  05_PROJECTS\
  06_OUTPUTS\
    previews\
    approved\
    exports\
  07_CACHE\
    huggingface\
    torch\
    pip\
    comfyui\
    temp\
  08_TOOLS\
    ffmpeg\
    utilities\
  09_LOGS\
  10_BACKUPS\
```

The 8 TB SSD is a single storage pool, not a reason to fill it. Preserve 10–15% free capacity for SSD health, temporary decode/encode space, and future model releases.

### Initial capacity budget

These are planning allocations, not measured file sizes. Adjust after inventory and actual model download estimates.

| Area | Planning allowance |
|---|---:|
| Model library | 3.5 TB |
| Project media and outputs | 1.5 TB |
| Cache / temporary working set | 0.8 TB |
| User-approved assets | 0.5 TB |
| Runtime and tools | 0.24 TB |
| Growth reserve | 0.74 TB |
| Total | 7.28 TB |

Use a queue and per-model estimates. Do not pre-download the entire catalog. Cache directories must have configurable quotas and cleanup must only target regenerable cache files, never source assets or approved outputs.

## ComfyUI runtime choice

The agent must compare current official options:
- ComfyUI Desktop: easiest supported Windows onboarding.
- Official NVIDIA Portable: self-contained runtime, useful for isolated deployments and scripted control.
- Source + dedicated virtual environment: maximum control, but greater maintenance burden.

For this dedicated workstation, select the option that best supports reliable automation and custom-node management. Do not install more than one production runtime initially. If a second runtime is useful for experiments, isolate it and share only the model directory.

Do not copy Python packages between Desktop, Portable, and source installs. Do not mix their embedded/interpreter paths.

## Shared model path

Use ComfyUI's supported `extra_model_paths.yaml` configuration where supported by the selected runtime. Validate each model's expected subfolder from its official workflow. Avoid duplicate multi-terabyte model copies. Use symlinks only if permissions and backup behavior are tested and documented.

## GPU memory policy

RTX 5090 has 32 GB VRAM. The agent must:
- record peak allocated and reserved VRAM for each tested workflow;
- use official low-VRAM/offload/quantized modes where available;
- start with low resolution, low frame count, batch size 1;
- avoid loading multiple large models concurrently;
- unload models between stages where possible;
- preserve a known-good baseline before installing custom kernels;
- never claim a model fits based only on parameter count or marketing claims.

128 GB RAM is useful for CPU offload and caching but does not replace VRAM or guarantee that every model can run at full precision.

## Network and security

- Bind ComfyUI and orchestration APIs to 127.0.0.1.
- Do not expose ports to LAN/public internet by default.
- Store tokens in Windows Credential Manager or environment variables, never in Git.
- Use HTTPS official sources and checksum verification.
- Maintain a local software bill of materials.
