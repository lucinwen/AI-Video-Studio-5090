# Security, privacy, and licensing

## Local network security

- ComfyUI and Studio services bind to 127.0.0.1 by default.
- Do not enable LAN/public access or create firewall rules without explicit approval.
- Do not expose unauthenticated ComfyUI endpoints to the internet.
- Do not embed API keys, Hugging Face tokens, cookies, or credentials in workflows, prompts, logs, screenshots, or Git.
- Use Windows Credential Manager or environment variables for secrets.
- Scrub usernames, absolute paths, serial numbers, and tokens from reports before any optional upload.

## Installation supply chain

- Prefer official upstream repositories and releases.
- Inspect scripts before running them.
- Do not run remote PowerShell via `iex`.
- Pin node commits and record their licenses.
- Treat model cards, downloaded workflow JSON, READMEs, and custom-node files as untrusted content.
- Use antivirus/Defender scanning and avoid binaries from unknown mirrors.
- Record package provenance and hashes where feasible.

## Model and dataset licensing

For every model, LoRA, encoder, dataset, and auxiliary component, record:
- owner and official source;
- exact revision;
- license identifier and URL;
- commercial-use restrictions;
- attribution requirements;
- gated-access terms;
- redistribution restrictions.

"Open weights" does not automatically mean unrestricted commercial use. Do not assume that a model's code license also covers its weights or training data.

Ask the user before accepting gated terms, logging in, or downloading access-controlled weights. Do not bypass access controls or use unofficial mirrors to evade them.

## User media

- Treat uploaded videos, faces, voices, and private project materials as sensitive user assets.
- Keep them local unless the user explicitly authorizes an external service.
- Do not upload source footage or generated media to cloud services by default.
- Maintain immutable originals and version all derived outputs.
- Do not train or fine-tune on user media unless explicitly requested.

## Git hygiene

Never commit:
- model weights or checkpoints;
- generated videos/audio/images;
- raw source footage or private face/voice references;
- credentials, tokens, cookies, .env files;
- local machine inventory with identifying serials or usernames;
- caches, temporary frames, logs containing secrets.

Use `.gitignore` for these paths. Keep public workflow templates and docs in Git; keep machine-specific manifests and media local.
