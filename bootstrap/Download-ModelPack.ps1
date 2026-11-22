[CmdletBinding(SupportsShouldProcess=$true)]
param(
  [Parameter(Mandatory=$true)][string]$RootPath,
  [Parameter(Mandatory=$true)][string]$ManifestPath
)
$ErrorActionPreference = "Stop"

if ($WhatIfPreference) {
  Write-Host "WhatIf: validating manifest only; no files will be downloaded or changed."
}

$RootPath = [System.IO.Path]::GetFullPath($RootPath)
$ManifestPath = (Resolve-Path -LiteralPath $ManifestPath).Path
$marker = Join-Path $RootPath "00_CONTROL\workspace.json"
if (-not (Test-Path -LiteralPath $marker)) { throw "Workspace marker missing: $marker" }
$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if (-not $manifest.files -or $manifest.files.Count -eq 0) { throw "Manifest has no files array." }
if ($manifest.license_reviewed -ne $true) { throw "A human must review the model license before setting license_reviewed=true." }
if ($manifest.gated -eq $true) { throw "Gated downloads are not automated. Obtain access and handle credentials manually." }
$curl = Get-Command curl.exe -ErrorAction SilentlyContinue
if (-not $curl) { throw "curl.exe was not found." }

$modelsRoot = [System.IO.Path]::GetFullPath((Join-Path $RootPath "02_MODELS"))
$modelsPrefix = $modelsRoot.TrimEnd('\') + '\'
$downloads = @()
$seen = @{}
$totalExpected = [int64]0
foreach ($file in $manifest.files) {
  if (-not $file.url -or ([uri]$file.url).Scheme -ne "https") { throw "Only explicit HTTPS artifact URLs are allowed." }
  if (-not $file.relative_path) { throw "Each file requires relative_path." }
  if (-not $file.expected_bytes -or [int64]$file.expected_bytes -le 0) { throw "Each file requires a positive expected_bytes value." }
  if ($file.sha256 -and ([string]$file.sha256 -notmatch '^[A-Fa-f0-9]{64}$')) { throw "Invalid SHA-256 value for $($file.relative_path)." }

  $relative = ([string]$file.relative_path).Replace('/', '\')
  $segments = $relative.Split([char[]]@('\','/'))
  if ([System.IO.Path]::IsPathRooted($relative) -or ($segments -contains '..')) {
    throw "Unsafe relative_path rejected: $relative"
  }
  $target = [System.IO.Path]::GetFullPath((Join-Path $modelsRoot $relative))
  if (-not $target.StartsWith($modelsPrefix,[System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Target escaped model root: $target"
  }
  if ($seen.ContainsKey($target)) { throw "Duplicate target path in manifest: $target" }
  $seen[$target] = $true
  $expected = [int64]$file.expected_bytes
  $totalExpected += $expected
  $downloads += [pscustomobject]@{ file=$file; target=$target; expected=$expected }
}

$volumeRoot = [System.IO.Path]::GetPathRoot($RootPath)
$volume = Get-Volume -DriveLetter $volumeRoot.Substring(0,1) -ErrorAction Stop
$reserveBytes = 20GB
if ($volume.SizeRemaining -lt ($totalExpected + $reserveBytes)) {
  throw "Insufficient free space. Pack requires $([math]::Round($totalExpected/1GB,2)) GiB; free $([math]::Round($volume.SizeRemaining/1GB,2)) GiB; retain at least 20 GiB reserve."
}
Write-Host "Model pack: $($manifest.name)"
Write-Host "Source: $($manifest.source)"
Write-Host "Revision: $($manifest.revision)"
Write-Host "License: $($manifest.license_id) — $($manifest.license_url)"
Write-Host "Files: $($downloads.Count); declared total: $([math]::Round($totalExpected/1GB,2)) GiB"
if ($WhatIfPreference) { return }

$approval = Read-Host "After reviewing the license and every URL, type DOWNLOAD to proceed"
if ($approval -cne "DOWNLOAD") { throw "Download cancelled." }

foreach ($entry in $downloads) {
  $file = $entry.file
  $target = $entry.target
  $parent = Split-Path -Parent $target
  New-Item -ItemType Directory -Force -Path $parent | Out-Null

  if (Test-Path -LiteralPath $target) {
    if (-not $file.sha256) { throw "Target already exists but no publisher SHA-256 was provided; refusing to overwrite or assume it is valid: $target" }
    $existingHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($existingHash -eq ([string]$file.sha256).ToLowerInvariant()) {
      Write-Host "Already verified, skipping: $($file.relative_path)" -ForegroundColor Green
      continue
    }
    throw "Existing target has a different SHA-256; refusing to overwrite: $target"
  }

  $partial = "$target.partial"
  if (-not $PSCmdlet.ShouldProcess($partial,"Download reviewed public model artifact")) { continue }
  Write-Host "Downloading $($file.relative_path)"
  & $curl.Source --location --fail --retry 5 --retry-delay 3 --continue-at - --output $partial ([string]$file.url)
  if ($LASTEXITCODE -ne 0) { throw "Download failed; partial retained for resume: $partial" }
  if (-not (Test-Path -LiteralPath $partial)) { throw "Download did not create a partial file: $partial" }

  $actualBytes = (Get-Item -LiteralPath $partial).Length
  if ($actualBytes -ne $entry.expected) {
    throw "Size mismatch for $($file.relative_path): expected $($entry.expected), got $actualBytes. Partial retained."
  }
  $actualHash = (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($file.sha256 -and $actualHash -ne ([string]$file.sha256).ToLowerInvariant()) {
    throw "SHA-256 mismatch for $($file.relative_path). Partial retained for diagnosis."
  }
  if (-not $PSCmdlet.ShouldProcess($target,"Promote verified model artifact")) { continue }
  Move-Item -LiteralPath $partial -Destination $target
  $integrity = if ($file.sha256) { "publisher_checksum_matched" } else { "local_hash_only_not_authenticity_proof" }
  Write-Host "Saved $($file.relative_path) ($([math]::Round($actualBytes/1GB,2)) GiB) SHA256=$actualHash [$integrity]" -ForegroundColor Green
}

$record = [ordered]@{
  downloaded_at=(Get-Date).ToString("o")
  id=$manifest.id
  name=$manifest.name
  source=$manifest.source
  revision=$manifest.revision
  license_id=$manifest.license_id
  license_url=$manifest.license_url
  manifest_path=$ManifestPath
  files=@($downloads | ForEach-Object {
    $target=$_.target
    if (Test-Path -LiteralPath $target) {
      [ordered]@{ path=$target; bytes=(Get-Item -LiteralPath $target).Length; sha256=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
  })
}
$recordName = ($manifest.id -replace '[^A-Za-z0-9._-]','_')
$recordPath = Join-Path $RootPath ("00_CONTROL\manifests\download-" + $recordName + ".json")
$record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $recordPath -Encoding UTF8
Write-Host "Model artifact download pass completed. Record: $recordPath"
