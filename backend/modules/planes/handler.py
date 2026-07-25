"""
Handlers WebSocket pour le module Avions (planes).

Messages gérés :
  - planes.get        → {} : avions autour du point d'observation,
                             avec flag `visible` selon le champ de vision
  - planes.config.get → {} : configuration actuelle
  - planes.config.set → { azimuth?, fov?, radius_km?, latitude?, longitude?, use_city? }
"""

import asyncio

from core.logger import get_logger
from core.ws_server import WebSocketServer
from modules.planes.tracker import get_config, get_visible_planes, set_config

log = get_logger(__name__)


def register(server: WebSocketServer) -> None:
    """Enregistre les handlers avions sur le serveur WebSocket."""

    @server.handle("planes.get")
    async def handle_get(client_id: str, payload: dict) -> dict:
        try:
            result = await asyncio.to_thread(get_visible_planes)
        except Exception as e:
            log.error("Erreur avions : %s", e)
            return {"type": "planes.error", "payload": {"message": str(e)}}
        return {"type": "planes.list", "payload": result}

    @server.handle("planes.config.get")
    async def handle_config_get(client_id: str, payload: dict) -> dict:
        return {"type": "planes.config", "payload": get_config()}

    @server.handle("planes.config.set")
    async def handle_config_set(client_id: str, payload: dict) -> dict:
        try:
            cfg = set_config(payload)
        except (TypeError, ValueError) as e:
            return {"type": "planes.error", "payload": {"message": f"Config invalide : {e}"}}
        return {"type": "planes.config", "payload": cfg}

    log.info("Module Planes enregistré (3 handlers)")
