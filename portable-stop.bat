@echo off
cd /d "%~dp0"

echo  Stopping KPI App...

:: Kill the server window by title
taskkill /FI "WINDOWTITLE eq KPI App Server" /F >nul 2>&1

:: Also kill any node process running our server file (safety net)
wmic process where "name='node.exe' and CommandLine like '%%server\\src\\index.js%%'" delete >nul 2>&1

echo  KPI App stopped.
timeout /t 2 /nobreak >nul
