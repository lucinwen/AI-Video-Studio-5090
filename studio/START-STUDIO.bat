@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22+ is required. See studio\README.md.
  pause
  exit /b 1
)
node -e "process.exit(+process.versions.node.split('.')[0] >= 22 ? 0 : 1)"
if errorlevel 1 (
  echo This Studio needs Node.js 22 or newer. See studio\README.md.
  pause
  exit /b 1
)
echo Open the local address shown below.
node "%~dp0server.mjs"
if errorlevel 1 pause
