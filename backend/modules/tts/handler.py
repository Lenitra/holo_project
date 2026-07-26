"""
Handlers WebSocket pour le module TTS.

Messages gérés :
  - tts.speak       → { "text": "Bonjour" }
  - tts.voices      → {}                                (catalogue des voix FR)
  - tts.settings    → {}                                (réglages courants)
  - tts.preview     → { "voice_id": "...", "speaker": 0, "text": "..." }
  - tts.set_voice   → { "voice_id": "...", "speaker": 0 }
  - tts.set_rate    → { "rate": 150 }
  - tts.set_volume  → { "volume": 0.8 }
  - tts.set_engine  → { "engine": "auto" | "piper" | "system" }
"""

from core.logger import get_logger
from core.ws_server import WebSocketServer
from modules.tts import engine

log = get_logger(__name__)


def register(server: WebSocketServer) -> None:
    """Enregistre tous les handlers TTS sur le serveur WebSocket."""

    @server.handle("tts.speak")
    async def handle_speak(client_id: str, payload: dict) -> dict:
        text = payload.get("text", "")
        if not text:
            return {"type": "tts.error", "payload": {"message": "Champ 'text' requis"}}
        await engine.speak(text)
        return {"type": "tts.done", "payload": {"text": text}}

    @server.handle("tts.voices")
    async def handle_voices(client_id: str, payload: dict) -> dict:
        return {"type": "tts.voices", "payload": {"voices": await engine.get_voices()}}

    @server.handle("tts.settings")
    async def handle_settings(client_id: str, payload: dict) -> dict:
        return {"type": "tts.settings", "payload": await engine.get_settings()}

    @server.handle("tts.preview")
    async def handle_preview(client_id: str, payload: dict) -> dict:
        voice_id = payload.get("voice_id", "")
        if not voice_id:
            return {"type": "tts.error", "payload": {"message": "Champ 'voice_id' requis"}}
        try:
            await engine.preview(voice_id, payload.get("speaker"), payload.get("text"))
        except Exception as e:
            log.error("Aperçu %s impossible : %s", voice_id, e)
            return {"type": "tts.error", "payload": {"message": str(e)}}
        return {"type": "tts.done", "payload": {"preview": voice_id}}

    @server.handle("tts.set_voice")
    async def handle_set_voice(client_id: str, payload: dict) -> dict:
        voice_id = payload.get("voice_id", "")
        if not voice_id:
            return {"type": "tts.error", "payload": {"message": "Champ 'voice_id' requis"}}
        try:
            settings = await engine.set_voice(voice_id, payload.get("speaker"))
        except Exception as e:
            log.error("Changement de voix impossible (%s) : %s", voice_id, e)
            return {"type": "tts.error", "payload": {"message": str(e)}}
        return {"type": "tts.settings", "payload": settings}

    @server.handle("tts.set_rate")
    async def handle_set_rate(client_id: str, payload: dict) -> dict:
        rate = payload.get("rate")
        if rate is None:
            return {"type": "tts.error", "payload": {"message": "Champ 'rate' requis"}}
        return {"type": "tts.settings", "payload": await engine.set_rate(int(rate))}

    @server.handle("tts.set_volume")
    async def handle_set_volume(client_id: str, payload: dict) -> dict:
        volume = payload.get("volume")
        if volume is None:
            return {"type": "tts.error", "payload": {"message": "Champ 'volume' requis"}}
        return {"type": "tts.settings", "payload": await engine.set_volume(float(volume))}

    @server.handle("tts.set_engine")
    async def handle_set_engine(client_id: str, payload: dict) -> dict:
        try:
            settings = await engine.set_engine(payload.get("engine", "auto"))
        except ValueError as e:
            return {"type": "tts.error", "payload": {"message": str(e)}}
        return {"type": "tts.settings", "payload": settings}

    log.info("Module TTS enregistré (8 handlers)")
