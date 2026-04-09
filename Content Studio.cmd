@echo off
setlocal
title CorpOS 2000 Content Studio
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
  echo npm was not found. Install Node.js from https://nodejs.org/ and reopen this window.
  pause
  exit /b 1
)
cd content-studio
if not exist "node_modules\electron" (
  echo Installing Content Studio dependencies ^(first run only^)...
  call npm install
  if errorlevel 1 (
    echo Install failed.
    pause
    exit /b 1
  )
)
echo Starting Content Studio ^(edit data, validate, backup, content.pack^)...
call npm start
if errorlevel 1 (
  echo Content Studio exited with an error.
  pause
  exit /b 1
)
