@echo off
cd /d "%~dp0"
echo Starting KPI App (server + client)...
echo Server: http://localhost:3001
echo Client: http://localhost:5173
echo.
npm run dev
