# AI Video Studio 5090

**A reproducible, agent-operated local AI video workstation for Windows 11 + RTX 5090.**

本仓库的首要交付不是某一个视频模型，而是一套让本地 Codex / AI Agent 能够检查、部署、验证、维护整台 AI 视频工作站的工程说明书与执行规范。

## Target workstation

| Component | Target |
|---|---|
| OS | Windows 11 x64 |
| GPU | NVIDIA GeForce RTX 5090, 32 GB VRAM |
| System memory | 128 GB RAM |
| Storage | Samsung 8 TB SSD dedicated primarily to AI video |
| Primary UI / execution engine | ComfyUI |
| Primary use | Local video generation, image-to-video, character/motion workflows, audio-video, video finishing, agent orchestration |

The installer must **discover** the Samsung SSD drive letter and volume details. Never assume it is D:, never format or repartition it, and never delete existing data.

## Start here

1. Clone this repository on the workstation.
2. Open the repository folder in the local coding agent (Codex recommended).
3. Send the complete prompt in [START_HERE.md](START_HERE.md).
4. Let the agent execute the staged plan, asking for approval only at documented safety gates.
5. Review [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) and the generated local deployment report.

## What the local agent must build

- Hardware and storage discovery, preflight report, and safe path planning.
- Isolated ComfyUI runtime and a shared model directory on the Samsung SSD.
- Model registry with source, exact revision, file list, license, size, SHA-256, and hardware profile.
- Importable, versioned workflows for text-to-video, image-to-video, first/last frame, character reference, motion, video editing, audio, upscaling, interpolation, and delivery.
- FFmpeg-based finishing pipeline.
- Local project/asset/output organization.
- ComfyUI API integration and agent orchestration.
- Smoke tests, benchmark samples, logs, recovery instructions, and a machine-readable deployment manifest.

## Important truth-in-advertising rule

A model or workflow is **not** "supported" merely because its name appears in this README. It becomes supported only after the exact model revision, node revisions, environment, workflow, and test result are recorded on the target machine. Separate:
- planned
- downloaded
- installed
- loads successfully
- smoke-tested
- quality-reviewed

No fabricated benchmark, generation time, output quality, or compatibility claims.

## Recommended initial model tracks

The agent must re-check official documentation and model repositories on deployment day, then pin exact revisions in the generated lock/manifest:
- **Wan 2.2**: high-quality video generation and image-to-video / motion-related workflows.
- **LTX-2.5**: audio-video generation and fast iteration; its official ComfyUI integration documents a 32 GB+ VRAM prerequisite, so the RTX 5090 must be tested with the recommended low-memory/offload configuration before declaring success.
- **HunyuanVideo / other open models**: optional experimental track, only after Windows + Blackwell compatibility is demonstrated.
- **Finishing**: FFmpeg, RIFE/frame interpolation, video upscaling/restoration, segmentation/editing tools as separately validated modules.

Model access, licenses, gated downloads, and commercial-use terms must be checked individually. Never download gated weights or accept a license on the user's behalf without explicit approval.

## Safety and data policy

- Do not format, repartition, initialize, or clean the Samsung SSD.
- Do not modify global Python/CUDA installations when an isolated environment can be used.
- Do not uninstall existing drivers or overwrite a working environment without explicit approval.
- Do not download all models at once. Estimate disk usage first and use a staged download queue.
- Do not run arbitrary install scripts from third-party repositories without reviewing their source.
- Do not expose ComfyUI or Studio APIs to the public internet. Bind to localhost by default.
- Never commit model weights, generated videos, personal assets, API keys, cookies, or local machine reports containing sensitive paths to Git.
- Keep third-party licenses and attribution intact.

## Documentation

- [START_HERE.md](START_HERE.md) — copy/paste execution prompt for the local agent.
- [AGENTS.md](AGENTS.md) — persistent rules for Codex and other agents.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — target architecture and storage layout.
- [docs/DEPLOYMENT_RUNBOOK.md](docs/DEPLOYMENT_RUNBOOK.md) — staged install procedure and recovery.
- [docs/MODEL_REGISTRY.md](docs/MODEL_REGISTRY.md) — model selection and registry requirements.
- [docs/WORKFLOWS.md](docs/WORKFLOWS.md) — required workflow families.
- [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) — acceptance tests and evidence requirements.
- [docs/SECURITY_AND_LICENSES.md](docs/SECURITY_AND_LICENSES.md) — safety, licensing, and privacy controls.

## Current status

This repository contains the deployment handbook and engineering contract. It does **not** claim that the workstation has already been installed or that any model has been tested on the user's machine. The local agent performs that work and writes machine-specific results to the local deployment directory (not to Git by default).

## Executable bootstrap layer

The repository now includes conservative first-run scripts:
- [PREFLIGHT.bat](PREFLIGHT.bat) — one-click, read-only Windows hardware/software inventory.
- [bootstrap/Invoke-Preflight.ps1](bootstrap/Invoke-Preflight.ps1) — writes local JSON/Markdown reports under LocalAppData.
- [bootstrap/Initialize-Workspace.ps1](bootstrap/Initialize-Workspace.ps1) — creates the SSD directory tree only after the agent confirms the actual drive letter; supports `-WhatIf`.
- [bootstrap/Invoke-Doctor.ps1](bootstrap/Invoke-Doctor.ps1) — starter diagnostics.
- [bootstrap/Start-Studio.ps1](bootstrap/Start-Studio.ps1) — guarded launcher for verified Portable/source layouts; it refuses global Python fallback.
- [config/workstation.example.yaml](config/workstation.example.yaml), model and workflow registry templates.

**Important:** These scripts are starter bootstrap tools, not a finished unattended installer. The first local action should be `PREFLIGHT.bat`. Do not run workspace initialization until the Samsung volume is positively identified. Runtime/model installation is intentionally staged and must be implemented/tested on the target PC.

See [docs/BOOTSTRAP_SCRIPTS.md](docs/BOOTSTRAP_SCRIPTS.md) and [docs/BLACKWELL_PROFILE.md](docs/BLACKWELL_PROFILE.md).

- [bootstrap/Test-ComfyUI.ps1](bootstrap/Test-ComfyUI.ps1) — checks the local ComfyUI API and optionally probes CUDA using the selected isolated Python interpreter.
- [docs/BLACKWELL_PROFILE.md](docs/BLACKWELL_PROFILE.md) — RTX 5090-specific test plan, including LTX Blackwell NVFP4 evaluation.
