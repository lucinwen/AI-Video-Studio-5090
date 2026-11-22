[CmdletBinding()]
param([string]$RootPath = "")
$ErrorActionPreference = "Continue"
$checks = [System.Collections.Generic.List[object]]::new()
function Add-Check([string]$Name,[bool]$Ok,[string]$Detail) {
  $checks.Add([pscustomobject]@{name=$Name;ok=$Ok;detail=$Detail})
}
$gpu = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if ($gpu) {
  $out = (& nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader 2>&1 | Out-String).Trim()
  Add-Check "NVIDIA driver/GPU" ($LASTEXITCODE -eq 0 -and $out -match "5090") $out
} else { Add-Check "nvidia-smi" $false "Not found in PATH; inspect NVIDIA driver installation." }
$py = Get-Command py -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command python -ErrorAction SilentlyContinue }
Add-Check "Python launcher" ([bool]$py) $(if($py){$py.Source}else{"Not found"})
$ff = Get-Command ffmpeg -ErrorAction SilentlyContinue
Add-Check "FFmpeg" ([bool]$ff) $(if($ff){$ff.Source}else{"Not found"})
if ($RootPath) {
  $required = @("00_CONTROL","01_RUNTIME","02_MODELS","03_WORKFLOWS","04_ASSETS","05_PROJECTS","06_OUTPUTS","07_CACHE","08_TOOLS","09_LOGS","10_BACKUPS")
  foreach($d in $required) { $p=Join-Path $RootPath $d; Add-Check "Directory $d" (Test-Path $p) $p }
  $marker=Join-Path $RootPath "00_CONTROL\workspace.json"
  Add-Check "Workspace marker" (Test-Path $marker) $marker
}
$checks | Format-Table -AutoSize
$failed=@($checks | Where-Object {-not $_.ok})
if($failed.Count -gt 0){ Write-Host "$($failed.Count) check(s) need attention." -ForegroundColor Yellow; exit 1 }
Write-Host "All currently configured checks passed." -ForegroundColor Green
