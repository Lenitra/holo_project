#!/usr/bin/env bash
set -euo pipefail

echo
echo "========================================"
echo "  Holo Project — Mode deploye"
echo "========================================"
echo

# Racine du projet (dossier parent de ce script)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Nettoyage : on tue les processus lances a la sortie du script
PIDS=()
cleanup() {
    echo
    echo "Arret des processus..."
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
}
trap cleanup EXIT INT TERM

# 1. Mise a jour du code (git pull)
echo "[1/4] Mise a jour du code (git pull)..."
cd "$ROOT"
git pull || echo "      AVERTISSEMENT : git pull echoue, on continue avec le code local."
echo

# 2. Build du frontend React
echo "[2/4] Build du frontend React..."
cd "$ROOT/frontend"
if ! npm run build; then
    echo "ERREUR : Build React echoue."
    exit 1
fi
echo "      Build OK."
echo

# 3. Lancer le backend Python
echo "[3/4] Demarrage du backend Python..."
( cd "$ROOT/backend" && uv run python main.py ) &
PIDS+=("$!")
sleep 2

echo
echo "Delai de lancement pour le backend..."
sleep 5
echo

# 4. Lancer le serveur Node (sert le build + proxy WS)
echo "[4/4] Demarrage du serveur Node..."
( cd "$ROOT/frontend" && npx tsx server.ts ) &
PIDS+=("$!")
sleep 2

echo
echo "========================================"
echo "  Tout est lance !"
echo
echo "  Backend     : ws://localhost:8765"
echo "  Remote      : http://localhost:3000"
echo "  Hologramme  : http://localhost:3000/hologram"
echo "========================================"
echo
echo "Ctrl+C pour tout arreter."

# Attend la fin des processus (ou Ctrl+C)
wait
