# Creator Studio: reuse decisions

| Source | Verified code/behavior | Decision |
| --- | --- | --- |
| [ComfyUI](https://github.com/Comfy-Org/ComfyUI/blob/master/server.py), [routes](https://docs.comfy.org/development/comfyui-server/comms_routes), [App Mode](https://github.com/Comfy-Org/docs/blob/main/interface/app-mode.mdx) | Engine exposes prompt queue, history and output routes. App Mode projects a workflow into creator-facing inputs and outputs. | Run unmodified ComfyUI as the separately installed localhost service; do not vendor GPL engine source here. `comfy-client.mjs` implements health, queue and history against it. Validate an [official Wan workflow](https://docs.comfy.org/tutorials/video/wan/wan2_2) on Windows before pinning an API graph. |
| [LTX Desktop](https://github.com/Lightricks/LTX-Desktop/blob/main/docs/DEVELOPMENT.md), [Apache-2.0](https://github.com/Lightricks/LTX-Desktop/blob/main/LICENSE.txt) | `frontend/`, `backend/`, `electron/`; shared queue and asset library; renderer calls local HTTP and Electron bridge. | Preferred reference for the queue and asset review experience. Port only self-contained modules after pinning source revision and preserving notices; no code copied yet. Do not assume app, weights, assets and provider terms share a license. |
| [AI Video Production Editor](https://github.com/LudwigKienle/ai-video-production-editor/blob/main/docs/agent-connect.md) | `src/services/projectAgentTools.ts`: project, reference and shot operations. `src/utils/directorAgent.ts`: scene splitting and coverage. Editor core is GPL-3.0-or-later. | Reference for project/scene/shot workflow; no code copied and no license change to this repository. |
| [OpenCut](https://github.com/opencutvideo/Opencut) | Browser video editor with timeline; MIT. | Consider reuse when multi-track editing is actually needed; no dependency yet. |
| [Dreamina](https://dreamina.capcut.com/ai-video/change-one-part-ai-video-workflow) | Official segment-edit example shows desired timing and a generated result that missed it. | Reference only; retain original and review candidates in context. No proprietary code, assets or private APIs. |

## Integration order

1. Run an official workflow in existing local ComfyUI. Export the API-format graph and pin the validated graph/model/node versions; do not expose a raw workflow upload or arbitrary routing to the browser.
2. Bind a local same-origin Studio service, expose only the project/shot operation and approved parameters, then add constrained asset upload, job state and video retrieval. Persist output versions by shot; approvals are explicit.
3. Connect the browser and verify reference import through MP4 export on the RTX 5090. Neither this research nor the mock API check establishes that a Windows/GPU workflow runs.

Scope of this commit: source and license decisions plus a standalone adapter. No Studio browser integration, third-party source vendor, weights, or real GPU test.
