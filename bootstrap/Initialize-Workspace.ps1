[CmdletBinding(SupportsShouldProcess=$true)]
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z]:\\.*')][string]$RootPath,
  [switch]$ConfirmExisting
)
$ErrorActionPreference = "Stop"
$resolvedRoot = [System.IO.Path]::GetFullPath($RootPath)
$drive = [System.IO.Path]::GetPathRoot($resolvedRoot)
$volume = Get-Volume -DriveLetter $drive.Substring(0,1) -ErrorAction Stop
if (-not (Test-Path $drive)) { throw "Drive root not mounted: $drive" }
if ($volume.FileSystem -ne "NTFS") {
  Write-Warning "Filesystem is $($volume.FileSystem), not NTFS. No conversion will be attempted."
}
$freeGiB = [math]::Round($volume.SizeRemaining / 1GB,2)
if ($freeGiB -lt 500) { throw "Only $freeGiB GiB free. Refusing workspace initialization below 500 GiB free." }
if (Test-Path $resolvedRoot) {
  $existing = @(Get-ChildItem -LiteralPath $resolvedRoot -Force -ErrorAction Stop)
  if ($existing.Count -gt 0 -and -not $ConfirmExisting) {
    throw "Target exists and is not empty. Inspect it and rerun with -ConfirmExisting only if this is the intended workspace. No files were changed."
  }
}
$folders = @(
"00_CONTROL\config","00_CONTROL\manifests","00_CONTROL\reports","00_CONTROL\recovery",
"01_RUNTIME\comfyui","01_RUNTIME\environments","01_RUNTIME\snapshots",
"02_MODELS\checkpoints","02_MODELS\diffusion_models","02_MODELS\text_encoders","02_MODELS\clip","02_MODELS\vae","02_MODELS\loras","02_MODELS\controlnet","02_MODELS\upscale_models","02_MODELS\video_models","02_MODELS\audio_models","02_MODELS\embeddings",
"03_WORKFLOWS\ui","03_WORKFLOWS\api","03_WORKFLOWS\templates","03_WORKFLOWS\tests",
"04_ASSETS\characters","04_ASSETS\locations","04_ASSETS\props","04_ASSETS\style_frames","04_ASSETS\audio",
"05_PROJECTS","06_OUTPUTS\previews","06_OUTPUTS\approved","06_OUTPUTS\exports",
"07_CACHE\huggingface","07_CACHE\torch","07_CACHE\pip","07_CACHE\comfyui","07_CACHE\temp",
"08_TOOLS\ffmpeg","08_TOOLS\utilities","09_LOGS","10_BACKUPS"
)
foreach ($folder in $folders) {
  $path = Join-Path $resolvedRoot $folder
  if ($PSCmdlet.ShouldProcess($path,"Create directory")) { New-Item -ItemType Directory -Force -Path $path | Out-Null }
}
$marker = Join-Path $resolvedRoot "00_CONTROL\workspace.json"
if (-not (Test-Path $marker)) {
  $obj = [ordered]@{ created_at=(Get-Date).ToString("o"); root=$resolvedRoot; volume_label=$volume.FileSystemLabel; filesystem=$volume.FileSystem; initial_free_bytes=$volume.SizeRemaining; policy="Keep at least 10-15% free; never auto-delete source assets or approved outputs." }
  if ($PSCmdlet.ShouldProcess($marker,"Write workspace marker")) { $obj | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 $marker }
}
$repoRoot = Split-Path -Parent $PSScriptRoot
$templateCopies = @(
  @{ source=(Join-Path $repoRoot "config\workstation.example.yaml"); target=(Join-Path $resolvedRoot "00_CONTROL\config\workstation.yaml") },
  @{ source=(Join-Path $repoRoot "config\model-registry.example.yaml"); target=(Join-Path $resolvedRoot "00_CONTROL\manifests\model-registry.yaml") },
  @{ source=(Join-Path $repoRoot "config\workflow-registry.example.yaml"); target=(Join-Path $resolvedRoot "00_CONTROL\manifests\workflow-registry.yaml") }
)
foreach ($item in $templateCopies) {
  if ((Test-Path $item.source) -and -not (Test-Path $item.target)) {
    if ($PSCmdlet.ShouldProcess($item.target,"Copy starter configuration without overwriting")) {
      Copy-Item -LiteralPath $item.source -Destination $item.target
    }
  }
}
Write-Host "Workspace directory tree ready: $resolvedRoot" -ForegroundColor Green
Write-Host "Free space at initialization: $freeGiB GiB"
Write-Host "No formatting, partitioning, drive-letter changes, or deletion performed."
