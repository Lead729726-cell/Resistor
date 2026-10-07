@echo off
setlocal
cd /d "%~dp0"
if exist "release\0.16.1\Resistor-win32-x64\Resistor.exe" (
  start "" "release\0.16.1\Resistor-win32-x64\Resistor.exe"
) else (
  if not exist node_modules\electron\dist\electron.exe call npm ci
  call npm run dev
)
