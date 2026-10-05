@echo off
cd /d "%~dp0"
if not exist node_modules\electron\dist\electron.exe call npm ci
if not exist dist\index.html call npm run build
call npm run desktop
