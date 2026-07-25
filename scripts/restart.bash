#!/usr/bin/env bash
# ==========================================================================
#  Holo Project — Redémarrage complet après mise à jour
#
#  Lancé en arrière-plan (détaché) par le serveur Node via le bouton Debug
#  « Mettre à jour & Redémarrer ». Il coupe la stack en cours (backend Python
#  + serveur Node, et un éventuel runall.bash parent) puis relance runall.bash,
#  qui fait lui-même : git pull -> build -> démarrage.
#
#  NB : ce script ne matche jamais "restart.bash" dans ses pkill pour éviter
#  de se tuer lui-même.
# ==========================================================================

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="$ROOT/scripts/restart.log"

{
    echo
    echo "==== $(date '+%Y-%m-%d %H:%M:%S') — Redémarrage demandé ===="

    # Laisse le temps à la requête HTTP de répondre avant de tout couper.
    sleep 1

    # Coupe la stack en cours. Tuer runall.bash déclenche son trap de nettoyage
    # (qui tue ses enfants) ; on tue aussi node + python explicitement au cas où
    # la stack aurait été lancée à la main.
    pkill -f "runall.bash" 2>/dev/null || true
    pkill -f "server.ts"   2>/dev/null || true
    pkill -f "main.py"     2>/dev/null || true

    # Laisse les ports (3000 / 8765) se libérer.
    sleep 3

    # Relance toute la stack, détachée de ce script (git pull + build +
    # démarrage sont dans runall.bash). On l'invoque via `bash` pour ne pas
    # dépendre du bit exécutable du fichier.
    setsid nohup bash "$ROOT/scripts/runall.bash" < /dev/null >> "$LOG" 2>&1 &

    echo "==== Stack relancée ===="
} >> "$LOG" 2>&1
