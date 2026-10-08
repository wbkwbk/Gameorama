@echo off
setlocal EnableExtensions
cd /d "%~dp0"
chcp 65001 >nul

if not exist "dist\index.html" goto :need_install

if not defined PORT set "PORT=3001"

echo Gameorama Wartungstool
echo Adresse: http://127.0.0.1:%PORT%
echo Dieses Fenster offen lassen. Beenden mit Strg+C.
echo.

node server/index.js
set "EXITCODE=%ERRORLEVEL%"
if "%EXITCODE%"=="0" exit /b 0

echo.
echo Der Server hat sich mit einem Fehler beendet.
echo.
pause
exit /b 1

:need_install
echo dist\index.html fehlt.
echo Bitte zuerst install.cmd ausführen.
echo.
pause
exit /b 1
