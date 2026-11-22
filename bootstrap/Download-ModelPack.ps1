[CmdletBinding(SupportsShouldProcess=$true)]
param(
  [Parameter(Mandatory=$true)][string]$RootPath,
  [Parameter(Mandatory=$true)][string]$ManifestPath
)
$ErrorActionPreference = "Stop"
$RootPath = [System.IO.Path]::GetFullPath($RootPath)
$ManifestPath = (Resolve-Path -LiteralPath $ManifestPath).Path
$marker = Join-Path $RootPath "00_CONTROL\workspace.json"
if (-not (Test-Path $marker)) { throw "Workspace marker missing: $marker" }
$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if (-not $manifest.files -or $manifest.files.Count -eq 0) { throw "Manifest has no files array." }
if ($manifest.license_reviewed -ne $true) { throw "Manifest license_reviewed must be true only after a human reviewed the model license and use restrictions." }
if ($manifest.gated -eq $true) { throw "Gated model downloads are not automated. Obtain access and handle credentials manually after reviewing the provider terms." }
$curl = Get-Command curl.exe -ErrorAction SilentlyContinue
if (-not $curl) { throw "curl.exe not found." }
$downloads = @()
$totalExpected = [int64]0
foreach ($file in $manifest.files) {
  if (-not $file.url -or ([uri]$file.url).Scheme -ne "https") { throw "Only explicit HTTPS artifact URLs are allowed." }
  if (-not $file.relative_path) { throw "Each file requires relative_path." }
  if ($file.sha256 -and ([string]$file.sha256 -notmatch '^[A-Fa-f0-9]{64}
  if ([System.IO.Path]::IsPathRooted($relative) -or $relative -match '(^|[\\/])\.\.([\\/]|$)') { throw "Unsafe relative_path rejected: $relative" }
  $target = [System.IO.Path]::GetFullPath((Join-Path (Join-Path $RootPath "02_MODELS") $relative))
  $modelsPrefix = [System.IO.Path]::GetFullPath((Join-Path $RootPath "02_MODELS")) + [System.IO.Path]::DirectorySeparatorChar
  if (-not $target.StartsWith($modelsPrefix,[System.StringComparison]::OrdinalIgnoreCase)) { throw "Target escaped model root: $target" }
  $expected = [int64]$file.expected_bytes
  $totalExpected += $expected
  $downloads += [pscustomobject]@{ file=$file; target=$target; expected=$expected }
}
$volumeRoot = [System.IO.Path]::GetPathRoot($RootPath)
$volume = Get-Volume -DriveLetter $volumeRoot.Substring(0,1)
if ($totalExpected -gt 0 -and $volume.SizeRemaining -lt ($totalExpected + 20GB)) {
  throw "Insufficient free space. Expected artifacts: $([math]::Round($totalExpected/1GB,2)) GiB; free: $([math]::Round($volume.SizeRemaining/1GB,2)) GiB; keep at least 20 GiB working reserve."
}
Write-Host "Model pack: $($manifest.name)"
Write-Host "Source: $($manifest.source)"
Write-Host "License: $($manifest.license_id) — $($manifest.license_url)"
Write-Host "Files: $($downloads.Count); declared total: $([math]::Round($totalExpected/1GB,2)) GiB"
$approval = Read-Host "After reviewing the model license and all file URLs, type DOWNLOAD to proceed"
if ($approval -cne "DOWNLOAD") { throw "Download cancelled." }
foreach ($entry in $downloads) {
  $file = $entry.file
  $target = $entry.target
  $parent = Split-Path -Parent $target
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  if (Test-Path $target) {
    $existingHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($file.sha256 -and $existingHash -eq ([string]$file.sha256).ToLowerInvariant()) {
      Write-Host "Already verified, skipping: $($file.relative_path)" -ForegroundColor Green
      continue
    }
    throw "Target already exists and does not match the expected SHA-256 (or no expected SHA was supplied). Refusing to overwrite: $target"
  }
  $partial = "$target.partial"
  if (-not $PSCmdlet.ShouldProcess($partial,"Download public model artifact from the reviewed HTTPS URL")) { return }
  Write-Host "Downloading $($file.relative_path)"
  & $curl.Source -L --fail --retry 5 --retry-delay 3 -C - --output $partial ([string]$file.url)
  if ($LASTEXITCODE -ne 0) { throw "Download failed; partial file retained for resume: $partial" }
  if (-not (Test-Path $partial)) { throw "Download did not create a file: $partial" }
  $actualBytes = (Get-Item -LiteralPath $partial).Length
  if ($entry.expected -gt 0 -and $actualBytes -ne $entry.expected) {
    throw "Size mismatch for $($file.relative_path): expected $($entry.expected), got $actualBytes. Partial retained."
  }
  $actualHash = (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($file.sha256 -and $actualHash -ne ([string]$file.sha256).ToLowerInvariant()) {
    throw "SHA-256 mismatch for $($file.relative_path). Partial retained for diagnosis."
  }
  if (-not $PSCmdlet.ShouldProcess($target,"Promote verified downloaded model artifact")) { return }
  Move-Item -LiteralPath $partial -Destination $target
  $integrity = if ($file.sha256) { "publisher_or_manifest_sha256_matched" } else { "local_sha256_computed_no_publisher_checksum" }
  Write-Host "Saved $($file.relative_path) ($([math]::Round($actualBytes/1GB,2)) GiB) SHA256=$actualHash [$integrity]" -ForegroundColor Green
}
$record = [ordered]@{
  downloaded_at=(Get-Date).ToString("o")
  pack=$manifest.name
  source=$manifest.source
  license_id=$manifest.license_id
  license_url=$manifest.license_url
  manifest_path=$ManifestPath
  files=@($downloads | ForEach-Object {
    $target=$_.target
    if (Test-Path $target) {
      [ordered]@{ path=$target; bytes=(Get-Item -LiteralPath $target).Length; sha256=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
  })
}
$recordPath = Join-Path $RootPath ("00_CONTROL\manifests\download-" + ($manifest.id -replace '[^A-Za-z0-9._-]','_') + ".json")
$record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $recordPath -Encoding UTF8
Write-Host "Model artifact download pass completed. Record: $recordPath"
)) { throw "Invalid SHA-256 value for $($file.relative_path)." }
  if (-not $file.expected_bytes -or [int64]$file.expected_bytes -le 0) { throw "expected_bytes must be a positive integer for every artifact so disk capacity can be checked before download." }
  $relative = [string]$file.relative_path
  if ([System.IO.Path]::IsPathRooted($relative) -or $relative -match '(^|[\\/])\.\.([\\/]|$)') { throw "Unsafe relative_path rejected: $relative" }
  $target = [System.IO.Path]::GetFullPath((Join-Path (Join-Path $RootPath "02_MODELS") $relative))
  $modelsPrefix = [System.IO.Path]::GetFullPath((Join-Path $RootPath "02_MODELS")) + [System.IO.Path]::DirectorySeparatorChar
  if (-not $target.StartsWith($modelsPrefix,[System.StringComparison]::OrdinalIgnoreCase)) { throw "Target escaped model root: $target" }
  $expected = if ($file.expected_bytes) { [int64]$file.expected_bytes } else { [int64]0 }
  $totalExpected += $expected
  $downloads += [pscustomobject]@{ file=$file; target=$target; expected=$expected }
}
$volumeRoot = [System.IO.Path]::GetPathRoot($RootPath)
$volume = Get-Volume -DriveLetter $volumeRoot.Substring(0,1)
if ($totalExpected -gt 0 -and $volume.SizeRemaining -lt ($totalExpected + 20GB)) {
  throw "Insufficient free space. Expected artifacts: $([math]::Round($totalExpected/1GB,2)) GiB; free: $([math]::Round($volume.SizeRemaining/1GB,2)) GiB; keep at least 20 GiB working reserve."
}
Write-Host "Model pack: $($manifest.name)"
Write-Host "Source: $($manifest.source)"
Write-Host "License: $($manifest.license_id) — $($manifest.license_url)"
Write-Host "Files: $($downloads.Count); declared total: $([math]::Round($totalExpected/1GB,2)) GiB"
$approval = Read-Host "After reviewing the model license and all file URLs, type DOWNLOAD to proceed"
if ($approval -cne "DOWNLOAD") { throw "Download cancelled." }
foreach ($entry in $downloads) {
  $file = $entry.file
  $target = $entry.target
  $parent = Split-Path -Parent $target
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  if (Test-Path $target) {
    $existingHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($file.sha256 -and $existingHash -eq ([string]$file.sha256).ToLowerInvariant()) {
      Write-Host "Already verified, skipping: $($file.relative_path)" -ForegroundColor Green
      continue
    }
    throw "Target already exists and does not match the expected SHA-256 (or no expected SHA was supplied). Refusing to overwrite: $target"
  }
  $partial = "$target.partial"
  if (-not $PSCmdlet.ShouldProcess($partial,"Download public model artifact from the reviewed HTTPS URL")) { return }
  Write-Host "Downloading $($file.relative_path)"
  & $curl.Source -L --fail --retry 5 --retry-delay 3 -C - --output $partial ([string]$file.url)
  if ($LASTEXITCODE -ne 0) { throw "Download failed; partial file retained for resume: $partial" }
  if (-not (Test-Path $partial)) { throw "Download did not create a file: $partial" }
  $actualBytes = (Get-Item -LiteralPath $partial).Length
  if ($entry.expected -gt 0 -and $actualBytes -ne $entry.expected) {
    throw "Size mismatch for $($file.relative_path): expected $($entry.expected), got $actualBytes. Partial retained."
  }
  $actualHash = (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($file.sha256 -and $actualHash -ne ([string]$file.sha256).ToLowerInvariant()) {
    throw "SHA-256 mismatch for $($file.relative_path). Partial retained for diagnosis."
  }
  if (-not $PSCmdlet.ShouldProcess($target,"Promote verified downloaded model artifact")) { return }
  Move-Item -LiteralPath $partial -Destination $target
  $integrity = if ($file.sha256) { "publisher_or_manifest_sha256_matched" } else { "local_sha256_computed_no_publisher_checksum" }
  Write-Host "Saved $($file.relative_path) ($([math]::Round($actualBytes/1GB,2)) GiB) SHA256=$actualHash [$integrity]" -ForegroundColor Green
}
$record = [ordered]@{
  downloaded_at=(Get-Date).ToString("o")
  pack=$manifest.name
  source=$manifest.source
  license_id=$manifest.license_id
  license_url=$manifest.license_url
  manifest_path=$ManifestPath
  files=@($downloads | ForEach-Object {
    $target=$_.target
    if (Test-Path $target) {
      [ordered]@{ path=$target; bytes=(Get-Item -LiteralPath $target).Length; sha256=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
  })
}
$recordPath = Join-Path $RootPath ("00_CONTROL\manifests\download-" + ($manifest.id -replace '[^A-Za-z0-9._-]','_') + ".json")
$record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $recordPath -Encoding UTF8
Write-Host "Model artifact download pass completed. Record: $recordPath"
