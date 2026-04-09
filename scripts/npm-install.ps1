$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$candidates = @(
    (Join-Path $env:ProgramFiles 'nodejs\npm.cmd'),
    (Join-Path ${env:ProgramFiles(x86)} 'nodejs\npm.cmd'),
    (Join-Path $env:LocalAppData 'Programs\nodejs\npm.cmd')
) | Where-Object { $_ -and (Test-Path $_) }

$npm = $candidates | Select-Object -First 1
if (-not $npm) {
    Write-Host 'Could not find npm.cmd. Install Node.js LTS from https://nodejs.org/ then restart Cursor (or add Node to PATH).' -ForegroundColor Red
    exit 1
}

$nodeDir = Split-Path -Parent $npm
# Electron postinstall runs `node`; Cursor tasks often omit Node on PATH
$env:Path = "$nodeDir;$env:Path"

Write-Host "Using: $npm" -ForegroundColor DarkGray
& $npm install
exit $LASTEXITCODE
