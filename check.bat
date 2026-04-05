@echo off
echo ============================================
echo  KPI App Diagnostic Check
echo ============================================
echo.

cd /d "%~dp0"

echo [1] Node.js version:
node --version
echo.

echo [2] Checking better-sqlite3 binary...
node -e "require('better-sqlite3')(':memory:').close(); console.log('  OK - better-sqlite3 works')" 2>nul || echo   FAIL - binary missing, run fix-sqlite.bat
echo.

echo [3] Checking database file...
if exist "server\data\kpi.db" (
  echo   OK - kpi.db found
) else (
  echo   FAIL - kpi.db missing, run: node server/src/db/seed.js
)
echo.

echo [4] Checking server can start (quick test)...
node -e "
const { initSchema } = require('./server/src/db/schema');
initSchema();
console.log('  OK - schema loaded');
" 2>&1
echo.

echo [5] Server port 3001 status:
powershell -Command "if (Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue) { Write-Host '  IN USE - kill it before starting server' } else { Write-Host '  FREE - ready to start' }"
echo.

echo ============================================
echo  If all show OK, run start-server.bat then
echo  start-client.bat, then open:
echo  http://localhost:5173
echo ============================================
pause
