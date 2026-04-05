@echo off
cd /d "%~dp0"
echo ============================================
echo  KPI App - Build for Production
echo ============================================
echo.

echo [1/2] Building React client...
call npm run build -w kpi-client
if errorlevel 1 (
  echo.
  echo FAILED to build client. See errors above.
  pause
  exit /b 1
)

echo.
echo [2/2] Build complete!
echo       Output: client\dist\
echo.
echo You only need to run this once, or after making code changes.
echo To start the app, run: start.bat
echo.
pause
