#!/usr/bin/env bash
# ==========================================================================
#  Holo Project — Lancement complet de la stack (mode déployé)
#
#      bash scripts/runall.bash
#
#  AU DÉMARRAGE DE LA MACHINE, c'est la crontab qui appelle ce script.
#  C'est aussi ainsi qu'on redéploie : le bouton « Mettre à jour &
#  Redémarrer » passe par restart.bash, qui rappelle ce script — code à
#  jour, build refait, services relancés.
#
#      crontab -e
#      @reboot /bin/bash /home/pi/holo_project/scripts/runall.bash >> /home/pi/holo_project/logs/boot.log 2>&1
#
#  Chemin ABSOLU obligatoire : cron ne se place nulle part.
#
#  CE QUE CRON CHANGE, ET QUI CASSE TOUT SI ON L'IGNORE :
#
#    1. LE PATH EST QUASI VIDE (/usr/bin:/bin). uv vit dans ~/.local/bin
#       et node vient souvent de nvm : ni l'un ni l'autre n'est trouvé.
#       C'est la panne n°1 d'un @reboot, et elle est muette. On reconstruit
#       donc le PATH ici plutôt que de dépendre du .bashrc — que cron ne
#       lit pas.
#    2. IL N'Y A PAS DE RÉSEAU. cron part avant que le DHCP ait fini : le
#       git pull échouerait en silence et la machine redémarrerait sur du
#       vieux code, ce qui est exactement ce qu'un redéploiement doit
#       éviter. On attend donc le réseau, mais borné : une machine sans
#       internet doit démarrer quand même.
#    3. IL N'Y A PAS DE TERMINAL. Un git qui demande un mot de passe
#       resterait bloqué pour toujours ; GIT_TERMINAL_PROMPT=0 le fait
#       échouer tout de suite, ce qui est récupérable.
#    4. RIEN NE SURVEILLE LES SERVICES. Sans écran ni SSH, un backend qui
#       tombe reste tombé. Chaque service est donc relancé s'il chute,
#       avec une attente qui double.
#
#  Options :
#    --no-update     ne touche pas au code (ni git pull, ni attente réseau)
#    --rebuild       refait le build React même s'il semble à jour
#    --once          ne relance pas un service qui tombe
#    --sans-attente  n'attend pas le réseau au démarrage
# ==========================================================================

# Pas de `set -e` : ce script est un superviseur, il doit survivre au
# premier échec récupérable (un git pull raté n'est pas une raison de ne
# pas démarrer). Les erreurs qui comptent sont traitées à la main.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/logs"
mkdir -p "$LOGS"

SANS_MAJ=""
FORCER_BUILD=""
SANS_RELANCE=""
ATTENTE_RESEAU=90
for arg in "$@"; do
    case "$arg" in
        --no-update)    SANS_MAJ=1 ;;
        --rebuild)      FORCER_BUILD=1 ;;
        --once)         SANS_RELANCE=1 ;;
        --sans-attente) ATTENTE_RESEAU=0 ;;
        --help|-h)      sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,2\}//'; exit 0 ;;
    esac
done
export HOLO_SANS_RELANCE="$SANS_RELANCE"

info()  { echo "  [$(date '+%F %T')] $*"; }
souci() { echo "  [$(date '+%F %T')] [!] $*" >&2; }

echo
echo "========================================"
echo "  Holo Project — Mode déployé"
echo "========================================"
info "Racine : $ROOT"

# --------------------------------------------------------------------------
#  1. L'environnement que cron ne donne pas
# --------------------------------------------------------------------------
# HOME est posé par cron, mais pas par tous les appelants (systemd, un
# `su` sec) — et uv comme npm y rangent leurs caches.
export HOME="${HOME:-$(getent passwd "$(id -u)" | cut -d: -f6)}"
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:/usr/local/bin:/usr/local/sbin:$PATH:/usr/bin:/bin:/usr/sbin:/sbin"

# nvm ne s'active que par son script : sans ça, `node` reste introuvable
# sur toute machine où Node vient de nvm plutôt que d'apt.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    set +u
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh" --no-use >/dev/null 2>&1
    nvm use --lts >/dev/null 2>&1 || nvm use default >/dev/null 2>&1
    set -u
fi

manquant=()
command -v uv  >/dev/null 2>&1 || manquant+=("uv (backend Python)")
command -v npm >/dev/null 2>&1 || manquant+=("npm (frontend)")
if [ "${#manquant[@]}" -gt 0 ]; then
    souci "outils introuvables dans le PATH :"
    for m in "${manquant[@]}"; do souci "  - $m"; done
    souci "PATH utilisé : $PATH"
    souci "cron ne lit pas ~/.bashrc : ajoutez le chemin réel en tête de ce script."
    exit 1
fi

