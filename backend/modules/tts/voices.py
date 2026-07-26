"""
Catalogue des voix françaises Piper et téléchargement à la demande.

Les modèles (`.onnx` + `.onnx.json`) sont stockés dans `backend/data/tts/voices/`
et ne sont pas versionnés : chaque installation les télécharge une seule fois
depuis Hugging Face (rhasspy/piper-voices), puis tout tourne hors ligne.

Gestion en ligne de commande : voir `modules.tts.cli`.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from core.logger import get_logger

log = get_logger(__name__)

# Dossier des modèles : backend/data/tts/voices
VOICES_DIR = Path(__file__).parent.parent.parent / "data" / "tts" / "voices"

# Voix utilisée tant que rien n'est configuré.
DEFAULT_VOICE = "fr_FR-siwis-medium"

# Catalogue des voix françaises disponibles chez rhasspy/piper-voices.
# `speakers` : mapping id → libellé pour les modèles multi-locuteurs.
CATALOG: list[dict[str, Any]] = [
    {
        "id": "fr_FR-siwis-medium",
        "label": "Siwis — femme, naturelle",
        "gender": "female",
        "quality": "medium",
        "size_mb": 61,
        "speakers": {},
    },
    {
        "id": "fr_FR-tom-medium",
        "label": "Tom — homme, posée",
        "gender": "male",
        "quality": "medium",
        "size_mb": 61,
        "speakers": {},
    },
    {
        "id": "fr_FR-upmc-medium",
        "label": "UPMC — Jessica (femme) / Pierre (homme)",
        "gender": "mixed",
        "quality": "medium",
        "size_mb": 74,
        "speakers": {0: "Jessica (femme)", 1: "Pierre (homme)"},
    },
    {
        "id": "fr_FR-mls-medium",
        "label": "MLS — 125 locuteurs (qualité variable)",
        "gender": "mixed",
        "quality": "medium",
        "size_mb": 76,
        "speakers": {},
    },
    {
        "id": "fr_FR-gilles-low",
        "label": "Gilles — homme, légère (basse qualité)",
        "gender": "male",
        "quality": "low",
        "size_mb": 28,
        "speakers": {},
    },
    {
        "id": "fr_FR-siwis-low",
        "label": "Siwis — femme, légère (basse qualité)",
        "gender": "female",
        "quality": "low",
        "size_mb": 28,
        "speakers": {},
    },
    {
        "id": "fr_FR-mls_1840-low",
        "label": "MLS 1840 — homme, légère (basse qualité)",
        "gender": "male",
        "quality": "low",
        "size_mb": 28,
        "speakers": {},
    },
]

_CATALOG_BY_ID = {v["id"]: v for v in CATALOG}

# Un seul téléchargement à la fois (les appels viennent de threads distincts).
_download_lock = threading.Lock()


def model_path(voice_id: str) -> Path:
    """Chemin attendu du modèle ONNX pour une voix donnée."""
    return VOICES_DIR / f"{voice_id}.onnx"


def is_installed(voice_id: str) -> bool:
    """True si le modèle et sa config sont présents sur le disque."""
    onnx = model_path(voice_id)
    return onnx.exists() and onnx.with_suffix(".onnx.json").exists()


def installed_voices() -> list[str]:
    """Liste des voix déjà téléchargées (catalogue ou non)."""
    if not VOICES_DIR.exists():
        return []
    return sorted(p.stem for p in VOICES_DIR.glob("*.onnx") if is_installed(p.stem))


def catalog() -> list[dict[str, Any]]:
    """Catalogue enrichi de l'état d'installation de chaque voix."""
    entries = [{**v, "installed": is_installed(v["id"])} for v in CATALOG]

    # Voix présentes sur le disque mais absentes du catalogue (ajout manuel).
    known = set(_CATALOG_BY_ID)
    for voice_id in installed_voices():
        if voice_id not in known:
            entries.append({
                "id": voice_id,
                "label": voice_id,
                "gender": "unknown",
                "quality": "unknown",
                "size_mb": 0,
                "speakers": {},
                "installed": True,
            })
    return entries


def speakers(voice_id: str) -> dict[int, str]:
    """Locuteurs disponibles pour une voix multi-locuteurs."""
    entry = _CATALOG_BY_ID.get(voice_id)
    return dict(entry["speakers"]) if entry else {}


def ensure(voice_id: str) -> Path:
    """
    Garantit la présence du modèle en local, le télécharge sinon.

    Retourne le chemin du `.onnx`. Lève une exception si le téléchargement
    échoue (pas de réseau, voix inconnue…).
    """
    path = model_path(voice_id)
    if is_installed(voice_id):
        return path

    with _download_lock:
        # Une autre tâche a pu télécharger pendant l'attente du verrou.
        if is_installed(voice_id):
            return path

        from piper.download_voices import download_voice

        VOICES_DIR.mkdir(parents=True, exist_ok=True)
        log.info("Téléchargement de la voix %s…", voice_id)
        download_voice(voice_id, VOICES_DIR)
        log.info("Voix %s installée dans %s", voice_id, VOICES_DIR)

    return path


# Phrase de démonstration, utilisée pour les aperçus et les échantillons.
SAMPLE_TEXT = (
    "Bonjour, voici la météo du jour à Ramonville-Saint-Agne. "
    "Ciel dégagé, températures annoncées entre 12 et 24 degrés. "
    "Passez une bonne journée !"
)
