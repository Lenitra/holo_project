@echo off
:: Lance Firefox en mode kiosk sur la page hologramme
:: Usage : double-clic ou appeler depuis runall.bat

start "" "C:\Program Files\Mozilla Firefox\firefox.exe" -P "holokiosk" --kiosk "http://localhost:3000/hologram"
