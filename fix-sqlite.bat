@echo off
echo Downloading better-sqlite3 binary for Node v24...
cd /d "%~dp0"
curl -L --fail "https://github.com/WiseLibs/better-sqlite3/releases/download/v12.8.0/better-sqlite3-v12.8.0-node-v137-win32-x64.tar.gz" -o "%TEMP%\bsqlite3.tar.gz"
if errorlevel 1 (
  echo FAILED to download. Check your internet connection.
  pause
  exit /b 1
)
echo Extracting...
tar -xzf "%TEMP%\bsqlite3.tar.gz" -C "node_modules\better-sqlite3\"
echo.
echo Testing...
node -e "require('better-sqlite3')(':memory:').close(); console.log('SUCCESS - better-sqlite3 is working')" 2>&1
echo.
pause
