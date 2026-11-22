[CmdletBinding()]
param(
  [string]$BaseUrl = "http://127.0.0.1:8188",
  [string]$PythonExe = ""
)
$ErrorActionPreference = "Continue"
Write-Host "Checking ComfyUI at $BaseUrl"
try {
  $stats = Invoke-RestMethod -Uri "$BaseUrl/system_stats" -TimeoutSec 5
  Write-Host "ComfyUI API: reachable" -ForegroundColor Green
  $stats | ConvertTo-Json -Depth 8
} catch {
  Write-Error "ComfyUI API is not reachable. Confirm the selected runtime is running and bound to localhost. $($_.Exception.Message)"
  exit 1
}
if ($PythonExe) {
  if (-not (Test-Path $PythonExe)) { throw "Configured Python executable does not exist: $PythonExe" }
  $probe = @'
import json
try:
    import torch
    print(json.dumps({
        "torch": torch.__version__,
        "torch_cuda_build": torch.version.cuda,
        "cuda_available": torch.cuda.is_available(),
        "device_count": torch.cuda.device_count(),
        "devices": [torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())]
    }))
except Exception as exc:
    print(json.dumps({"error": repr(exc)}))
    raise
'@
  $result = & $PythonExe -c $probe
  if ($LASTEXITCODE -ne 0) { throw "PyTorch CUDA probe failed: $result" }
  $result
}
Write-Host "API check complete. This does not prove a model workflow works; run docs/ACCEPTANCE.md."
