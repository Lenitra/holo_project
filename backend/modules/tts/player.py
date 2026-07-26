"""
Lecture d'un fichier WAV sur la sortie audio de la machine.

Appels bloquants : ils doivent être lancés depuis un thread (cf. `engine.speak`).

  - Windows : `winsound` (bibliothèque standard)
  - Linux   : `paplay` (PulseAudio / PipeWire), sinon `aplay` (ALSA), sinon ffplay
  - macOS   : `afplay`

Aucune dépendance Python supplémentaire : on s'appuie sur les lecteurs déjà
présents sur le système.
"""

from __future__ import annotations

import platform
import shutil
import subprocess
import sys
from pathlib import Path

from core.logger import get_logger

log = get_logger(__name__)

# Lecteurs testés dans l'ordre, le premier disponible gagne.
_LINUX_PLAYERS: list[list[str]] = [
    ["paplay"],
    ["aplay", "-q"],
    ["ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet"],
    ["mpv", "--no-video", "--really-quiet"],
]

_MACOS_PLAYERS: list[list[str]] = [["afplay"]]

_cached_player: list[str] | None = None
_player_resolved = False


def _resolve_player() -> list[str] | None:
    """Trouve un lecteur en ligne de commande disponible (hors Windows)."""
    global _cached_player, _player_resolved

    if _player_resolved:
        return _cached_player

    candidates = _MACOS_PLAYERS if platform.system() == "Darwin" else _LINUX_PLAYERS
    for cmd in candidates:
        if shutil.which(cmd[0]):
            _cached_player = cmd
            break
    else:
        log.error(
            "Aucun lecteur audio trouvé (%s). Installer alsa-utils (aplay) "
            "ou pulseaudio-utils (paplay).",
            ", ".join(c[0] for c in candidates),
        )

    _player_resolved = True
    return _cached_player


def describe() -> str:
    """Nom du lecteur audio utilisé, pour les logs et le diagnostic."""
    if sys.platform == "win32":
        return "winsound"
    player = _resolve_player()
    return player[0] if player else "aucun"


def play_wav(path: Path) -> bool:
    """Joue un WAV et attend la fin de la lecture. Retourne True si OK."""
    if sys.platform == "win32":
        import winsound

        try:
            winsound.PlaySound(str(path), winsound.SND_FILENAME)
            return True
        except RuntimeError as e:
            log.error("Lecture audio impossible : %s", e)
            return False

    player = _resolve_player()
    if player is None:
        return False

    try:
        result = subprocess.run(
            [*player, str(path)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
    except OSError as e:
        log.error("Lecture audio impossible (%s) : %s", player[0], e)
        return False

    if result.returncode != 0:
        log.error(
            "%s a échoué (code %d) : %s",
            player[0],
            result.returncode,
            result.stderr.decode(errors="replace").strip(),
        )
        return False

    return True
