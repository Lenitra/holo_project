"""
Moteur TTS du projet : synthèse vocale française, 100 % locale.

Deux moteurs, choisis automatiquement :

  1. **Piper** (par défaut) — synthèse neuronale ONNX, voix françaises
     naturelles, tourne sur CPU y compris sur Raspberry Pi. Le modèle est
     téléchargé une fois puis tout fonctionne hors ligne.
  2. **Système** (repli) — pyttsx3 → SAPI5 (Windows) / espeak-ng (Linux).
     Robotique, mais toujours disponible. Utilisé si Piper est absent ou si
     le modèle n'a pas pu être téléchargé. Contrairement à avant, la voix
     française est sélectionnée explicitement (sinon espeak lit le français
     avec une phonétique anglaise).

Les réglages sont persistés dans `backend/data/settings.json`, clé `tts`.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import tempfile
import threading
from pathlib import Path
from typing import Any

from core.logger import get_logger
from modules.tts import piper_engine, player, voices

log = get_logger(__name__)

SETTINGS_PATH = Path(__file__).parent.parent.parent / "data" / "settings.json"

# Débit de référence : `rate` en mots/minute, 200 = vitesse naturelle du modèle.
NOMINAL_RATE = 200

DEFAULTS: dict[str, Any] = {
    "engine": "auto",           # "auto" | "piper" | "system"
    "voice": voices.DEFAULT_VOICE,
    "speaker": 0,
    "rate": NOMINAL_RATE,
    "volume": 1.0,
}

# La synthèse et la lecture sont sérialisées : deux phrases ne se superposent pas.
_speak_lock = threading.Lock()
_settings_lock = threading.Lock()
_settings: dict[str, Any] | None = None


# ── Réglages persistants ────────────────────────────────────────────

def _read_settings_file() -> dict[str, Any]:
    if SETTINGS_PATH.exists():
        try:
            return json.loads(SETTINGS_PATH.read_text("utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            log.warning("settings.json illisible (%s), valeurs par défaut", e)
    return {}


def _load() -> dict[str, Any]:
    """Réglages TTS courants (lecture disque au premier appel)."""
    global _settings
    if _settings is None:
        _settings = {**DEFAULTS, **_read_settings_file().get("tts", {})}
    return _settings


def _save(**changes: Any) -> dict[str, Any]:
    """Applique et persiste des réglages dans settings.json (écriture atomique)."""
    with _settings_lock:
        current = {**_load(), **changes}
        _settings.update(current)  # type: ignore[union-attr]

        settings = _read_settings_file()
        settings["tts"] = current
        SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = SETTINGS_PATH.with_name(SETTINGS_PATH.name + ".tmp")
        tmp.write_text(json.dumps(settings, ensure_ascii=False, indent=2), "utf-8")
        os.replace(tmp, SETTINGS_PATH)

    return current


# ── Préparation du texte ────────────────────────────────────────────

_SUBSTITUTIONS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"°\s*C\b"), " degrés"),
    (re.compile(r"°"), " degrés"),
    (re.compile(r"\bkm/h\b"), " kilomètres heure"),
    (re.compile(r"\bkm\b"), " kilomètres"),
    (re.compile(r"%"), " pour cent"),
    (re.compile(r"\s+"), " "),
]


def normalize(text: str) -> str:
    """Remplace les symboles que la synthèse lit mal (°, %, km/h…)."""
    for pattern, replacement in _SUBSTITUTIONS:
        text = pattern.sub(replacement, text)
    return text.strip()


# ── Choix du moteur ─────────────────────────────────────────────────

def _use_piper() -> bool:
    """True si la synthèse doit passer par Piper."""
    engine = _load()["engine"]
    if engine == "system":
        return False
    if engine == "piper":
        return True
    return piper_engine.is_available()


def _length_scale() -> float:
    """Convertit le débit (mots/minute) en facteur de durée Piper."""
    rate = _load().get("rate") or NOMINAL_RATE
    return max(0.5, min(2.0, NOMINAL_RATE / float(rate)))


# ── Synthèse Piper ──────────────────────────────────────────────────

def _speaker_id(voice_id: str, speaker: Any) -> int | None:
    """Identifiant de locuteur, uniquement pour les modèles multi-locuteurs."""
    if not voices.speakers(voice_id):
        return None
    try:
        return int(speaker)
    except (TypeError, ValueError):
        return 0


def _play_piper(text: str, voice_id: str, speaker: Any) -> bool:
    """Synthétise avec Piper puis joue le WAV. False si le moteur a échoué."""
    settings = _load()

    fd, tmp_name = tempfile.mkstemp(prefix="holo-tts-", suffix=".wav")
    os.close(fd)
    tmp_path = Path(tmp_name)

    try:
        piper_engine.synthesize_to_file(
            text,
            tmp_path,
            voice_id,
            speaker_id=_speaker_id(voice_id, speaker),
            length_scale=_length_scale(),
            volume=float(settings.get("volume", 1.0)),
        )
        return player.play_wav(tmp_path)
    except Exception as e:
        log.error("Synthèse Piper impossible (%s) : %s", voice_id, e)
        return False
    finally:
        tmp_path.unlink(missing_ok=True)


def _speak_piper(text: str) -> bool:
    """Synthèse Piper avec la voix configurée."""
    settings = _load()
    return _play_piper(text, settings["voice"], settings.get("speaker"))


# ── Repli : moteur système (pyttsx3) ────────────────────────────────

_system_voice_id: str | None = None
_system_voice_resolved = False


def _find_french_system_voice(engine: Any) -> str | None:
    """Cherche une voix française parmi les voix du système."""
    for voice in engine.getProperty("voices"):
        languages = []
        for lang in getattr(voice, "languages", []) or []:
            languages.append(lang.decode(errors="ignore") if isinstance(lang, bytes) else str(lang))
        haystack = " ".join([voice.id or "", voice.name or "", *languages]).lower()
        if "fr_fr" in haystack or "fr-fr" in haystack or "french" in haystack or "français" in haystack:
            return voice.id
    return None


def _speak_system(text: str) -> bool:
    """
    Synthèse par le moteur du système.

    pyttsx3 a un bug connu : `runAndWait()` ne fonctionne qu'une fois par
    instance — on recrée donc le moteur à chaque appel.
    """
    global _system_voice_id, _system_voice_resolved

    try:
        import pyttsx3
    except ImportError:
        log.error("Aucun moteur TTS disponible (ni piper-tts ni pyttsx3)")
        return False

    settings = _load()

    try:
        engine = pyttsx3.init()

        if not _system_voice_resolved:
            _system_voice_id = _find_french_system_voice(engine)
            _system_voice_resolved = True
            if _system_voice_id:
                log.info("Voix système française : %s", _system_voice_id)
            else:
                log.warning("Aucune voix française trouvée — la synthèse sonnera anglaise. "
                            "Installer par ex. `espeak-ng-data` ou une voix SAPI française.")

        if _system_voice_id:
            engine.setProperty("voice", _system_voice_id)
        engine.setProperty("rate", int(settings.get("rate", NOMINAL_RATE)))
        engine.setProperty("volume", float(settings.get("volume", 1.0)))

        engine.say(text)
        engine.runAndWait()
        engine.stop()
        return True
    except Exception as e:
        log.error("Synthèse système impossible : %s", e)
        return False


# ── Synthèse (thread) ───────────────────────────────────────────────

def _speak_sync(text: str) -> bool:
    with _speak_lock:
        if _use_piper() and _speak_piper(text):
            return True
        return _speak_system(text)


# ── API async (safe pour la boucle asyncio) ─────────────────────────

async def speak(text: str) -> None:
    """Synthétise et lit le texte à voix haute. Attend la fin de la lecture."""
    text = normalize(text)
    if not text:
        return
    log.info("TTS ▶ %s", text[:80])
    await asyncio.to_thread(_speak_sync, text)


async def preview(voice_id: str, speaker: int | None = None, text: str | None = None) -> None:
    """
    Fait entendre une voix sans changer la configuration.

    Sert à comparer les voix depuis la télécommande avant d'en choisir une.
    Le modèle est téléchargé à la demande.
    """
    sample = normalize(text or voices.SAMPLE_TEXT)
    log.info("TTS aperçu ▶ %s", voice_id)
    await asyncio.to_thread(voices.ensure, voice_id)

    def _run() -> bool:
        with _speak_lock:
            return _play_piper(sample, voice_id, speaker)

    await asyncio.to_thread(_run)


async def synthesize_to_file(text: str, out_path: Path) -> Path:
    """Écrit la synthèse dans un WAV sans la jouer (échantillons, debug)."""
    settings = _load()
    voice_id = settings["voice"]
    return await asyncio.to_thread(
        piper_engine.synthesize_to_file,
        normalize(text),
        out_path,
        voice_id,
        _speaker_id(voice_id, settings.get("speaker")),
        _length_scale(),
        float(settings.get("volume", 1.0)),
    )


async def get_voices() -> list[dict[str, Any]]:
    """Catalogue des voix françaises Piper, avec leur état d'installation."""
    return await asyncio.to_thread(voices.catalog)


