# Executable bootstrap scripts

The scripts in `bootstrap/` are intentionally small and conservative. They are the first executable layer, not a promise that every model/runtime is already automated.

## 1. Read-only preflight

From repository root:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\bootstrap\Invoke-Preflight.ps1
```

Default reports are written under the current user's LocalAppData, not into Git. The script performs read-only inventory. It does not install software or alter disks.

## 2. Initialize the workspace

First inspect the preflight report and confirm the correct Samsung SSD drive letter. Then:

```powershell
.\bootstrap\Initialize-Workspace.ps1 -RootPath "E:\AI-Video-Studio" -WhatIf
.\bootstrap\Initialize-Workspace.ps1 -RootPath "E:\AI-Video-Studio"
```

Replace E: with the detected drive letter. If the folder already exists and contains files, inspect it before considering `-ConfirmExisting`. The script creates directories and a marker only. It never formats, partitions, changes drive letters, or deletes data.

## 3. Doctor

```powershell
.\bootstrap\Invoke-Doctor.ps1 -RootPath "E:\AI-Video-Studio"
```

This is a starter diagnostic. Extend it as runtime paths and API endpoints become known.

## 4. Start ComfyUI

Only after the selected ComfyUI runtime is installed and its path is known:

```powershell
.\bootstrap\Start-Studio.ps1 -ComfyRoot "E:\AI-Video-Studio\01_RUNTIME\comfyui"
```

The launcher refuses to fall back to global Python and binds to localhost. Desktop installations may require a different launcher integration; do not point this script at a Desktop-managed runtime unless its executable layout has been verified.

## Script safety

- Review scripts before running.
- Use `-WhatIf` where supported.
- Never run scripts downloaded from unreviewed third-party repositories.
- These starter scripts are not a substitute for the full preflight, model-license, dependency, and acceptance requirements in `AGENTS.md`.
