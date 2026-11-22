# Architecture decision records

## ADR-001 — One production ComfyUI runtime

Status: Accepted.

Do not mix Desktop, Portable, and source installations. Compare current official docs and choose one production runtime. A separate experimental runtime is permitted only when isolated and documented.

Current upstream guidance recommends Desktop for most Windows users and describes Portable as a standalone option. The local agent must verify current guidance on deployment day:
- https://github.com/Comfy-Org/ComfyUI
- https://github.com/Comfy-Org/ComfyUI/blob/master/docs/installation.md

## ADR-002 — Shared model store

Status: Accepted.

Keep model weights in one SSD-rooted model library and reference it from ComfyUI using the supported extra model paths configuration where compatible. Do not duplicate model weights across UI/runtime installations.

## ADR-003 — Model-first, workflow-first acquisition

Status: Accepted.

Download only the files required by a selected workflow. Do not bulk-download all variants or entire model families. The workflow manifest is the source of truth for required model components.

## ADR-004 — Blackwell-specific LTX validation

Status: Accepted.

LTX documentation currently lists 32 GB+ VRAM and 100 GB+ free disk for the ComfyUI path. RTX 5090 sits at the stated VRAM boundary. Test official low-memory variants, including Blackwell NVFP4 where supported, at conservative settings. Record actual peak VRAM and results:
- https://docs.ltx.io/open-source-model/integration-tools/comfy-ui
- https://github.com/Lightricks/ComfyUI-LTXVideo

## ADR-005 — Wan workflow dependency manifests

Status: Accepted.

Wan 2.2 workflows can require multiple diffusion models plus text encoder and VAE files. Do not model the family as one checkpoint. Resolve exact files from the chosen official ComfyUI workflow:
- https://comfyanonymous.github.io/ComfyUI_examples/wan22/
- https://github.com/Comfy-Org/workflow_templates

## ADR-006 — Agent orchestration after inference validation

Status: Accepted.

Do not build a complex frontend or multi-agent director until the ComfyUI API can complete reproducible image and video jobs. Deliver a CLI/API and workflow registry first.

## ADR-006 — Portable as V3 scripted production runtime

Status: Accepted for the V3 first-run installer, subject to target validation.

ComfyUI officially recommends Desktop for most ordinary Windows users and describes Portable as a standalone build. V3 selects NVIDIA Portable specifically for the dedicated, agent-managed workstation because its embedded Python/runtime layout is explicit and can be placed under the workspace root with a controlled launcher. This is a trade-off, not a claim that Portable is universally superior. If a required custom node cannot run in the pinned Portable environment, evaluate a separate source + venv experimental runtime; do not mix environments or silently mutate the production runtime.

Official guidance:
- https://github.com/Comfy-Org/ComfyUI/blob/master/docs/installation.md
- https://github.com/Comfy-Org/ComfyUI
