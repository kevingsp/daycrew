@echo off
setlocal
set "T3CODE_TELEMETRY_ENABLED=false"
set "T3CODE_OTEL_SDK_DISABLED=true"
title Daycrew
if not exist "%~dp0t3.exe" (
  echo Extract the entire ZIP before opening this launcher.
  pause
  exit /b 1
)
if not exist "%~dp0client\index.html" (
  echo The app files are missing. Extract the entire ZIP and try again.
  pause
  exit /b 1
)
echo Starting Daycrew. Keep this window open while you use the app.
echo If a browser window does not open, copy the pairing URL shown below.
echo.
"%~dp0t3.exe" --host 127.0.0.1 --port 47831 --base-dir "%LOCALAPPDATA%\T3CodeWorkspaces"
if errorlevel 1 (
  echo.
  echo Daycrew stopped. Check the message above.
  pause
  exit /b 1
)
