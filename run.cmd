@echo off
setlocal
cd /d "%~dp0"
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
  echo npm was not found. Install Node.js from https://nodejs.org/ and reopen the terminal.
  exit /b 1
)
if not exist "node_modules\electron" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)
echo Starting CorpOS 2000...
call npm start
