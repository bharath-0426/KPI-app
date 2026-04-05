@echo off
echo Stopping any existing Node processes on port 3001...
powershell -Command "Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 1 /nobreak >nul
echo Starting KPI server...
cd /d "%~dp0"
node server/src/index.js
