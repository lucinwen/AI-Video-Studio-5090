# Acceptance tests

A workstation component is not complete until its acceptance evidence is stored locally.

## Status definitions

- PLANNED — selected but not acquired.
- DOWNLOADED — files downloaded and integrity checked.
- INSTALLED — runtime/node/model files placed and configured.
- LOADS — model and workflow load without missing dependencies.
- SMOKE_TESTED — a real test inference completed.
- QUALITY_REVIEWED — output inspected against task-specific criteria.
- BLOCKED — known blocker with evidence and next action.
- FAILED — attempted and failed; log and diagnosis required.

Do not collapse these states into a single "done" checkbox.

## A. Hardware and storage

- [ ] Windows 11 x64 detected.
- [ ] RTX 5090 identified and 32 GB VRAM reported.
- [ ] NVIDIA driver version captured.
- [ ] 128 GB RAM detected.
- [ ] Samsung 8 TB SSD identified by device metadata.
- [ ] Correct mounted volume and free space recorded.
- [ ] No formatting/partition changes performed.
- [ ] Root directory created without overwriting existing files.
- [ ] At least 10–15% free space policy configured.

## B. Runtime

- [ ] Selected ComfyUI distribution and rationale documented.
- [ ] Python/runtime version captured.
- [ ] PyTorch version and CUDA build captured.
- [ ] `torch.cuda.is_available()` true.
- [ ] GPU name from PyTorch matches RTX 5090.
- [ ] ComfyUI starts successfully.
- [ ] ComfyUI UI reachable on localhost.
- [ ] ComfyUI API responds on localhost.
- [ ] Shared model path resolves.
- [ ] Baseline backup and rollback tested.

## C. Model workflow tests

For each selected model track:
- [ ] Exact model revision and license recorded.
- [ ] All required files and hashes verified.
- [ ] Nodes pinned and installed.
- [ ] Workflow loads without missing nodes/models.
- [ ] Real inference completes.
- [ ] Output file exists and decodes.
- [ ] Peak VRAM and RAM recorded.
- [ ] Settings and runtime recorded.
- [ ] Failure modes documented.

Minimum required real outputs:
- [ ] One small image/keyframe output.
- [ ] One Wan 2.2 video output.
- [ ] One LTX-2.5 output, or a documented BLOCKED result with exact reason and fallback.
- [ ] One character/motion test, if the chosen model track supports it.
- [ ] One finishing test (upscale or interpolation).
- [ ] One audio-video output if the selected model claims audio generation.

## D. Technical output validation

Use FFprobe/FFmpeg:
- [ ] container and codec identified;
- [ ] width and height correct;
- [ ] frame rate and frame count/duration plausible;
- [ ] video stream decodes;
- [ ] audio stream exists when expected;
- [ ] audio duration and sync reviewed;
- [ ] no zero-byte or truncated file;
- [ ] generated output stored outside the Git repository.

Example validation command (agent adapts executable path):
```powershell
ffprobe -v error -show_entries format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels -of json "path\to\output.mp4"
```

## E. Restart and recovery

- [ ] ComfyUI stops cleanly.
- [ ] ComfyUI restarts from the launch script.
- [ ] Windows restart/relogin recovery documented.
- [ ] Interrupted model download can resume.
- [ ] Failed node can be rolled back.
- [ ] Existing outputs are never overwritten by rerun.
- [ ] Backup restore procedure tested.

## F. Agent and project orchestration

- [ ] Agent can create a project and shot folder.
- [ ] Agent can select a workflow by registry ID.
- [ ] Agent can submit an API-format workflow to ComfyUI.
- [ ] Agent can poll queue/history and locate outputs.
- [ ] Agent records prompt, seed, input hashes, model/workflow versions.
- [ ] Technical QA runs automatically.
- [ ] Retry budget is finite.
- [ ] Approved output requires human approval before final delivery.

## Final report

Summarize:
1. Verified and quality-reviewed capabilities.
2. Installed but not smoke-tested items.
3. Experimental items.
4. Blocked/failed items and exact cause.
5. Disk usage and free capacity.
6. GPU peak memory for each workflow.
7. Start, stop, update, and rollback commands.
8. Outstanding approvals or credentials needed.


## G. Image generation and image-to-video pipelines

- [ ] Local pipeline registry initialized without overwriting an existing registry.
- [ ] Text-to-image API graph exported from the local ComfyUI instance.
- [ ] Image-to-video API graph exported from the local ComfyUI instance.
- [ ] Every enabled workflow has real model IDs, API node IDs, input names and model files.
- [ ] Registry validation passes; no placeholder node IDs remain.
- [ ] Prompt-to-image-to-video produces at least one image candidate, allows keyframe selection, submits the selected image to I2V and saves a playable video.
- [ ] Image-plus-prompt-to-video uploads an existing image and saves a playable video.
- [ ] Run metadata records prompt, negative prompt, motion prompt, seed, workflow/model IDs, ComfyUI prompt IDs, elapsed time, output paths and hashes.
- [ ] Video outputs pass FFprobe and full decode checks.
- [ ] Candidate images and videos remain outside the Git repository.
- [ ] Human visual review is recorded separately from technical smoke testing.
