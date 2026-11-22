# V3 installer engine

## Scope of this release

V3 introduces a first executable deployment stage:
- read-only preflight;
- safe SSD workspace initialization;
- official ComfyUI NVIDIA Portable core download and extraction;
- shared external model-path configuration;
- project-local Hugging Face, Torch, pip, and temp cache routing;
- localhost-only launch command;
- runtime manifest and API/CUDA diagnostic.

This is **not yet** a fully unattended all-model installer. Model weights and third-party custom nodes remain staged because their dependency graphs, licenses, access requirements, and Blackwell compatibility must be verified per workflow.

## Execution sequence

1. Clone repository.
2. Run `PREFLIGHT.bat`.
3. Inspect the report under `%LOCALAPPDATA%\AI-Video-Studio\preflight\`.
4. Identify the Samsung physical disk and mounted volume.
5. Run workspace initializer with `-WhatIf`, inspect, then run it normally.
6. Run `INSTALL-CORE.bat` and enter the confirmed workspace root.
7. Start `<workspace>\scripts\launch-comfyui.bat`.
8. Run `bootstrap\Test-ComfyUI.ps1` with the correct embedded Python path.
9. Only then install and test model workflow packs.

## Core installer behavior

- Downloads the official NVIDIA Portable release URL.
- Requires an installed 7-Zip CLI; it does not silently install system packages.
- Tests archive integrity before extraction.
- Extracts into a staging folder and verifies expected ComfyUI/main.py and embedded Python layout.
- Refuses to overwrite an existing runtime.
- Configures extra_model_paths.yaml to the external shared model library.
- Writes a local runtime manifest.
- Does not install drivers, change global CUDA/Python, download model weights, or expose the API beyond localhost.

## Important limitations

- The official latest release URL is a moving target. Record the archive SHA-256 and resolved GitHub release tag/asset metadata in the deployment manifest before treating it as reproducible. The script currently records source URL and runtime probe; future hardening should resolve and pin release asset metadata.
- PowerShell scripts must be executed on the target Windows workstation. Static repository inspection is not runtime validation.
- Desktop-managed ComfyUI is not controlled by this Portable launcher. This release intentionally selects one standalone Portable runtime for agent/script control.
- 7-Zip must be installed separately from its official source.
