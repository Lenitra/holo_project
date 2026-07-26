"""
Module TTS (Text-to-Speech) 100 % local et hors ligne, en français.

Moteur principal : **Piper** — synthèse neuronale ONNX (voix françaises
naturelles, CPU only, compatible Raspberry Pi). Le modèle est téléchargé une
fois dans `backend/data/tts/voices/`, ensuite plus aucun accès réseau.

Repli automatique : **pyttsx3** (SAPI5 sous Windows, espeak-ng sous Linux) si
Piper n'est pas installé ou si le modèle est indisponible — avec sélection
explicite d'une voix française.

Expose les handlers WebSocket `tts.*` et des fonctions directes.
"""

from modules.tts.engine import (
    get_settings,
    get_voices,
    preview,
    set_engine,
    set_rate,
    set_speaker,
    set_voice,
    set_volume,
    speak,
    synthesize_to_file,
    warmup,
)
from modules.tts.handler import register

__all__ = [
    "get_settings",
    "get_voices",
    "preview",
    "register",
    "set_engine",
    "set_rate",
    "set_speaker",
    "set_voice",
    "set_volume",
    "speak",
    "synthesize_to_file",
    "warmup",
]
