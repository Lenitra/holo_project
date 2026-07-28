"""
Point d'entrée du backend.

Usage : python main.py
"""

import asyncio
import signal
import sys
from pathlib import Path

from dotenv import load_dotenv

# Charger le .env à la racine du projet
load_dotenv(Path(__file__).parent.parent / ".env")

from core.logger import get_logger, setup as setup_logging
from core.ws_server import server


async def main() -> None:
    """Lance le logging et le serveur WebSocket."""
    setup_logging()

    log = get_logger(__name__)
    log.info("=== Démarrage du backend ===")

    @server.handle("ping")
    async def handle_ping(client_id, payload):
        return {"type": "pong", "payload": {}}

    @server.handle("status")
    async def handle_status(client_id, payload):
        return {"type": "status", "payload": {"clients": server.get_clients()}}

    @server.handle("display.update")
    async def handle_display_update(client_id, payload):
        """Relaie une commande d'affichage vers tous les hologrammes."""
        from core.ws_server import build
        count = await server.send_to_role("hologram", build("display.update", payload))
        log.info(f"display.update → {count} hologramme(s) : {payload.get('screen', '?')}")
        return {"type": "display.ack", "payload": {"status": "ok", "count": count}}

    @server.handle("display.restart")
    async def handle_display_restart(client_id, payload):
        """Redémarre la vidéo sur tous les hologrammes."""
        from core.ws_server import build
        count = await server.send_to_role("hologram", build("display.restart"))
        log.info(f"display.restart → {count} hologramme(s)")
        return {"type": "display.ack", "payload": {"status": "ok", "count": count}}

    # ── Modules ──
    from modules.tts.handler import register as register_tts
    from modules.weather.handler import register as register_weather
    from modules.scheduler.handler import register as register_scheduler
    from modules.shopping.handler import register as register_shopping
    from modules.todo.handler import register as register_todo
    from modules.workout.handler import register as register_workout
    from modules.planes.handler import register as register_planes
    from modules.spotify.handler import register as register_spotify
    register_tts(server)
    register_weather(server)
    register_scheduler(server)
    register_shopping(server)
    register_todo(server)
    register_workout(server)
    register_planes(server)
    register_spotify(server)

    # Prépare la voix en tâche de fond (téléchargement éventuel du modèle
    # + chargement en mémoire) pour que la première phrase soit immédiate.
    from modules.tts.engine import warmup as warmup_tts
    asyncio.create_task(warmup_tts())

    await server.start()


if __name__ == "__main__":
    signal.signal(signal.SIGINT, lambda s, f: sys.exit(0))

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nBackend arrêté.")
