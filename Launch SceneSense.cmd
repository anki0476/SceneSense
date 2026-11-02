@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 22 LTS, then try again.
  pause
  exit /b 1
)
if not exist "node_modules\electron\cli.js" (
  echo First run: open a terminal in this folder and run npm ci.
  pause
  exit /b 1
)
call npm start
if errorlevel 1 pause
