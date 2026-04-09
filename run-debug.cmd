@echo off
setlocal
cd /d "%~dp0"
set CORPOS_DEVTOOLS=1
where npm >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\npm.cmd" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
  ) else if exist "%LocalAppData%\Programs\nodejs\npm.cmd" (
    set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"
  )
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Install Node.js from https://nodejs.org/
  exit /b 1
)
if not exist "node_modules\electron" call npm install
call npm start
