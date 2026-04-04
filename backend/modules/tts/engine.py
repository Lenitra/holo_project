"""
Moteur TTS local basé sur pyttsx3.

Le moteur tourne dans un thread dédié pour ne pas bloquer la boucle asyncio.

Note : pyttsx3 a un bug connu où runAndWait() ne fonctionne qu'une seule
fois par instance. On recrée donc le moteur à chaque appel speak().
Les réglages (voix, débit, volume) sont conservés et réappliqués.
"""

import asyncio
import threading
from typing import Any

import pyttsx3

from core.logger import get_logger

log = get_logger(__name__)

# ── Réglages persistants ────────────────────────────────────────────

_lock = threading.Lock()
_voice_id: str | None = None
_rate: int | None = None
_volume: float | None = None


def _new_engine() -> pyttsx3.Engine:
    """Crée un moteur pyttsx3 frais et applique les réglages mémorisés."""
    engine = pyttsx3.init()
    if _voice_id is not None:
        engine.setProperty("voice", _voice_id)
    if _rate is not None:
        engine.setProperty("rate", _rate)
    if _volume is not None:
        engine.setProperty("volume", _volume)
    return engine


# ── API synchrone (exécution dans un thread) ────────────────────────

def _speak_sync(text: str) -> None:
    with _lock:
        engine = _new_engine()
        engine.say(text)
        engine.runAndWait()
        engine.stop()


def _get_voices_sync() -> list[dict[str, Any]]:
    engine = _new_engine()
    voices = [
        {"id": v.id, "name": v.name, "languages": v.languages, "gender": v.gender}
        for v in engine.getProperty("voices")
    ]
    engine.stop()
    return voices


def _set_voice_sync(voice_id: str) -> None:
    global _voice_id
    _voice_id = voice_id


def _set_rate_sync(rate: int) -> None:
    global _rate
    _rate = rate


def _set_volume_sync(volume: float) -> None:
    global _volume
    _volume = max(0.0, min(1.0, volume))


# ── API async (safe pour la boucle asyncio) ─────────────────────────

async def speak(text: str) -> None:
    """Synthétise et lit le texte à voix haute (non bloquant)."""
    log.info("TTS ▶ %s", text[:80])
    await asyncio.to_thread(_speak_sync, text)


async def get_voices() -> list[dict[str, Any]]:
    """Retourne la liste des voix disponibles sur le système."""
    return await asyncio.to_thread(_get_voices_sync)


async def set_voice(voice_id: str) -> None:
    """Change la voix active par son identifiant."""
    log.info("TTS voix → %s", voice_id)
    await asyncio.to_thread(_set_voice_sync, voice_id)


async def set_rate(rate: int) -> None:
    """Change la vitesse de parole (mots/minute, défaut ~200)."""
    log.info("TTS débit → %d wpm", rate)
    await asyncio.to_thread(_set_rate_sync, rate)


async def set_volume(volume: float) -> None:
    """Change le volume (0.0 à 1.0)."""
    log.info("TTS volume → %.1f", volume)
    await asyncio.to_thread(_set_volume_sync, volume)
