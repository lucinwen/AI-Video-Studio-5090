[CmdletBinding(SupportsShouldProcess=$true)]
param(
  [Parameter(Mandatory=$true)][string]$RootPath,
  [string]$ComfyUiReleaseUrl = "https://github.com/comfyanonymous/ComfyUI/releases/latest/download/ComfyUI_windows_portable_nvidia.7z",
  [switch]$SkipArchiveDownload
)
$ErrorActionPreference = "Stop"
$RootPath = [System.IO.Path]::GetFullPath($RootPath)
$marker = Join-Path $RootPath "00_CONTROL\workspace.json"
if (-not (Test-Path $marker)) {
  throw "Workspace marker missing. Run Initialize-Workspace.ps1 after confirming the Samsung SSD volume."
}
$runtimeRoot = Join-Path $RootPath "01_RUNTIME\comfyui"
$modelsRoot = Join-Path $RootPath "02_MODELS"
$logsRoot = Join-Path $RootPath "09_LOGS"
$downloadsRoot = Join-Path $RootPath "00_CONTROL\downloads"
New-Item -ItemType Directory -Force -Path $downloadsRoot,$logsRoot | Out-Null

if (Test-Path (Join-Path $runtimeRoot "ComfyUI\main.py")) {
  throw "ComfyUI already appears installed at $runtimeRoot. Use the update/repair procedure; this installer never overwrites an existing runtime."
}
if ((Test-Path $runtimeRoot) -and @(Get-ChildItem -LiteralPath $runtimeRoot -Force).Count -gt 0) {
  throw "Runtime target exists and is not empty. Inspect it; installer will not overwrite it."
}
$sevenZip = Get-Command 7z -ErrorAction SilentlyContinue
if (-not $sevenZip) { $sevenZip = Get-Command 7zz -ErrorAction SilentlyContinue }
if (-not $sevenZip) { $sevenZip = Get-Command 7za -ErrorAction SilentlyContinue }
if (-not $sevenZip) {
  throw "7-Zip command not found. Install 7-Zip from https://www.7-zip.org/ (or approved winget package), reopen PowerShell, then rerun. No software was installed by this script."
}
$archive = Join-Path $downloadsRoot "ComfyUI_windows_portable_nvidia.7z"
if (-not $SkipArchiveDownload) {
  $volumeRoot = [System.IO.Path]::GetPathRoot($RootPath)
  $volume = Get-Volume -DriveLetter $volumeRoot.Substring(0,1)
  if ($volume.SizeRemaining -lt 20GB) { throw "Less than 20 GB free on target volume; refusing core installation." }
  if (Test-Path $archive) {
    Write-Host "Reusing existing archive: $archive"
  } else {
    if (-not $PSCmdlet.ShouldProcess($archive,"Download official ComfyUI NVIDIA Portable release archive")) { return }
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if (-not $curl) { throw "curl.exe is required (normally included with Windows 11)." }
    & $curl.Source -L --fail --retry 5 --retry-delay 3 --output $archive $ComfyUiReleaseUrl
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $archive) -or (Get-Item $archive).Length -lt 100MB) {
      throw "ComfyUI archive download failed or is unexpectedly small. Check network and rerun; partial archive retained for inspection."
    }
  }
}
$test = & $sevenZip.Source t $archive 2>&1
if ($LASTEXITCODE -ne 0) { throw "7-Zip archive integrity test failed. Archive retained at $archive. Output: $test" }
$stage = Join-Path $downloadsRoot ("extract-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $stage | Out-Null
if (-not $PSCmdlet.ShouldProcess($stage,"Extract official ComfyUI Portable archive")) { return }
& $sevenZip.Source x $archive "-o$stage" -y
if ($LASTEXITCODE -ne 0) { throw "7-Zip extraction failed. Staging retained at $stage" }
$mainCandidates = @(Get-ChildItem -Path $stage -Filter main.py -Recurse -File -ErrorAction SilentlyContinue)
$main = $mainCandidates | Where-Object { $_.Directory.Name -eq "ComfyUI" } | Select-Object -First 1
if (-not $main) { throw "Could not find expected ComfyUI\main.py in extracted release. Do not guess; inspect $stage" }
$sourceRoot = $main.Directory.Parent.FullName
$embeddedPython = Join-Path $sourceRoot "python_embeded\python.exe"
if (-not (Test-Path $embeddedPython)) { throw "Expected embedded Python was not found at $embeddedPython. Runtime layout changed; inspect release before proceeding." }
if (-not $PSCmdlet.ShouldProcess($runtimeRoot,"Move extracted ComfyUI Portable files into production location")) { return }
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
Get-ChildItem -LiteralPath $sourceRoot -Force | ForEach-Object {
  Move-Item -LiteralPath $_.FullName -Destination $runtimeRoot
}
Remove-Item -LiteralPath $sourceRoot -Force
$comfyRoot = Join-Path $runtimeRoot "ComfyUI"
$externalConfig = @"
comfyui:
  base_path: "$($modelsRoot -replace '\\','/')/"
  is_default: true
  checkpoints: checkpoints/
  configs: configs/
  loras: loras/
  vae: vae/
  text_encoders: text_encoders/
  clip: clip/
  clip_vision: clip_vision/
  diffusion_models: diffusion_models/
  unet: unet/
  controlnet: controlnet/
  embeddings: embeddings/
  upscale_models: upscale_models/
  latent_upscale_models: latent_upscale_models/
  audio_encoders: audio_encoders/
  model_patches: model_patches/
  style_models: style_models/
  frame_interpolation: frame_interpolation/
"@
foreach ($modelFolder in @("checkpoints","configs","loras","vae","text_encoders","clip","clip_vision","diffusion_models","unet","controlnet","embeddings","upscale_models","latent_upscale_models","audio_encoders","model_patches","style_models","frame_interpolation")) {
  New-Item -ItemType Directory -Force -Path (Join-Path $modelsRoot $modelFolder) | Out-Null
}
$configPath = Join-Path $comfyRoot "extra_model_paths.yaml"
if (Test-Path $configPath) {
  Copy-Item $configPath (Join-Path $logsRoot ("extra_model_paths.backup-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".yaml"))
}
Set-Content -LiteralPath $configPath -Value $externalConfig -Encoding UTF8
$launch = @"
@echo off
setlocal
set "STUDIO_ROOT=$RootPath"
set "HF_HOME=%STUDIO_ROOT%\07_CACHE\huggingface"
set "HUGGINGFACE_HUB_CACHE=%HF_HOME%\hub"
set "TORCH_HOME=%STUDIO_ROOT%\07_CACHE\torch"
set "PIP_CACHE_DIR=%STUDIO_ROOT%\07_CACHE\pip"
set "TEMP=%STUDIO_ROOT%\07_CACHE\temp"
set "TMP=%TEMP%"
if not exist "%TEMP%" mkdir "%TEMP%"
if not exist "%HF_HOME%" mkdir "%HF_HOME%"
if not exist "%TORCH_HOME%" mkdir "%TORCH_HOME%"
cd /d "$comfyRoot"
"..\python_embeded\python.exe" main.py --listen 127.0.0.1 --port 8188 --output-directory "$RootPath\06_OUTPUTS" --input-directory "$RootPath\04_ASSETS" --user-directory "$RootPath\00_CONTROL\comfy-user"
endlocal
"@
New-Item -ItemType Directory -Force -Path (Join-Path $RootPath "scripts") | Out-Null
Set-Content -LiteralPath (Join-Path $RootPath "scripts\launch-comfyui.bat") -Value $launch -Encoding ASCII
$pythonVersion = (& $embeddedPython --version 2>&1 | Out-String).Trim()
$torchInfo = & $embeddedPython -c "import torch; print(torch.__version__); print(torch.version.cuda); print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NO_CUDA')" 2>&1
$report = [ordered]@{
  installed_at=(Get-Date).ToString("o")
  distribution="ComfyUI Windows NVIDIA Portable"
  source_url=$ComfyUiReleaseUrl
  archive_path=$archive
  archive_sha256=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
  archive_size_bytes=(Get-Item -LiteralPath $archive).Length
  runtime_path=$runtimeRoot
  comfyui_path=$comfyRoot
  python=$pythonVersion
  torch_probe=($torchInfo -join "`n")
  note="Runtime extracted and shared model paths configured. GPU probe must be checked; no video model weights installed."
}
$report | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $RootPath "00_CONTROL\manifests\comfyui-runtime.json") -Encoding UTF8
Write-Host "ComfyUI core installed at $runtimeRoot" -ForegroundColor Green
Write-Host "Launch: $RootPath\scripts\launch-comfyui.bat"
Write-Host "Torch probe: $torchInfo"
Write-Host "Next: start ComfyUI, then run bootstrap\Test-ComfyUI.ps1 and the acceptance tests."
