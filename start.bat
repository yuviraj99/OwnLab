@echo off
echo ================================================
echo       MedLab Pro - Laboratory Management System
echo ================================================
echo Starting the server...
echo.

REM Change to the directory where this batch file is located
cd /d "%~dp0"

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

REM Check if package.json exists
if not exist "package.json" (
    echo ERROR: package.json not found!
    echo Please ensure you are running this from the correct directory.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    echo Please wait, this may take a few minutes...
    npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies!
        echo Press any key to exit...
        pause >nul
        exit /b 1
    )
)

REM Start the server in background and open browser
echo Starting MedLab Pro server...
echo Server will run at: http://localhost:3000
echo.
echo IMPORTANT: Keep this window open to keep the server running
echo To stop the server, press Ctrl+C in this window
echo.

REM Wait 3 seconds then open browser
start /b cmd /c "timeout /t 3 >nul && start http://localhost:3000"

REM Start the Node.js server
npm start
