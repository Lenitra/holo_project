@echo off
title Holo Project — Lancement
echo.
echo ========================================
echo   Holo Project — Mode deploye
echo ========================================
echo.

set ROOT=%~dp0..

:: 1. Mise a jour du code (git pull)
echo [1/4] Mise a jour du code (git pull)...
cd /d "%ROOT%"
git pull || echo       AVERTISSEMENT : git pull echoue, on continue avec le code local.
echo.

:: 2. Build du frontend React
echo [2/4] Build du frontend React...
cd /d "%ROOT%\frontend"
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ERREUR : Build React echoue.
    pause
    exit /b 1
)
echo       Build OK.
echo.

:: 3. Lancer le backend Python
echo [3/4] Demarrage du backend Python...
start "Backend Python" cmd /k "cd /d %ROOT%\backend && uv run python main.py"
timeout /t 2 /nobreak >nul

echo.
echo Delai de lancement pour le backend...
timeout /t 5 /nobreak >nul
echo.


:: 4. Lancer le serveur Node (sert le build + proxy WS)
echo [4/4] Demarrage du serveur Node...
start "Frontend" cmd /k "cd /d %ROOT%\frontend && npx tsx server.ts"
timeout /t 2 /nobreak >nul


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
