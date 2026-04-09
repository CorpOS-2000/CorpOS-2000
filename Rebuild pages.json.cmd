@echo off
setlocal
title CorpOS 2000 — Rebuild pages.json only
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
echo Running node data\build-pages.mjs ^(writes data\pages.json^)...
call npm run build:data
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)
echo Done.
pause
