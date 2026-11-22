# RTX 5090 / Blackwell deployment profile

This profile is a test plan, not a pre-certified performance claim.

## Known target

- RTX 5090, expected 32 GB VRAM.
- 128 GB system RAM.
- Windows 11 x64.
- Samsung 8 TB SSD.

## ComfyUI baseline

Current official ComfyUI documentation recommends Desktop for most Windows users. It also documents an NVIDIA Portable build with Python 3.13 and PyTorch CUDA 13.0. Portable is explicitly described as a standalone option rather than the normal recommendation for regular users. Choose one runtime after inspecting the current Desktop/Portable release, custom-node requirements, and automation needs.

Sources:
- https://github.com/Comfy-Org/ComfyUI
- https://github.com/Comfy-Org/ComfyUI/blob/master/docs/installation.md

## LTX-2.5: prioritize Blackwell-native low-memory variants

Official LTX ComfyUI documentation lists a CUDA GPU with 32 GB+ VRAM and 100 GB+ free disk. This makes the RTX 5090 a boundary configuration, not a guarantee of every BF16 workflow fitting.

The current guide describes:
- standard BF16 files;
- lower-VRAM INT8 ConvRot files;
- NVFP4 distilled transformer option for Blackwell GPUs;
- built-in T2V, I2V, and first/last-frame templates.

Deployment test order:
1. Install the official ComfyUI-LTXVideo integration using its documented method.
2. Load the built-in LTX-2.5 template.
3. Resolve only the files requested by the selected template.
4. Prefer the official Blackwell NVFP4 or lower-memory configuration where the template supports it.
5. Start with conservative resolution, 41 frames, batch size 1.
6. Record actual peak VRAM, RAM, generation duration, output dimensions, audio streams, and decode integrity.
7. If the path fails, capture the full traceback and test the official INT8/other recommended alternative. Do not invent command-line flags or patch model code silently.

Sources:
- https://docs.ltx.io/open-source-model/integration-tools/comfy-ui
- https://github.com/Lightricks/ComfyUI-LTXVideo
- https://github.com/Lightricks/LTX-2

## Wan 2.2: treat variants as distinct dependency graphs

The ComfyUI example guide describes a 5B model for both T2V and I2V, and separate 14B model paths. 14B T2V/I2V workflows can require paired high-noise and low-noise diffusion models plus a text encoder and VAE. The 5B path uses its own VAE and model file.

Deployment order:
1. Use official ComfyUI workflow templates and model folder instructions.
2. Start with the 5B TI2V path to validate end-to-end video generation.
3. Add the 14B FP8 paths only after estimating disk and memory needs.
4. Do not mix Wan 2.1 and Wan 2.2 VAE files.
5. Store workflow-specific required filenames in the workflow manifest.

Sources:
- https://comfyanonymous.github.io/ComfyUI_examples/wan22/
- https://github.com/Comfy-Org/workflow_templates
- https://github.com/Wan-Video/Wan2.2

## Performance recording

For every workflow, capture:
- exact model files, precision/quantization, and SHA-256;
- ComfyUI and node revisions;
- width, height, frame count, FPS, steps, sampler, batch;
- peak VRAM allocated/reserved, system RAM, and elapsed time;
- output file size, FFprobe report, and visual QA notes.

Do not publish a "5090 benchmark" until it has been run on the user's machine with reproducible settings.
