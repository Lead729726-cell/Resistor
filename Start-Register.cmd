@echo off
cd /d "%~dp0"
if exist "release\Register-win32-x64\Register.exe" (
  start "" "release\Register-win32-x64\Register.exe"
) else (
  if not exist node_modules\electron\dist\electron.exe call npm ci
  call npm run dev
)
