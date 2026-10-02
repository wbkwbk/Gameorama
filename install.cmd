@echo off
setlocal EnableExtensions
cd /d "%~dp0"
chcp 65001 >nul

where node >nul 2>&1
if errorlevel 1 goto :no_node

set "NODE_MAJOR="
for /f "tokens=1 delims=v." %%M in ('node -v 2^>nul') do (
  if not defined NODE_MAJOR set "NODE_MAJOR=%%M"
)
if not defined NODE_MAJOR goto :no_node

set "NONDIGIT="
for /f "delims=0123456789" %%N in ("%NODE_MAJOR%") do set "NONDIGIT=%%N"
if defined NONDIGIT goto :old_node
if %NODE_MAJOR% LSS 22 goto :old_node

if exist "data\gameorama.sqlite" echo Vorhandene Datenbank data\gameorama.sqlite bleibt unverändert.

echo.
echo Abhängigkeiten werden installiert ...
call npm install
if errorlevel 1 goto :fail

echo.
echo Die Anwendung wird gebaut ...
call npm run build
if errorlevel 1 goto :fail

echo.
echo Installation abgeschlossen.
echo Starten Sie die Anwendung mit start.cmd
echo Im Browser öffnen: http://127.0.0.1:3001
echo.
pause
exit /b 0

:no_node
echo Node.js wurde nicht gefunden.
echo Bitte Node.js 22 oder neuer installieren:
echo https://nodejs.org/
echo.
pause
exit /b 1

:old_node
echo Node.js ist zu alt.
node -v
echo Nötig ist Node.js 22 oder neuer.
echo Download: https://nodejs.org/
echo.
pause
exit /b 1

:fail
echo.
echo Die Installation ist fehlgeschlagen.
echo.
pause
exit /b 1
