[CmdletBinding()]
param(
  [string]$OutputDirectory = (Join-Path $env:LOCALAPPDATA "AI-Video-Studio\preflight")
)
$ErrorActionPreference = "Continue"
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$report = [ordered]@{
  generated_at = (Get-Date).ToString("o")
  computer_name = $env:COMPUTERNAME
  user_name = $env:USERNAME
  os = $null; cpu = $null; ram_gb = $null
  gpus = @(); physical_disks = @(); disk_partitions = @(); volumes = @()
  commands = @{}
  warnings = @()
}
try {
  $os = Get-CimInstance Win32_OperatingSystem
  $report.os = [ordered]@{ caption=$os.Caption; version=$os.Version; build=$os.BuildNumber; architecture=$os.OSArchitecture }
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  $report.cpu = [ordered]@{ name=$cpu.Name; cores=$cpu.NumberOfCores; logical_processors=$cpu.NumberOfLogicalProcessors }
  $report.ram_gb = [math]::Round(($os.TotalVisibleMemorySize * 1KB) / 1GB,2)
} catch { $report.warnings += "OS/CPU/RAM query failed: $($_.Exception.Message)" }
try {
  $report.gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object {
    [ordered]@{ name=$_.Name; driver_version=$_.DriverVersion; driver_date=$_.DriverDate; adapter_ram_bytes=$_.AdapterRAM }
  })
} catch { $report.warnings += "GPU query failed: $($_.Exception.Message)" }
try {
  $report.physical_disks = @(Get-PhysicalDisk | ForEach-Object {
    [ordered]@{ friendly_name=$_.FriendlyName; manufacturer=$_.Manufacturer; model=$_.Model; serial_number=$_.SerialNumber; size_bytes=$_.Size; media_type=[string]$_.MediaType; bus_type=[string]$_.BusType; health=[string]$_.HealthStatus; operational_status=($_.OperationalStatus -join ",") }
  })
} catch { $report.warnings += "Physical disk query unavailable: $($_.Exception.Message)" }
try {
  $report.disk_partitions = @(Get-Disk | ForEach-Object {
    $disk = $_
    Get-Partition -DiskNumber $disk.Number -ErrorAction SilentlyContinue | ForEach-Object {
      [ordered]@{ disk_number=$disk.Number; disk_friendly_name=$disk.FriendlyName; disk_model=$disk.Model; disk_size_bytes=$disk.Size; partition_number=$_.PartitionNumber; drive_letter=$_.DriveLetter; partition_size_bytes=$_.Size; type=[string]$_.Type }
    }
  })
} catch { $report.warnings += "Disk/partition mapping unavailable: $($_.Exception.Message)" }
try {
  $report.volumes = @(Get-Volume | Where-Object DriveLetter | ForEach-Object {
    [ordered]@{ drive_letter=$_.DriveLetter; path=("$($_.DriveLetter):\"); label=$_.FileSystemLabel; filesystem=$_.FileSystem; size_bytes=$_.Size; free_bytes=$_.SizeRemaining }
  })
} catch { $report.warnings += "Volume query failed: $($_.Exception.Message)" }
foreach ($cmd in @("nvidia-smi","git","python","py","ffmpeg","ffprobe","7z","winget")) {
  $found = Get-Command $cmd -ErrorAction SilentlyContinue
  $report.commands[$cmd] = if ($found) { $found.Source } else { $null }
}
$nvsmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if ($nvsmi) {
  try { $report.nvidia_smi = (& nvidia-smi --query-gpu=name,memory.total,driver_version,pci.bus_id --format=csv,noheader 2>&1 | Out-String).Trim() }
  catch { $report.warnings += "nvidia-smi failed: $($_.Exception.Message)" }
}
$jsonPath = Join-Path $OutputDirectory "preflight-$stamp.json"
$mdPath = Join-Path $OutputDirectory "preflight-$stamp.md"
$report | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $jsonPath
$osJson = $report.os | ConvertTo-Json -Compress
$cpuJson = $report.cpu | ConvertTo-Json -Compress
$lines = @(
  "# AI Video Studio — Read-only preflight", "",
  "Generated: $($report.generated_at)", "",
  "## OS", "`$osJson`", "",
  "## CPU / RAM", "`$cpuJson`", "RAM: $($report.ram_gb) GiB", "",
  "## GPUs", "```", ($report.gpus | ConvertTo-Json -Depth 5), "```", "",
  "## Physical disks", "```", ($report.physical_disks | ConvertTo-Json -Depth 5), "```", "",
  "## Disk to partition mapping", "```", ($report.disk_partitions | ConvertTo-Json -Depth 5), "```", "",
  "## Volumes", "```", ($report.volumes | ConvertTo-Json -Depth 5), "```", "",
  "## Commands", "```", ($report.commands | ConvertTo-Json -Depth 5), "```", "",
  "## Warnings", ($report.warnings | ForEach-Object { "- $_" })
)
$lines | Set-Content -Encoding UTF8 $mdPath
Write-Host "Preflight complete (read-only)." -ForegroundColor Green
Write-Host "JSON: $jsonPath"
Write-Host "Report: $mdPath"
Write-Host "No drivers, disks, partitions, Python environments, or user files were modified."
