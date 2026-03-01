$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
Write-Host "Starting Arcade Nexus server on http://127.0.0.1:3210" -ForegroundColor Cyan
node .\server.js
