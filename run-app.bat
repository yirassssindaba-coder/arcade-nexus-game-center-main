@echo off
setlocal
cd /d "%~dp0"
echo Launching Arcade Nexus in desktop-style app mode...
node scripts\app-launcher.js
endlocal
