@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap\Invoke-V3.ps1"
if errorlevel 1 (
  echo.
  echo V3 bootstrap stopped or failed. Read the messages above. No disk formatting or partitioning is performed.
) else (
  echo.
  echo V3 core bootstrap completed.
)
pause
