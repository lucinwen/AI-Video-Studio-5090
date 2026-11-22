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

**已经坐在 5090 电脑前？先读 [本地 Codex 完整交接书](docs/LOCAL_CODEX_HANDOFF.zh-CN.md)。** 它说明盘符怎么确认、Codex 打开什么目录、仓库和模型分别放在哪里，以及可直接复制的执行任务。

1. Use Codex locally on the actual workstation and identify the Samsung SSD volume.
2. Open the whole `<confirmed-volume>:\AI-Video-Studio` workspace in Codex. Keep this repository at `00_CONTROL\repository\AI-Video-Studio-5090` inside that workspace.
3. Send the execution prompt in [docs/LOCAL_CODEX_HANDOFF.zh-CN.md](docs/LOCAL_CODEX_HANDOFF.zh-CN.md) and explicitly read the repository's nested `AGENTS.md`.
4. Parse and review the bootstrap scripts before executing any `.bat` or installer. Repair actual blockers, then proceed with hardware inventory and staged deployment.
5. Review [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) and the generated local deployment report. The current scripts have not passed target-machine acceptance.

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

**Important:** These scripts are starter bootstrap tools, not a finished unattended installer. Follow the [local Codex handoff](docs/LOCAL_CODEX_HANDOFF.zh-CN.md): inspect and parse scripts first, repair errors, then run preflight. The handoff records concrete issues found at commit `059923f`. Do not run workspace initialization until the Samsung volume is positively identified. Runtime/model installation must be tested on the target PC.

See [docs/BOOTSTRAP_SCRIPTS.md](docs/BOOTSTRAP_SCRIPTS.md), [docs/BLACKWELL_PROFILE.md](docs/BLACKWELL_PROFILE.md), [docs/ROADMAP.md](docs/ROADMAP.md), and [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).

- [docs/ROADMAP.md](docs/ROADMAP.md) — implementation phases and release gates.
- [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) — what is committed versus not yet implemented or tested.


- [bootstrap/Test-ComfyUI.ps1](bootstrap/Test-ComfyUI.ps1) — checks the local ComfyUI API and optionally probes CUDA using the selected isolated Python interpreter.
- [docs/BLACKWELL_PROFILE.md](docs/BLACKWELL_PROFILE.md) — RTX 5090-specific test plan, including LTX Blackwell NVFP4 evaluation.

## V3 executable core bootstrap

The V3 entry point is [INSTALL-V3.bat](INSTALL-V3.bat). It:
1. runs read-only preflight;
2. identifies mounted Samsung 8 TB physical disk candidates by disk metadata and partition mapping;
3. asks for explicit confirmation before creating the workspace;
4. previews directory creation with PowerShell `-WhatIf`;
5. asks before installing 7-Zip via winget if missing;
6. resolves the current official ComfyUI NVIDIA Portable release asset, downloads and tests the archive, extracts to a staging directory, and installs without overwriting an existing runtime;
7. configures shared model paths and a local-only launch script.

This V3 milestone installs the **ComfyUI core only**. It does not bulk-download video models, install unreviewed custom nodes, or claim video generation is ready. Continue with [docs/V3_INSTALLER.md](docs/V3_INSTALLER.md), [docs/BLACKWELL_PROFILE.md](docs/BLACKWELL_PROFILE.md), and [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).

- [bootstrap/Install-Core.ps1](bootstrap/Install-Core.ps1) — resolves and installs the official ComfyUI NVIDIA Portable release.
- [bootstrap/Invoke-V3.ps1](bootstrap/Invoke-V3.ps1) / [INSTALL-V3.bat](INSTALL-V3.bat) — interactive V3 core bootstrap.
- [bootstrap/Download-ModelPack.ps1](bootstrap/Download-ModelPack.ps1) — resumable, manifest-driven HTTPS model artifact downloader with license, path, size, and hash gates.
- [config/model-pack.example.json](config/model-pack.example.json) — model pack manifest schema.


## Optional image-generation front end for video

The repository now includes a registry-driven Python pipeline layer in `studio/`:
- Prompt → image candidates → interactive keyframe selection → image-to-video.
- Existing image + motion prompt → image-to-video.
- ComfyUI is still the single inference engine; image and video graphs remain separate and replaceable.
- Outputs and run metadata are stored under the workstation's 05_PROJECTS tree, outside Git.

Read [docs/IMAGE_VIDEO_PIPELINES.zh-CN.md](docs/IMAGE_VIDEO_PIPELINES.zh-CN.md). Initialize a local registry with:

```powershell
python -m studio.cli --root "E:\\AI-Video-Studio" init
```

The example registry is intentionally disabled until the local agent exports real ComfyUI API-format workflows and maps actual node IDs/inputs. This repository does not claim that image models are installed or that the pipelines have already run on the user's RTX 5090.
