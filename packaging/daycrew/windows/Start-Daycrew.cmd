@echo off
setlocal
title Daycrew
where node.exe >nul 2>nul || (echo Install Node.js 22.19 or newer for Daycrew agent setup. & pause & exit /b 1)
node.exe "%~dp0inkling\crew.mjs"
if errorlevel 1 (pause & exit /b 1)
call "%~dp0Daycrew-Server.cmd"
