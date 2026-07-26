"""
Synthèse vocale neuronale locale via Piper (modèles ONNX).

Piper tourne 100 % hors ligne sur CPU : pas de réseau à la synthèse, pas de clé
API. Seul le téléchargement initial du modèle nécessite une connexion
(cf. `modules.tts.voices`).

Les modèles chargés sont mis en cache : le premier appel prend ~1 s, les
suivants sont immédiats.
"""

from __future__ import annotations

import threading
import wave
from pathlib import Path
from typing import Any

from core.logger import get_logger
from modules.tts import voices

log = get_logger(__name__)

# Modèles chargés en mémoire, indexés par identifiant de voix.
_loaded: dict[str, Any] = {}
_load_lock = threading.Lock()


def is_available() -> bool:
    """True si le paquet `piper-tts` est installé."""
    try:
        import piper  # noqa: F401
    except ImportError:
        return False
    return True


def load(voice_id: str) -> Any:
    """Charge (et met en cache) un modèle Piper, en le téléchargeant au besoin."""
    voice = _loaded.get(voice_id)
    if voice is not None:
        return voice

    with _load_lock:
        # Un autre thread a pu charger le modèle pendant l'attente du verrou.
        voice = _loaded.get(voice_id)
        if voice is not None:
            return voice

        from piper import PiperVoice

        path = voices.ensure(voice_id)
        log.info("Chargement du modèle Piper : %s", voice_id)
        voice = PiperVoice.load(str(path))
        _loaded[voice_id] = voice

    return voice


def preload(voice_id: str) -> None:
    """Charge le modèle à l'avance pour éviter la latence au premier `speak`."""
    try:
        load(voice_id)
    except Exception as e:
        log.warning("Préchargement de %s impossible : %s", voice_id, e)


def unload() -> None:
    """Vide le cache des modèles (après un changement de voix)."""
    _loaded.clear()


def _syn_config(
    speaker_id: int | None,
    length_scale: float | None,
    volume: float | None,
) -> Any:
    from piper import SynthesisConfig

    return SynthesisConfig(
        speaker_id=speaker_id,
        length_scale=length_scale,
        volume=1.0 if volume is None else volume,
    )


def synthesize_to_file(
    text: str,
    out_path: Path,
    voice_id: str,
    speaker_id: int | None = None,
    length_scale: float | None = None,
    volume: float | None = None,
) -> Path:
    """Synthétise `text` dans un fichier WAV. Retourne le chemin écrit."""
    voice = load(voice_id)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with wave.open(str(out_path), "wb") as wav_file:
        voice.synthesize_wav(
            text,
            wav_file,
            syn_config=_syn_config(speaker_id, length_scale, volume),
        )

    return out_path


def wav_duration(path: Path) -> float:
    """Durée d'un WAV en secondes."""
    with wave.open(str(path), "rb") as wav_file:
        return wav_file.getnframes() / wav_file.getframerate()
