"""
Handlers WebSocket pour le module TTS.

Messages gérés :
  - tts.speak      → { "text": "Bonjour" }
  - tts.voices     → {}                        (liste les voix)
  - tts.set_voice  → { "voice_id": "..." }
  - tts.set_rate   → { "rate": 150 }
  - tts.set_volume → { "volume": 0.8 }
"""

from core.logger import get_logger
from core.ws_server import WebSocketServer
from modules.tts.engine import speak, get_voices, set_voice, set_rate, set_volume

log = get_logger(__name__)


def register(server: WebSocketServer) -> None:
    """Enregistre tous les handlers TTS sur le serveur WebSocket."""

    @server.handle("tts.speak")
    async def handle_speak(client_id: str, payload: dict) -> dict:
        text = payload.get("text", "")
        if not text:
            return {"type": "tts.error", "payload": {"message": "Champ 'text' requis"}}
        await speak(text)
        return {"type": "tts.done", "payload": {"text": text}}

    @server.handle("tts.voices")
    async def handle_voices(client_id: str, payload: dict) -> dict:
        voices = await get_voices()
        return {"type": "tts.voices", "payload": {"voices": voices}}

    @server.handle("tts.set_voice")
    async def handle_set_voice(client_id: str, payload: dict) -> dict:
        voice_id = payload.get("voice_id", "")
        if not voice_id:
            return {"type": "tts.error", "payload": {"message": "Champ 'voice_id' requis"}}
        await set_voice(voice_id)
        return {"type": "tts.ack", "payload": {"setting": "voice", "value": voice_id}}

    @server.handle("tts.set_rate")
    async def handle_set_rate(client_id: str, payload: dict) -> dict:
        rate = payload.get("rate")
        if rate is None:
            return {"type": "tts.error", "payload": {"message": "Champ 'rate' requis"}}
        await set_rate(int(rate))
        return {"type": "tts.ack", "payload": {"setting": "rate", "value": rate}}

    @server.handle("tts.set_volume")
    async def handle_set_volume(client_id: str, payload: dict) -> dict:
        volume = payload.get("volume")
        if volume is None:
            return {"type": "tts.error", "payload": {"message": "Champ 'volume' requis"}}
        await set_volume(float(volume))
        return {"type": "tts.ack", "payload": {"setting": "volume", "value": volume}}

    log.info("Module TTS enregistré (5 handlers)")