# --------------------------------------------------------------------------
#  2. Un seul lanceur à la fois
#
#  Deux stacks en parallèle, c'est deux processus qui se disputent les
#  ports 8765 et 3000 : le second échoue, et on ne sait pas lequel des
#  deux répond. Le cas arrive pour de vrai — un @reboot qui croise un
#  lancement à la main, ou un restart.bash un peu rapide.
#
#  L'attente (plutôt qu'un échec sec) est là pour restart.bash : il tue
#  la stack puis relance aussitôt, et le verrou de l'ancienne peut ne pas
#  être encore relâché.
# --------------------------------------------------------------------------
if command -v flock >/dev/null 2>&1; then
    exec 9>"/tmp/holo-runall.lock"
    if ! flock -w 30 9; then
        souci "une autre instance de runall.bash tourne déjà — abandon."
        exit 1
    fi
fi

# --------------------------------------------------------------------------
#  3. Le réseau, avant de parler à GitHub
# --------------------------------------------------------------------------
attendre_reseau() {
    local max="$1" ecoule=0
    joignable() { getent hosts github.com >/dev/null 2>&1; }
    # Sans getent on ne sait pas tester : inutile de faire attendre pour rien.
    command -v getent >/dev/null 2>&1 || return 0
    joignable && return 0
    info "Attente du réseau (jusqu'à ${max}s)..."
    while [ "$ecoule" -lt "$max" ]; do
        sleep 3
        ecoule=$(( ecoule + 3 ))
        joignable && { info "Réseau disponible après ${ecoule}s."; return 0; }
    done
    souci "toujours pas de réseau après ${max}s — démarrage sans mise à jour."
    return 1
}

# --------------------------------------------------------------------------
#  4. Mise à jour du code — JAMAIS bloquante
#
#  --autostash, et pas `reset --hard` : backend/data/*.json est SUIVI PAR
#  GIT et écrit à l'exécution (réglages, courses, séances). Un pull sec
#  refuserait de s'exécuter « local changes would be overwritten », et un
#  reset --hard effacerait les données de l'utilisateur. L'autostash met
#  ces modifications de côté, récupère le code, puis les remet.
# --------------------------------------------------------------------------
echo
info "[1/4] Mise à jour du code..."
if [ -n "$SANS_MAJ" ]; then
    info "      ignorée (--no-update)."
elif [ ! -d "$ROOT/.git" ]; then
    info "      pas un dépôt git, ignorée."
else
    [ "$ATTENTE_RESEAU" -gt 0 ] && attendre_reseau "$ATTENTE_RESEAU"
    # Sans terminal, une demande d'identifiants bloquerait pour toujours.
    if GIT_TERMINAL_PROMPT=0 git -C "$ROOT" pull --autostash --quiet; then
        info "      code à jour : $(git -C "$ROOT" log -1 --pretty='%h %s' | cut -c1-60)"
    else
        souci "      git pull échoué — on continue avec le code local."
        # Un autostash interrompu laisse les données dans le stash : on le
        # dit, sinon l'utilisateur retrouve des réglages vides sans savoir
        # pourquoi ni où ils sont partis.
        git -C "$ROOT" stash list 2>/dev/null | grep -q . \
            && souci "      ATTENTION : des modifications locales sont dans 'git stash list'."
    fi
fi

# --------------------------------------------------------------------------
#  5. Dépendances et build du frontend
#
#  Refaits seulement quand c'est nécessaire : sur un Raspberry Pi, un
#  `npm ci` suivi d'un build coûte plusieurs minutes. Les rejouer à chaque
#  redémarrage rendrait le bouton « Mettre à jour & Redémarrer »
#  inutilisable.
# --------------------------------------------------------------------------
echo
info "[2/4] Dépendances et build du frontend..."
cd "$ROOT/frontend" || { souci "dossier frontend introuvable."; exit 1; }

empreinte=""
[ -f package-lock.json ] && empreinte="$(sha256sum package-lock.json | cut -d' ' -f1)"
marque="node_modules/.holo-lock.sha"
if [ ! -d node_modules ] || [ "$empreinte" != "$(cat "$marque" 2>/dev/null || echo)" ]; then
    info "      installation des dépendances npm..."
    if npm ci --no-audit --no-fund || npm install --no-audit --no-fund; then
        [ -n "$empreinte" ] && echo "$empreinte" > "$marque"
    else
        souci "installation npm impossible."
        exit 1
    fi
else
    info "      dépendances déjà à jour."
fi

# Le build ne dépend que de ce qui entre dans dist/ : hologram/ est servi
# tel quel par server.ts et n'a donc rien à faire ici.
SOURCES=(src public index.html vite.config.ts tsconfig.json tsconfig.app.json package.json)
besoin_build=""
if [ -n "$FORCER_BUILD" ] || [ ! -f dist/index.html ]; then
    besoin_build=1
elif [ -n "$(find "${SOURCES[@]}" -newer dist/index.html -print -quit 2>/dev/null)" ]; then
    besoin_build=1
fi

