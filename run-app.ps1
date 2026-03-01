$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
Write-Host "Launching Arcade Nexus in desktop-style app mode..." -ForegroundColor Cyan
node .\scripts\app-launcher.js
