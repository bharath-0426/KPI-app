@echo off
echo Starting KPI client...
echo Open http://localhost:5173 in your browser once ready.
cd /d "%~dp0"
npm run dev -w kpi-client
