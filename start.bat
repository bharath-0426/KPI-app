@echo off
cd /d "%~dp0"

:: Check if client has been built
if not exist "client\dist\index.html" (
  echo ERROR: Client not built yet.
  echo Run build.bat first, then run this again.
  pause
  exit /b 1
)

:: Check if PM2 is installed
where pm2 >nul 2>&1
if errorlevel 1 (
  echo ERROR: PM2 is not installed.
  echo Run this once to install it:
  echo   npm install -g pm2
  pause
  exit /b 1
)

:: Start or restart the app
pm2 describe kpi-app >nul 2>&1
if errorlevel 1 (
  echo Starting KPI App...
  pm2 start ecosystem.config.js
) else (
  echo Restarting KPI App...
  pm2 restart kpi-app
)

echo.
echo KPI App is running at http://localhost:3001
echo.
timeout /t 2 /nobreak >nul
start http://localhost:3001
