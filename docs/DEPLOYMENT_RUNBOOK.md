# Windows 11 deployment runbook

This runbook is executed by the local agent. It is not a blind shell script. The agent must inspect current official documentation and produce a preflight report before making changes.

## Phase 0 — read-only preflight

Collect and save:
- Windows edition/build/architecture.
- GPU model, VRAM, driver version, `nvidia-smi` output.
- PyTorch CUDA visibility if a suitable environment already exists.
- CPU model/core count and 128 GB RAM confirmation.
- Physical disks and partitions using read-only PowerShell/CIM commands.
- Samsung SSD model, size, volume, filesystem, drive letter, total/free space.
- Existing Git, Python, 7-Zip, FFmpeg, CUDA Toolkit, WSL2, ComfyUI and AI runtimes.
- Existing user data at the proposed root.

Do not format, initialize, repartition, change drive letters, or delete anything.

## Phase 1 — storage bootstrap

1. Identify the 8 TB Samsung SSD by model/size/serial metadata.
2. Confirm the mounted volume and filesystem.
3. Create `<volume>:\AI-Video-Studio\` and the documented folder tree.
4. If the folder already exists, inventory it and preserve everything.
5. Configure project-local caches and temp paths on the SSD where practical.
6. Ensure free space remains at least 10–15%.

## Phase 2 — prerequisites

Verify current official installation guidance for:
- NVIDIA driver suitable for RTX 5090 / Blackwell.
- Git for Windows.
- 7-Zip or another trusted archive extractor.
- Python/runtime required by the chosen ComfyUI distribution.
- FFmpeg/FFprobe.
- Optional uv, Visual C++ runtime, or other prerequisites required by selected nodes.

Do not automatically replace a working NVIDIA driver. If an update is required, explain why, show the version/source, and request approval before installation/reboot.

Do not install a global CUDA Toolkit merely because PyTorch uses CUDA. First determine whether the chosen runtime ships the required CUDA user-space libraries. Install compiler/toolkit components only when a specific node/build needs them.

## Phase 3 — ComfyUI baseline

Compare current official Windows options and choose one:
- Desktop app (recommended by official docs for ordinary Windows onboarding);
- NVIDIA Portable (isolated/self-contained);
- source checkout with a dedicated Python environment.

For this agent-managed workstation, record why the chosen option is best for automation, model path sharing, node pinning, updates, and recovery.

Then:
1. Install/clone from the official ComfyUI source only.
2. Create a baseline snapshot/manifest.
3. Configure shared model paths under `02_MODELS`.
4. Bind the service to localhost.
5. Start ComfyUI and verify the UI plus local API.
6. Save logs and exact versions.
7. Run a small official example workflow before adding third-party nodes.

## Phase 4 — custom node governance

For each required node:
1. Confirm official/upstream repository and license.
2. Inspect README, install scripts, requirements, recent commits, open issues, and Windows support.
3. Determine Python/PyTorch/CUDA/Triton requirements.
4. Check for custom compiled extensions and Blackwell support.
5. Pin a release or commit SHA.
6. Install only in the selected isolated runtime.
7. Restart and run a minimal workflow.
8. Record status and rollback instructions.

Do not use "install all missing nodes" blindly. A workflow JSON can reference untrusted code. Install only nodes required by a reviewed workflow.

## Phase 5 — model acquisition

For each model, prepare a download manifest with:
- name and intended task;
- official model card/repository;
- exact revision;
- license and commercial-use terms;
- gated/ungated status;
- exact filenames and approximate total size;
- SHA-256 if publisher provides it (otherwise compute after download);
- target directory;
- required custom nodes;
- VRAM/RAM estimates and supported quantization/offload;
- Windows/Blackwell status;
- workflow and smoke test.

Download in this order:
1. One image/keyframe model or small image test path.
2. Wan 2.2 minimum viable video path.
3. LTX-2.5 minimum viable audio-video path.
4. Character/motion workflow.
5. Finishing models (upscale/interpolation/segmentation).
6. Optional research models only when needed.

Do not download multiple large model families in parallel. Use resumable downloads, verify hashes, and retain incomplete downloads in a staging folder. Do not accept gated terms or authenticate without user approval.

## Phase 6 — first video workflow

For each primary model:
1. Load an official or upstream-maintained ComfyUI workflow.
2. Confirm all nodes and models resolve.
3. Start with conservative resolution/frame count/batch size.
4. Run a real generation.
5. Record peak VRAM, RAM, duration, settings, and log.
6. Validate video with FFprobe and decode a sample.
7. Review visual quality; technical validity is not visual quality.
8. Save the exact workflow JSON and test evidence.
9. Mark status only as far as the evidence supports.

## Phase 7 — finishing

Install and test:
- FFmpeg and FFprobe.
- Audio/video mux and remux.
- Basic cut/concat and format normalization.
- One frame interpolation route.
- One video upscale/restoration route.
- Optional segmentation or video editing route.

Keep finishing models isolated if they require incompatible packages. Use temporary files under cache and final outputs under the project output folder.

## Phase 8 — agent orchestration

Only after ComfyUI API is stable:
- create a local project manifest;
- define shot/asset IDs;
- call ComfyUI API with saved API-format workflows;
- track prompt, model revision, workflow revision, seed, input references, queue ID, output paths, and test status;
- poll queue and execution history;
- enforce retry limits;
- run FFprobe-based technical QA;
- provide visual QA summaries for human review;
- never replace an approved output automatically.

## Phase 9 — restart, backup, and recovery

Test:
- stop and restart ComfyUI;
- restart Windows and relaunch;
- restore ComfyUI config from backup;
- roll back one custom node;
- resume an interrupted model download;
- recover a failed generation without overwriting previous outputs.

Back up configuration, manifests, workflow JSON, node commit locks, and project metadata. Model weights and large media should be separately backed up according to the user's storage policy; do not assume one SSD is a backup.

## Phase 10 — handover

Write:
- `00_CONTROL/reports/preflight-report.md`
- `00_CONTROL/reports/deployment-report.md`
- `00_CONTROL/deployment-manifest.json`
- `00_CONTROL/software-inventory.json`
- `00_CONTROL/model-registry.yaml`
- `00_CONTROL/workflow-registry.yaml`
- `00_CONTROL/recovery/ROLLBACK.md`

Final report must list verified, experimental, blocked, and not-installed items separately, plus exact launch/update/rollback commands.

## V3 scripted entry points

- `INSTALL-V3.bat`: interactive first-run orchestration.
- `bootstrap/Install-Core.ps1`: official ComfyUI NVIDIA Portable installation.
- `bootstrap/Download-ModelPack.ps1`: public ungated artifact download from a reviewed JSON manifest.

The model downloader is not a dependency resolver. The agent must construct a model pack from the exact official workflow requirements, inspect every URL and license, estimate disk usage, and then invoke the downloader. Gated models remain manual.
