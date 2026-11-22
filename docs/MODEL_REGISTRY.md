# Model registry and acquisition policy

This document defines candidate tracks. The local agent must verify current official model cards, licenses, revisions, and Windows/Blackwell requirements at installation time. A candidate is not a promise of compatibility.

## Registry schema

Each model entry must contain:

```yaml
id: vendor-model-task
display_name: Model display name
task: text-to-video
source:
  repository: https://...
  revision: exact-tag-or-commit
  model_card: https://...
license:
  identifier: ...
  url: https://...
  gated: false
files:
  - filename: weights.safetensors
    destination: diffusion_models
    size_bytes: null
    sha256: null
runtime:
  os: [windows]
  gpu_architecture: [blackwell]
  vram_gb_min: null
  precision: bf16
  quantization: []
  offload: []
  python: exact-tested-version
  torch: exact-tested-version
  cuda_build: exact-tested-build
nodes:
  - repository: https://...
    revision: exact-commit
workflow:
  path: workflows/...
  format: comfyui-api
tests:
  status: PLANNED
  tested_at: null
  peak_vram_gb: null
  peak_ram_gb: null
  output_path: null
  log_path: null
limitations: []
```

Unknown values must remain null/unknown until verified. Never invent file sizes, hashes, memory requirements, or licenses.

## Priority track 1 — Wan 2.2

Official upstream:
- Code: https://github.com/Wan-Video/Wan2.2
- ComfyUI examples: https://github.com/comfyanonymous/ComfyUI_examples/tree/master/wan22

Investigate:
- official T2V and I2V paths;
- available 5B and 14B model variants and their exact file sets;
- high/low-noise model pairing where required;
- text encoder, VAE, LoRA, and any auxiliary components;
- quantization/offload options explicitly supported by current workflow;
- Windows and Blackwell compatibility.

Start with the smallest official workflow that proves the pipeline. Do not download every variant until the first generation is validated.

## Priority track 2 — LTX-2.5

Official sources:
- Model/inference repository: https://github.com/Lightricks/LTX-2
- ComfyUI nodes/workflows: https://github.com/Lightricks/ComfyUI-LTXVideo
- Official ComfyUI guide: https://docs.ltx.io/open-source-model/integration-tools/comfy-ui

The current official integration guide documents a CUDA GPU with 32 GB+ VRAM and 100 GB+ free disk for models/cache. RTX 5090 has 32 GB VRAM, so treat it as a boundary configuration:
- test official recommended precision/quantization and offload paths;
- start at conservative resolution, frame count, and batch size 1;
- capture peak VRAM and system RAM;
- do not claim it works until an actual audio-video generation and FFprobe check pass.

LTX includes audio-video capabilities. Verify audio stream presence and synchronization rather than assuming a silent video sample proves the track.

## Priority track 3 — image/keyframe generation

Select one image model after comparing:
- current quality and reference-image capabilities;
- official ComfyUI integration;
- Blackwell compatibility;
- VRAM and storage footprint;
- license and gated access;
- Windows custom-node dependencies.

Use it for character sheets, location/style frames, keyframes, and image-to-video conditioning. Avoid downloading multiple large image families before selecting a primary path.

## Priority track 4 — character and motion

Evaluate current maintained options such as Wan Animate and related pose/reference/motion workflows. Record:
- identity/reference input requirements;
- source video or pose requirements;
- supported resolutions and frame limits;
- temporal consistency limitations;
- model/node licenses;
- Windows and Blackwell test evidence.

Do not promise perfect identity preservation. Include human review and reference-frame comparison.

## Priority track 5 — video editing and finishing

Evaluate separately:
- FFmpeg / FFprobe: required base utilities.
- RIFE or another maintained interpolation method.
- SeedVR2 or another maintained video restoration/upscale method.
- SAM-family segmentation or VACE-style video editing where an actively maintained ComfyUI path exists.
- audio cleanup, voice, sound design, and muxing tools.

A tool is only selected after source, license, dependencies, hardware support, and a real sample test are recorded.

## Model acquisition safety

- Prefer official Hugging Face or official vendor download sources.
- Never use untrusted repackaged weights.
- Do not commit weights to Git.
- Check gated status and terms before downloading.
- Ask the user before accepting a gated license or using credentials.
- Estimate total size before each batch.
- Use resumable downloads and hash verification.
- Keep original files immutable; use separate derived/quantized copies.
- Maintain a model inventory with last-used date and disk usage.
