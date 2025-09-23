@echo off
echo ================================================
echo     MedLab Pro - Development Mode
echo ================================================
echo Starting in development mode with auto-reload...
echo.

cd /d "%~dp0"

REM Check if nodemon is installed globally
nodemon --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing nodemon for development...
    npm install -g nodemon
)

REM Open browser
start /b cmd /c "timeout /t 3 >nul && start http://localhost:3000"

REM Start in development mode
echo Server running at: http://localhost:3000
echo Development mode: Files will auto-reload on changes
echo Press Ctrl+C to stop
echo.
npm run dev
