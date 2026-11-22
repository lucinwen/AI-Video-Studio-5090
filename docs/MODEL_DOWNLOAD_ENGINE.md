# Model artifact downloader

`bootstrap/Download-ModelPack.ps1` is a generic, manifest-driven downloader for explicitly reviewed public HTTPS artifacts.

## Required manifest fields

See `config/model-pack.example.json`.

- `id`, `name`, `source`
- `license_id`, `license_url`
- `license_reviewed: true` only after a human reviewed the license and use restrictions
- `gated: false`
- `files[]` with HTTPS `url`, safe `relative_path`, required positive `expected_bytes`, and optional `sha256`

The example manifest is intentionally non-runnable until completed and license-reviewed.

## Run

```powershell
.\bootstrap\Download-ModelPack.ps1 -RootPath "E:\AI-Video-Studio" -ManifestPath ".\my-model-pack.json"
```

The script:
- restricts destinations to the workspace model root;
- rejects absolute paths and parent traversal;
- estimates declared download size and checks free space;
- asks for explicit DOWNLOAD confirmation;
- uses curl resume support and retries;
- checks expected size and SHA-256 when supplied;
- refuses to overwrite existing model files;
- records local hashes and download metadata.

If no publisher SHA-256 is provided, the computed hash only identifies the downloaded bytes; it does not independently prove upstream authenticity. Record that distinction.

Gated repositories are deliberately blocked. Obtain access and review terms manually; do not store tokens in manifests or Git. This downloader does not resolve workflow dependencies automatically yet. The next stage is to build a workflow-to-artifact dependency resolver that generates reviewed pack manifests from official ComfyUI workflow metadata.


Every artifact must declare a positive `expected_bytes` value. The downloader refuses to start if sizes are missing because it must estimate the full pack size before consuming the SSD. SHA-256 remains optional only when the publisher does not provide a checksum; in that case the locally computed digest is recorded as an identity value, not an authenticity proof.
