import logging
import tempfile
from pathlib import Path

import pyttsx3

logger = logging.getLogger(__name__)

# Engine initialisé une seule fois (singleton)
_engine: pyttsx3.Engine | None = None
_rate: int = 150


def configure(rate: int = 150) -> None:
    """Configure les paramètres de la voix. Doit être appelé avant le premier text_to_speech."""
    global _rate, _engine
    _rate = rate
    _engine = None  # Reset pour forcer la réinitialisation


def _get_engine() -> pyttsx3.Engine:
    global _engine
    if _engine is None:
        _engine = pyttsx3.init()
        # Sélectionner une voix française si disponible
        for voice in _engine.getProperty("voices"):
            if "french" in voice.name.lower() or "fr" in voice.id.lower():
                _engine.setProperty("voice", voice.id)
                break
        _engine.setProperty("rate", _rate)
        logger.info("TTS configuré: rate=%d", _rate)
    return _engine


def text_to_speech(text: str) -> bytes:
    """Synthese vocale 100% locale via pyttsx3 (SAPI5 sur Windows)."""
    engine = _get_engine()

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    try:
        engine.save_to_file(text, str(tmp_path))
        engine.runAndWait()
        data = tmp_path.read_bytes()
        if not data:
            raise RuntimeError("pyttsx3 a produit un fichier vide")
        return data
    finally:
        tmp_path.unlink(missing_ok=True)
