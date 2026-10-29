@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instaliraj Node.js 22 ili noviji sa https://nodejs.org/ pa pokusaj ponovo.
  pause
  exit /b 1
)
echo Otvori http://localhost:3000 u pregledniku.
echo Terminal ostavi otvoren dok koristis aplikaciju.
node server.mjs
pause
