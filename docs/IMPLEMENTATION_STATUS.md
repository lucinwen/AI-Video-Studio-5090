# Implementation status

Last repository update: 2026-11-22.

## Committed to Git

- Deployment handbook and local-agent instructions.
- Windows PowerShell read-only preflight script.
- Non-destructive workspace directory initializer.
- Starter diagnostics and ComfyUI API/CUDA probe.
- Guarded ComfyUI launcher for verified Portable/source layouts.
- Example workstation, model, and workflow manifests.
- RTX 5090 / Blackwell model test guidance.
- Acceptance, security, and roadmap documents.

## Not yet implemented

- Fully unattended ComfyUI installation/update/rollback.
- Complete workflow dependency resolver.
- Production model downloader with resume, checksums, gated-access handling, and quota planner.
- Downloadable, fully pinned workflow packs for all target families.
- End-to-end Agent director/orchestrator and Studio UI.
- Automated visual quality evaluation.

## Validation boundary

The GitHub files were written and read back through the connected GitHub integration. PowerShell scripts have been statically reviewed but have **not** been executed on the user's Windows 11 / RTX 5090 machine in this session. No model weights have been downloaded, no local driver or runtime has been changed, and no video generation has been run.

The next required action is to follow `docs/LOCAL_CODEX_HANDOFF.zh-CN.md`: parse and review bootstrap scripts, repair actual blockers, then run preflight and initialize the workspace only after confirming the Samsung SSD volume.

## V3 core installer milestone (committed; target-machine untested)

Additional committed files:
- `INSTALL-V3.bat` and `bootstrap/Invoke-V3.ps1` orchestrate the interactive core setup.
- `bootstrap/Install-Core.ps1` resolves the latest official NVIDIA Portable release asset, downloads it, checks the archive with 7-Zip, extracts to staging, validates the runtime layout, configures external model paths, writes a launcher and local runtime manifest.
- `bootstrap/Test-ComfyUI.ps1` probes the local API and optional PyTorch CUDA environment.
- `docs/V3_INSTALLER.md` documents scope and limitations.

The V3 installer is a real first-stage core installer, not yet the promised complete one-click model/workflow installer. It still requires 7-Zip (winget installation is offered only after explicit confirmation). It does not download Wan/LTX weights or install third-party custom nodes.

## V3 model download utility (committed; not target-tested)

- Added a manifest-driven downloader with HTTPS-only URLs, destination path traversal checks, free-space estimates, explicit license review and download confirmation, curl resume/retry, expected-size and optional SHA-256 checks, and no-overwrite behavior.
- Added a JSON model-pack example and usage documentation.
- This utility does not yet infer exact model files from ComfyUI workflow JSON; the local agent must prepare a reviewed pack manifest.

The core installer resolves the latest release through the GitHub Releases API, records the exact release tag, asset URL, archive SHA-256, and size. Downloads use a resumable `.partial` file, test archive integrity before promotion, and retain incomplete files for diagnosis/resume.


## Local handoff review — 2026-11-22

The remote contents at commit `059923f9dd54d97979b7aff2b335b1cc9df01ba0` were inspected again. `bootstrap/Download-ModelPack.ps1` contains a truncated regular-expression string and duplicated script content. Markdown fence quoting in `Invoke-Preflight.ps1` and `$LASTEXITCODE` handling after PowerShell script calls in `Invoke-V3.ps1` also require correction and target-runtime tests. These are code-review findings, not a claim that a PowerShell parser or GPU test was run in this chat.

This handoff update adds instructions and corrects the first-run guidance; it does not repair or validate the installer scripts themselves. Do not execute old entry points blindly. The local agent must repair the current code, verify it with the actual Windows interpreter, and record installation and inference evidence. See the new Chinese handoff for exact workspace paths, persistent state, acceptance checks, and user launch instructions.