async def get_settings() -> dict[str, Any]:
    """Réglages TTS courants + moteur réellement utilisé."""
    settings = dict(_load())
    settings["active_engine"] = "piper" if _use_piper() else "system"
    settings["player"] = player.describe()
    settings["installed"] = voices.installed_voices()
    return settings


async def set_voice(voice_id: str, speaker: int | None = None) -> dict[str, Any]:
    """
    Change la voix active (téléchargée à la demande si absente).

    Le téléchargement d'un modèle prend quelques secondes la première fois.
    """
    log.info("TTS voix → %s", voice_id)
    await asyncio.to_thread(voices.ensure, voice_id)

    changes: dict[str, Any] = {"voice": voice_id}
    if speaker is not None:
        changes["speaker"] = int(speaker)
    settings = _save(**changes)

    piper_engine.unload()
    await asyncio.to_thread(piper_engine.preload, voice_id)
    return settings


async def set_speaker(speaker: int) -> dict[str, Any]:
    """Change le locuteur pour les voix multi-locuteurs (upmc, mls)."""
    log.info("TTS locuteur → %d", speaker)
    return _save(speaker=int(speaker))


async def set_rate(rate: int) -> dict[str, Any]:
    """Change la vitesse de parole (mots/minute, 200 = naturel)."""
    log.info("TTS débit → %d wpm", rate)
    return _save(rate=max(80, min(400, int(rate))))


async def set_volume(volume: float) -> dict[str, Any]:
    """Change le volume (0.0 à 1.0)."""
    log.info("TTS volume → %.1f", volume)
    return _save(volume=max(0.0, min(1.0, float(volume))))


async def set_engine(engine: str) -> dict[str, Any]:
    """Force le moteur : "auto", "piper" ou "system"."""
    if engine not in ("auto", "piper", "system"):
        raise ValueError("engine doit valoir 'auto', 'piper' ou 'system'")
    log.info("TTS moteur → %s", engine)
    return _save(engine=engine)


async def warmup() -> None:
    """
    Prépare le moteur au démarrage du backend : téléchargement éventuel du
    modèle et chargement en mémoire, pour que la première phrase soit immédiate.
    """
    if not _use_piper():
        log.info("TTS : moteur système (pyttsx3) — Piper indisponible")
        return

    voice_id = _load()["voice"]
    log.info("TTS : préparation de la voix %s (lecteur : %s)", voice_id, player.describe())
    await asyncio.to_thread(piper_engine.preload, voice_id)
