[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Write-Host ""
Write-Host "AI VIDEO STUDIO 5090 - V3 CORE BOOTSTRAP" -ForegroundColor Cyan
Write-Host "This installs the ComfyUI core runtime only. Model weights are a separate reviewed step."
Write-Host ""

# Phase 1: read-only inventory
& (Join-Path $PSScriptRoot "Invoke-Preflight.ps1")
if ($LASTEXITCODE -ne 0) { throw "Preflight script returned a non-zero exit code." }

# Phase 2: map Samsung physical disk to a mounted drive letter.
$candidates = @()
foreach ($disk in (Get-Disk | Where-Object { $_.Size -ge 7TB -and $_.Size -le 9TB })) {
  $isSamsung = (($disk.FriendlyName -match "Samsung") -or ($disk.Model -match "Samsung"))
  if (-not $isSamsung) { continue }
  foreach ($partition in (Get-Partition -DiskNumber $disk.Number -ErrorAction SilentlyContinue)) {
    if (-not $partition.DriveLetter) { continue }
    $volume = Get-Volume -DriveLetter $partition.DriveLetter -ErrorAction SilentlyContinue
    if ($volume) {
      $candidates += [pscustomobject]@{
        DiskNumber=$disk.Number; Model=$disk.FriendlyName; DiskBytes=$disk.Size
        DriveLetter=$partition.DriveLetter; Label=$volume.FileSystemLabel
        FileSystem=$volume.FileSystem; VolumeBytes=$volume.Size; FreeBytes=$volume.SizeRemaining
      }
    }
  }
}
if ($candidates.Count -eq 0) {
  throw "Could not unambiguously identify a mounted Samsung 8 TB SSD. No disk was modified. Inspect the preflight report and rerun with a manually confirmed RootPath using the lower-level scripts."
}
Write-Host "Detected Samsung SSD volume candidates:" -ForegroundColor Yellow
$candidates | Format-Table -AutoSize
if ($candidates.Count -eq 1) {
  $selected = $candidates[0]
} else {
  $choice = Read-Host "Select the candidate DiskNumber/DriveLetter pair (for example 2/E)"
  $parts = $choice.Split("/")
  if ($parts.Count -ne 2) { throw "Invalid selection. Expected DiskNumber/DriveLetter." }
  $selected = $candidates | Where-Object { $_.DiskNumber -eq [int]$parts[0] -and [string]$_.DriveLetter -eq $parts[1] } | Select-Object -First 1
  if (-not $selected) { throw "Selection did not match a detected candidate." }
}
$root = "$($selected.DriveLetter):\AI-Video-Studio"
Write-Host ""
Write-Host "Selected volume: $($selected.Model), Disk $($selected.DiskNumber), $($selected.DriveLetter):" -ForegroundColor Green
Write-Host "Workspace root: $root"
Write-Host "Free space: $([math]::Round($selected.FreeBytes/1GB,1)) GiB"
$confirm = Read-Host "Type CREATE to create the workspace folders on this volume"
if ($confirm -cne "CREATE") { throw "User did not confirm workspace creation. No workspace changes made." }

# Phase 3: safe workspace initialization, WhatIf preview first.
$init = Join-Path $PSScriptRoot "Initialize-Workspace.ps1"
$confirmExisting = $false
if (Test-Path $root) {
  $items = @(Get-ChildItem -LiteralPath $root -Force)
  if ($items.Count -gt 0) {
    Write-Host "Existing non-empty target detected. Existing files will be preserved; only missing directories/config files are added."
    $confirm3 = Read-Host "Type PRESERVE to proceed without overwriting existing files"
    if ($confirm3 -cne "PRESERVE") { throw "Existing workspace not approved." }
    $confirmExisting = $true
  }
}
if ($confirmExisting) { & $init -RootPath $root -ConfirmExisting -WhatIf } else { & $init -RootPath $root -WhatIf }
$confirm2 = Read-Host "Review the WhatIf paths above. Type CONTINUE to create folders"
if ($confirm2 -cne "CONTINUE") { throw "User cancelled after preview." }
if ($confirmExisting) { & $init -RootPath $root -ConfirmExisting } else { & $init -RootPath $root }

# Phase 4: ensure 7-Zip exists. Installing a system package requires explicit confirmation.
$sevenZip = Get-Command 7z -ErrorAction SilentlyContinue
if (-not $sevenZip) { $sevenZip = Get-Command 7zz -ErrorAction SilentlyContinue }
if (-not $sevenZip) {
  $known = @("$env:ProgramFiles\7-Zip\7z.exe","${env:ProgramFiles(x86)}\7-Zip\7z.exe")
  $sevenZipPath = $known | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($sevenZipPath) {
    $env:PATH = "$(Split-Path $sevenZipPath);$env:PATH"
  } else {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) { throw "7-Zip is required to extract the official Portable archive. Install it from https://www.7-zip.org/ and rerun INSTALL-V3.bat." }
    $install7z = Read-Host "7-Zip is missing. Install 7-Zip via winget now? Type INSTALL"
    if ($install7z -cne "INSTALL") { throw "7-Zip installation declined. Workspace is ready; install 7-Zip and rerun." }
    & $winget.Source install --id 7zip.7zip --exact --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "winget 7-Zip install failed. Install 7-Zip manually and rerun." }
    $known = @("$env:ProgramFiles\7-Zip\7z.exe","$env:ProgramFiles(x86)\7-Zip\7z.exe")
    $sevenZipPath = $known | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($sevenZipPath) { $env:PATH = "$(Split-Path $sevenZipPath);$env:PATH" }
  }
}
# Phase 5: official ComfyUI NVIDIA Portable core.
& (Join-Path $PSScriptRoot "Install-Core.ps1") -RootPath $root
if ($LASTEXITCODE -ne 0) { throw "ComfyUI core installation failed. Keep staging/archive for diagnosis." }

Write-Host ""
Write-Host "V3 CORE BOOTSTRAP FINISHED." -ForegroundColor Green
Write-Host "Workspace: $root"
Write-Host "Launch ComfyUI: $root\scripts\launch-comfyui.bat"
Write-Host "Next: run the launch file, then bootstrap\Test-ComfyUI.ps1 and proceed to model workflow packs."
