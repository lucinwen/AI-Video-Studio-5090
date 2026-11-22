@echo off
setlocal
cd /d "%~dp0"
echo AI Video Studio - ComfyUI Core Installer
echo This installs the official NVIDIA Portable runtime only after the SSD workspace is initialized.
set /p ROOT=Enter confirmed workspace root, e.g. E:\AI-Video-Studio:
if "%ROOT%"=="" (
  echo Workspace root is required.
  pause
  exit /b 2
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap\Install-Core.ps1" -RootPath "%ROOT%"
if errorlevel 1 (
  echo.
  echo Installation did not complete. Read the error above and keep the download/staging logs.
) else (
  echo.
  echo Core installation command completed. Model workflows are NOT yet installed.
)
pause
