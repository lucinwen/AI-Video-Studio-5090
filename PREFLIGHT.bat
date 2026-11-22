@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap\Invoke-Preflight.ps1"
if errorlevel 1 (
  echo.
  echo Preflight reported an error. Read the console output.
) else (
  echo.
  echo Read-only preflight completed. Reports are saved under LocalAppData.
)
pause
