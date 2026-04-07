"""
Actions exécutables par le scheduler.

Chaque action est une coroutine qui reçoit (server, config).
"""

import asyncio

from core.logger import get_logger
from core.ws_server import WebSocketServer, build

log = get_logger(__name__)

# ── Alarm (réveil) ───────────────────────────────────────────────────

_alarm_stop_event = asyncio.Event()
_alarm_active = False


async def action_alarm(server: WebSocketServer, config: dict) -> None:
    """Joue un MP3 sur l'hologramme, attend l'arrêt, puis météo différée."""
    global _alarm_active

    music = config.get("music", "")

    try:
        weather_delay = int(config.get("weather_delay", -1))
    except (TypeError, ValueError):
        weather_delay = -1

    log.info("Alarm config : music=%s, weather_delay=%d", music, weather_delay)

    if not music:
        log.error("Alarm : pas de fichier musique configuré")
        return

    _alarm_stop_event.clear()
    _alarm_active = True

    await server.send_to_role(
        "hologram",
        build("display.update", {
            "screen": "alarm",
            "data": {"text": "Réveil", "music": music},
        }),
    )
    log.info("Réveil en cours — musique : %s", music)

    await _alarm_stop_event.wait()
    _alarm_active = False

    await server.send_to_role("hologram", build("display.update", {"screen": "idle"}))
    log.info("Réveil arrêté")

    if weather_delay < 0:
        log.info("Pas de météo après réveil")
        return

    if weather_delay > 0:
        log.info("Météo dans %d min — attente en cours…", weather_delay)
        await asyncio.sleep(weather_delay * 60)
        log.info("Attente terminée, lancement météo")
    else:
        log.info("Météo immédiate après réveil")

    from modules.weather.handler import _run_weather_tts
    await _run_weather_tts(server)


def stop_alarm() -> bool:
    """Signale l'arrêt du réveil. Retourne True si un réveil était en cours."""
    if _alarm_active:
        _alarm_stop_event.set()
        return True
    return False


# ── Weather TTS ──────────────────────────────────────────────────────

async def action_weather_tts(server: WebSocketServer, config: dict) -> None:
    """Récupère la météo et la lit en TTS sur l'hologramme."""
    from modules.weather.handler import _run_weather_tts
    await _run_weather_tts(server)
