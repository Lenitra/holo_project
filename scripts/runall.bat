@echo off
title Holo Project — Lancement
echo.
echo ========================================
echo   Holo Project — Mode deploye
echo ========================================
echo.

set ROOT=%~dp0..

:: 1. Build du frontend React
echo [1/3] Build du frontend React...
cd /d "%ROOT%\frontend"
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ERREUR : Build React echoue.
    pause
    exit /b 1
)
echo       Build OK.
echo.

:: 2. Lancer le backend Python
echo [2/3] Demarrage du backend Python...
start "Backend Python" cmd /k "cd /d %ROOT%\backend && python main.py"
timeout /t 2 /nobreak >nul

:: 3. Lancer le serveur Node (sert le build + proxy WS)
echo [3/3] Demarrage du serveur Node...
start "Frontend" cmd /k "cd /d %ROOT%\frontend && npx tsx server.ts"
timeout /t 2 /nobreak >nul

:: 4. Lancer Firefox kiosk sur l'hologramme
echo [4/4] Lancement de l'hologramme (Firefox kiosk)...
start "" "C:\Program Files\Mozilla Firefox\firefox.exe" -P "holokiosk" --kiosk "http://localhost:3000/hologram"

echo.
echo ========================================
echo   Tout est lance !
echo.
echo   Backend     : ws://localhost:8765
echo   Remote      : http://localhost:3000
echo   Hologramme  : http://localhost:3000/hologram
echo ========================================
echo.
echo Fermez les fenetres pour arreter.
pause
