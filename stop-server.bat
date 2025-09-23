@echo off
echo Stopping MedLab Pro server...

REM Kill any Node.js processes running on port 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do (
    taskkill /F /PID %%a >nul 2>&1
)

REM Kill any npm processes
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM npm.cmd >nul 2>&1

echo Server stopped.
timeout /t 2 >nul
