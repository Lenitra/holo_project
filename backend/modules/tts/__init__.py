"""
Module TTS (Text-to-Speech) 100 % local et hors ligne.

Utilise pyttsx3 qui s'appuie sur les moteurs natifs du système :
  - Windows : SAPI5
  - Linux   : espeak / espeak-ng
  - macOS   : NSSpeechSynthesizer

Expose un handler WebSocket "tts.speak" et des fonctions directes.
"""

from modules.tts.engine import speak, get_voices, set_voice, set_rate, set_volume
from modules.tts.handler import register

__all__ = [
    "speak",
    "get_voices",
    "set_voice",
    "set_rate",
    "set_volume",
    "register",
]
