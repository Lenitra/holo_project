"""
Handlers WebSocket pour le module Scheduler.

Messages gérés :
  - routine.list     → {}
  - routine.add      → { name, action, time, days, config? }
  - routine.update   → { id, ...fields }
  - routine.delete   → { id }
  - routine.actions  → {}   (liste les actions disponibles)
  - alarm.stop       → {}   (arrête le réveil en cours)
"""

import asyncio

from core.logger import get_logger
from core.ws_server import WebSocketServer
from modules.scheduler.store import RoutineStore
from modules.scheduler.runner import run_loop, register_action, _actions
from modules.scheduler.actions import action_weather_tts, action_alarm, stop_alarm

log = get_logger(__name__)


def register(server: WebSocketServer) -> None:
    """Enregistre les handlers scheduler et démarre la boucle."""
    store = RoutineStore()

    # ── Actions ──────────────────────────────────────────────────────

    register_action("weather.tts", lambda config: action_weather_tts(server, config))
    register_action("alarm", lambda config: action_alarm(server, config))

    # ── Handlers WebSocket ───────────────────────────────────────────

    @server.handle("routine.list")
    async def handle_list(client_id: str, payload: dict) -> dict:
        return {"type": "routine.list", "payload": {"routines": store.list()}}

    @server.handle("routine.add")
    async def handle_add(client_id: str, payload: dict) -> dict:
        name = payload.get("name", "").strip()
        action = payload.get("action", "")
        time = payload.get("time", "")
        days = payload.get("days", [])
        config = payload.get("config", {})

        if not name or not action or not time or not days:
            return {"type": "routine.error", "payload": {"message": "Champs requis : name, action, time, days"}}
        if action not in _actions:
            return {"type": "routine.error", "payload": {"message": f"Action inconnue : {action}"}}

        routine = store.add(name, action, time, days, config=config)
        return {"type": "routine.added", "payload": routine}

    @server.handle("routine.update")
    async def handle_update(client_id: str, payload: dict) -> dict:
        rid = payload.get("id", "")
        if not rid:
            return {"type": "routine.error", "payload": {"message": "Champ 'id' requis"}}

        fields = {k: v for k, v in payload.items() if k != "id"}
        routine = store.update(rid, **fields)
        if routine is None:
            return {"type": "routine.error", "payload": {"message": "Routine introuvable"}}
        return {"type": "routine.updated", "payload": routine}

    @server.handle("routine.delete")
    async def handle_delete(client_id: str, payload: dict) -> dict:
        rid = payload.get("id", "")
        if store.delete(rid):
            return {"type": "routine.deleted", "payload": {"id": rid}}
        return {"type": "routine.error", "payload": {"message": "Routine introuvable"}}

    @server.handle("routine.actions")
    async def handle_actions(client_id: str, payload: dict) -> dict:
        return {"type": "routine.actions", "payload": {"actions": list(_actions.keys())}}

    @server.handle("alarm.stop")
    async def handle_alarm_stop(client_id: str, payload: dict) -> dict:
        if stop_alarm():
            log.info("alarm.stop reçu de %s", client_id)
            return {"type": "alarm.stopped", "payload": {}}
        return {"type": "alarm.error", "payload": {"message": "Aucun réveil en cours"}}

    # ── Démarrer la boucle en arrière-plan ───────────────────────────
    asyncio.get_event_loop().create_task(run_loop(store))

    log.info("Module Scheduler enregistré (%d routines, %d actions)", len(store.list()), len(_actions))
