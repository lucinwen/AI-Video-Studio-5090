# Implementation roadmap

This roadmap separates what is already in Git from work that still requires implementation and target-machine validation.

## M0 — Repository contract and safe bootstrap
Status: DOCUMENTATION_AND_STARTER_SCRIPTS_COMMITTED
- [x] Agent operating contract and safety gates.
- [x] Read-only Windows preflight script.
- [x] SSD workspace directory initializer with WhatIf and non-overwriting config copy.
- [x] Starter doctor, local ComfyUI API probe, guarded launcher.
- [x] Model/workflow manifest templates.
- [ ] Execute and fix scripts on the actual Windows 11 workstation.

## M1 — Reproducible runtime installer
Status: NOT_IMPLEMENTED
- Detect and select one official ComfyUI runtime.
- Download/verify/extract or install with pinned version.
- Configure shared model paths.
- Record Python/PyTorch/CUDA/runtime versions.
- Install and test ComfyUI Manager where appropriate.
- Create snapshots and rollback.

## M2 — Model resolver and downloader
Status: NOT_IMPLEMENTED
- Resolve workflow-to-model dependency graph.
- Read exact upstream files and license information.
- Estimate total bytes and available disk.
- Support resumable downloads and SHA-256 verification.
- Maintain a staged queue; no mass downloads.
- Handle gated model approval and credentials safely.

## M3 — First validated generation paths
Status: NOT_IMPLEMENTED
- Small image smoke test.
- Wan 2.2 5B TI2V smoke test.
- Wan 2.2 14B optional FP8 path.
- LTX-2.5 Blackwell NVFP4 / low-memory path.
- Capture performance, memory, logs, and quality review.

## M4 — Workflow packs and finishing
Status: NOT_IMPLEMENTED
- Character/reference consistency.
- Motion transfer/animation.
- Video editing and inpainting.
- Audio/video.
- FFmpeg delivery, interpolation, upscale/restoration.

## M5 — Agent orchestration
Status: NOT_IMPLEMENTED
- Project and shot registry.
- ComfyUI API queue/history client.
- Prompt/model/workflow selection.
- Finite retry policy.
- Technical QA and human approval.
- Reproducible run metadata.

## M6 — Studio interface and maintenance
Status: NOT_IMPLEMENTED
- Local dashboard and project browser.
- Model/workflow manager.
- Queue monitor and GPU/memory telemetry.
- Update planner, snapshots, rollback.
- Exportable deployment and benchmark reports.

## Release gate

Do not call this a one-click installer or production-ready workstation until M1–M5 have passed their acceptance tests on the target machine. The current repository is an agent-readable deployment blueprint with initial safe bootstrap scripts.

## V3 core bootstrap milestone

Status: COMMITTED_TO_GIT / NOT_RUN_ON_TARGET
- [x] Interactive entry point and read-only preflight orchestration.
- [x] Samsung physical-disk to mounted-volume candidate mapping.
- [x] Explicit confirmation and WhatIf workspace initialization.
- [x] Official NVIDIA Portable release metadata resolution.
- [x] Download, 7z integrity test, staging extraction, layout check, and no-overwrite policy.
- [x] External shared model paths and cache/output routing in launch script.
- [ ] Run PowerShell scripts on target Windows 11 and fix any runtime issues.
- [ ] Verify ComfyUI API and CUDA on RTX 5090.
- [ ] Implement model dependency resolver and resumable model download queue.
- [ ] Implement workflow packs and real Wan/LTX generation tests.

- [x] Generic resumable model artifact downloader with explicit license/hash/size gates.
- [ ] Automatic workflow-to-model dependency graph resolver.
- [ ] Curated, fully populated Wan/LTX model-pack manifests with exact official file revisions, sizes, licenses, and checksums.
