@echo off
:: ==========================================================================
::  Holo Project — Redémarrage complet après mise à jour (Windows)
::
::  Lancé en arrière-plan par le serveur Node via le bouton Debug
::  « Mettre à jour & Redémarrer ». Coupe la stack en cours (fenetres
::  Backend Python + Frontend lancees par runall.bat) puis relance runall.bat,
::  qui fait lui-meme : git pull -> build -> demarrage.
:: ==========================================================================

set ROOT=%~dp0..

:: Laisse le temps a la requete HTTP de repondre avant de tout couper.
timeout /t 1 /nobreak >nul

:: Coupe la stack en cours (les fenetres ouvertes par runall.bat).
taskkill /FI "WINDOWTITLE eq Backend Python*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Frontend*" /T /F >nul 2>&1

:: Laisse les ports (3000 / 8765) se liberer.
timeout /t 3 /nobreak >nul

:: Relance toute la stack (git pull + build + demarrage sont dans runall.bat).
start "Holo Project" cmd /c "%ROOT%\scripts\runall.bat"
