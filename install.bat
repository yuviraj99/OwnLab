@echo off
echo ================================================
echo     MedLab Pro - Installation
echo ================================================
echo Installing required dependencies...
echo.

cd /d "%~dp0"

REM Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo.
    echo Please download and install Node.js from:
    echo https://nodejs.org/
    echo.
    echo Choose the LTS (Long Term Support) version
    echo After installation, restart your computer and run this file again.
    echo.
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo NPM version:
npm --version
echo.

echo Installing dependencies...
npm install

if %errorlevel% equ 0 (
    echo.
    echo ✓ Installation completed successfully!
    echo.
    echo You can now run the application using:
    echo   - start.bat (Normal mode)
    echo   - quick-start.bat (Quick launch)
    echo   - dev-start.bat (Development mode)
    echo.
) else (
    echo.
    echo ✗ Installation failed!
    echo Please check your internet connection and try again.
    echo.
)

pause
