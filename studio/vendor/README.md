# Upstream workflow

`wan2.2-5b-ti2v.comfy.json` is a byte-for-byte copy of the [Comfy Org official template](https://github.com/Comfy-Org/workflow_templates/blob/f77d47c355f9a6a0bec0e129b78b194a92d8d65b/templates/video_wan2_2_5B_ti2v.json), release v0.11.114, Git blob `634303feba82471ef3df3356178de4c037ae213e`. The corresponding MIT notice is in `LICENSE.Comfy-Org-workflow_templates`. This license applies to the template, not to any separately downloaded models, service, or test media.

The JSON is a ComfyUI visual graph, not a POST /prompt payload. Load it in the operator's local ComfyUI, then export API format from the installed frontend. Do not hand-translate SaveVideo options across ComfyUI versions.

- **Text:** export with LoadImage node 56 bypassed (default). Node 55 must not have a start_image input.
- **Image:** enable node 56 and keep its IMAGE output linked to node 55's start_image. Give node 56 a locally available placeholder image for a manual smoke test; Studio replaces that value when the user uploads a reference image.
- **Both:** output video on node 58. Set its output format to MP4 in ComfyUI and run one short smoke test per enabled mode. Keep node IDs unchanged.
- Run `node studio/configure-workflows.mjs --text path/to/text_api.json --image path/to/image_api.json` from the repo root. Both paths are local and either switch can be omitted. Do not commit `workflows.local.json` or API exports with personal prompts, file names or identifiers.

Model locations and version-sensitive defaults: [official Wan 2.2 guide](https://docs.comfy.org/tutorials/video/wan/wan2_2).
