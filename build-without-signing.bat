@echo off
echo Building RLR P2P Chat without code signing...
set CSC_IDENTITY_AUTO_DISCOVERY=false
set WIN_CSC_LINK=
set WIN_CSC_KEY_PASSWORD=
cd /d "%~dp0"
call npm run build
if %errorlevel% neq 0 exit /b %errorlevel%
npx electron-builder --win nsis --config electron-builder.yml