if [ -n "$besoin_build" ]; then
    info "      build React (quelques minutes sur un RPi)..."
    if ! npm run build; then
        souci "build React échoué — la stack ne démarre pas."
        exit 1
    fi
    info "      build OK."
else
    info "      build déjà à jour."
fi

# --------------------------------------------------------------------------
#  6. Démarrage supervisé
#
#  setsid : chaque service devient chef de son groupe de processus. C'est
#  ce qui permet de l'arrêter AVEC ses enfants — uv lance un python, npm
#  lance un node, et tuer seulement le père laisserait ces orphelins tenir
#  les ports.
#
#  9>&- ferme le verrou hérité : sans ça, un service vivant garderait le
#  fichier de verrou ouvert après la mort de ce script, et l'instance
#  suivante attendrait un lanceur qui n'existe plus.
# --------------------------------------------------------------------------
PIDS=()
NOMS=()

demarrer() {
    local nom="$1" repertoire="$2"; shift 2
    local journal="$LOGS/$nom.log"
    setsid bash -c '
        cd "$1" || exit 1
        nom="$2"; shift 2
        attente=5
        while true; do
            echo "[$(date "+%F %T")] --- démarrage de $nom ---"
            "$@"
            code=$?
            if [ "$code" -eq 0 ]; then
                echo "[$(date "+%F %T")] $nom s'\''est arrêté normalement."
                exit 0
            fi
            if [ -n "${HOLO_SANS_RELANCE:-}" ]; then
                echo "[$(date "+%F %T")] $nom arrêté (code $code) — relance désactivée."
                exit "$code"
            fi
            echo "[$(date "+%F %T")] $nom arrêté (code $code) — relance dans ${attente}s."
            sleep "$attente"
            attente=$(( attente * 2 ))
            [ "$attente" -gt 300 ] && attente=300
        done
    ' _ "$repertoire" "$nom" "$@" >> "$journal" 2>&1 9>&- &
    PIDS+=("$!")
    NOMS+=("$nom")
    info "      $nom lancé (journal : $journal)"
}

# Un port qui écoute, pas un sleep : le backend met 2 s sur une machine
# chaude et 20 s sur un RPi qui vient de démarrer. Un délai fixe est donc
# soit trop court (le serveur Node part dans le vide), soit du temps perdu.
attendre_port() {
    local port="$1" max="$2" i=0
    while [ "$i" -lt "$max" ]; do
        (echo > "/dev/tcp/127.0.0.1/$port") 2>/dev/null && return 0
        sleep 1
        i=$(( i + 1 ))
    done
    return 1
}

arret() {
    [ -n "${ARRET_FAIT:-}" ] && return
    ARRET_FAIT=1
    echo
    info "Arrêt des services..."
    local pid
    for pid in ${PIDS[@]+"${PIDS[@]}"}; do
        kill -0 "$pid" 2>/dev/null || continue
        kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
    done
    sleep 2
    for pid in ${PIDS[@]+"${PIDS[@]}"}; do
        kill -0 "$pid" 2>/dev/null || continue
        kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
    done
    info "Tout est arrêté."
}
trap 'arret; exit 0' INT TERM
trap arret EXIT

echo
info "[3/4] Démarrage du backend Python..."
demarrer backend "$ROOT/backend" uv run python main.py

if attendre_port 8765 60; then
    info "      backend prêt (ws://localhost:8765)."
else
    souci "      le backend ne répond pas encore sur 8765 — on lance le reste"
    souci "      quand même, le proxy WS se rattrapera à la reconnexion."
fi

echo
info "[4/4] Démarrage du serveur Node..."
# ./node_modules/.bin/tsx plutôt que `npx tsx` : npx peut vouloir aller
# chercher le paquet sur le réseau, et tsx est déjà une dépendance du
# projet. Au démarrage de la machine, mieux vaut ne rien demander à
# internet qu'on ait déjà en local.
if [ -x "$ROOT/frontend/node_modules/.bin/tsx" ]; then
    demarrer node "$ROOT/frontend" ./node_modules/.bin/tsx server.ts
else
    demarrer node "$ROOT/frontend" npx tsx server.ts
fi

if attendre_port 3000 30; then
    info "      serveur Node prêt (http://localhost:3000)."
else
    souci "      le serveur Node n'écoute pas encore sur 3000 — voir $LOGS/node.log"
fi

echo
echo "========================================"
echo "  Tout est lancé !"
echo
echo "  Backend     : ws://localhost:8765"
echo "  Remote      : http://localhost:3000"
echo "  Hologramme  : http://localhost:3000/hologram"
echo
echo "  Journaux    : $LOGS/backend.log, $LOGS/node.log"
echo "========================================"
echo
info "Ctrl+C (ou kill) pour tout arrêter."

# Ce script reste : c'est lui qui tient les services, et c'est lui que
# restart.bash tue pour redéployer.
wait
info "Plus aucun service ne tourne."
