$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $root ".arcade-nexus-server.pid"
if (Test-Path $pidFile) {
  $serverPid = Get-Content $pidFile | Select-Object -First 1
  if ($serverPid) {
    Stop-Process -Id ([int]$serverPid) -Force
    Write-Host "Stopped Arcade Nexus background server (PID $serverPid)." -ForegroundColor Yellow
  }
  Remove-Item $pidFile -Force
} else {
  Write-Host "No launcher PID file found. If the app is still open, close the app window or stop node manually." -ForegroundColor Yellow
}
