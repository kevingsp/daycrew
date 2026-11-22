@echo off
setlocal
title Daycrew - Inkling Local
where node.exe >nul 2>nul || (echo Install Node.js 22.19 or newer, then reopen this launcher. & pause & exit /b 1)
node.exe "%~dp0inkling\start.mjs"
if errorlevel 1 pause
