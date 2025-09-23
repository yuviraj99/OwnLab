@echo off
title MedLab Pro Server
echo Starting MedLab Pro...

cd /d "%~dp0"

REM Open browser after 3 seconds
start /b cmd /c "timeout /t 3 >nul && start http://localhost:3000"

REM Start server
npm start
