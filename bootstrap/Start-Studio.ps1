[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$ComfyRoot,
  [int]$Port = 8188
)
$ErrorActionPreference = "Stop"
$main = Join-Path $ComfyRoot "main.py"
if (-not (Test-Path $main)) { throw "ComfyUI main.py not found at $main" }
$python = Join-Path $ComfyRoot "..\python_embeded\python.exe"
if (-not (Test-Path $python)) {
  $python = Join-Path $ComfyRoot ".venv\Scripts\python.exe"
}
if (-not (Test-Path $python)) { throw "No known isolated Python executable found. Configure runtime path explicitly; refusing to use global Python." }
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) { throw "Port $Port is already in use. Inspect the owning process; launcher will not kill it." }
Write-Host "Starting ComfyUI on localhost:$Port using $python"
Push-Location $ComfyRoot
try {
  & $python $main --listen 127.0.0.1 --port $Port
} finally { Pop-Location }
