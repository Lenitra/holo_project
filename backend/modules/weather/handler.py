"""
Handler WebSocket pour le module météo.

Messages gérés :
  - weather.tts → {} : récupère la météo, affiche le clip meteo
                        sur l'hologramme, lit en TTS, puis revient sur idle.
"""

import asyncio

from core.logger import get_logger
from core.ws_server import WebSocketServer, build
from modules.weather.forecast import get_forecast
from modules.tts.engine import speak

log = get_logger(__name__)


async def _run_weather_tts(server: WebSocketServer) -> str:
    """Exécute le scénario météo complet (hologramme + TTS). Retourne le texte lu."""
    forecast = await asyncio.to_thread(get_forecast)
    text = forecast["text"]
    overlay = forecast["overlay"]

    # 1. Basculer l'hologramme sur le clip météo + overlay
    await server.send_to_role(
        "hologram",
        build("display.update", {
            "screen": "meteo",
            "data": {"weather": overlay},
        }),
    )
    log.info("Hologramme → meteo")

    # 2. Lire le TTS (on attend la fin avant de revenir sur idle)
    await speak(text)

    # 3. Revenir sur le clip idle
    await server.send_to_role(
        "hologram",
        build("display.update", {"screen": "idle"}),
    )
    log.info("Hologramme → idle")

    return text


def register(server: WebSocketServer) -> None:
    """Enregistre les handlers météo sur le serveur WebSocket."""

    @server.handle("weather.tts")
    async def handle_weather_tts(client_id: str, payload: dict) -> dict:
        """Récupère la météo, pilote l'hologramme et lit en TTS."""
        try:
            text = await _run_weather_tts(server)
        except Exception as e:
            log.error("Erreur météo : %s", e)
            return {"type": "weather.error", "payload": {"message": str(e)}}

        return {"type": "weather.done", "payload": {"text": text}}

    log.info("Module Weather enregistré (1 handler)")
