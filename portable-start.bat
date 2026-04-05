@echo off
cd /d "%~dp0"

set NODE_EXE=%~dp0node\node.exe

:: ── Check bundled Node.js exists ─────────────────────────────────────────────
if not exist "%NODE_EXE%" (
  echo.
  echo  ERROR: Bundled Node.js not found.
  echo.
  echo  Do this once to set it up:
  echo.
  echo  1. Go to:  nodejs.org/en/download
  echo  2. Under "Prebuilt Binaries", choose:
  echo       Version  : 24.x.x
  echo       OS       : Windows
  echo       Arch     : x64
  echo       Package  : .zip   ^(NOT the .msi installer^)
  echo  3. Download and extract the zip
  echo  4. Rename the extracted folder to "node"
  echo  5. Move the "node" folder into this kpi-app folder
  echo     so the path looks like:  kpi-app\node\node.exe
  echo.
  pause
  exit /b 1
)

:: ── Check client is built ─────────────────────────────────────────────────────
if not exist "%~dp0client\dist\index.html" (
  echo.
  echo  ERROR: Client has not been built yet.
  echo  Run build.bat on the source PC first, then copy the folder again.
  echo.
  pause
  exit /b 1
)

:: ── Check if already running ──────────────────────────────────────────────────
tasklist /FI "WINDOWTITLE eq KPI App Server" 2>nul | find /I "cmd.exe" >nul
if not errorlevel 1 (
  echo  KPI App is already running.
  echo  Opening browser...
  start http://localhost:3001
  exit /b 0
)

:: ── Start server in a new window ──────────────────────────────────────────────
echo  Starting KPI App...
start "KPI App Server" cmd /k ""%NODE_EXE%" "%~dp0server\src\index.js" && echo. && echo  Press Ctrl+C or close this window to stop."

:: Wait for server to be ready
timeout /t 3 /nobreak >nul

echo.
echo  KPI App is running at http://localhost:3001
echo  To STOP: close the "KPI App Server" window, or run portable-stop.bat
echo.
start http://localhost:3001
