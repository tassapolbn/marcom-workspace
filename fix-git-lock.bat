@echo off
cd /d "%~dp0"
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul
del /f /q ".git\config.lock" 2>nul
del /f /q ".git\objects\maintenance.lock" 2>nul
echo.
echo Git lock files cleared. You can use GitHub Desktop now.
echo.
pause
