from __future__ import annotations

"""
Boucle d'exécution des routines.

Vérifie chaque minute si une routine doit se déclencher
(correspondance heure + jour de la semaine).
"""

import asyncio
from datetime import datetime

from core.logger import get_logger
from core.ws_server import WebSocketServer
from modules.scheduler.store import RoutineStore

log = get_logger(__name__)

# Actions disponibles — chaque clé mappe vers une coroutine sans argument
_actions: dict[str, any] = {}


def register_action(name: str, coro_fn) -> None:
    """Enregistre une action exécutable par le scheduler."""
    _actions[name] = coro_fn
    log.info("Action scheduler enregistrée : %s", name)


async def run_loop(store: RoutineStore) -> None:
    """Boucle infinie : vérifie les routines chaque 30 secondes."""
    last_fired: dict[str, str] = {}  # routine_id → "HH:MM" du dernier déclenchement

    while True:
        now = datetime.now()
        current_time = now.strftime("%H:%M")
        current_day = now.isoweekday()  # 1=lundi … 7=dimanche

        for routine in store.list():
            if not routine["enabled"]:
                continue
            if routine["time"] != current_time:
                continue
            if current_day not in routine["days"]:
                continue
            # Ne pas re-déclencher la même minute
            if last_fired.get(routine["id"]) == current_time:
                continue

            last_fired[routine["id"]] = current_time
            action_fn = _actions.get(routine["action"])
            if action_fn is None:
                log.warning("Action inconnue : %s (routine %s)", routine["action"], routine["name"])
                continue

            log.info("Routine déclenchée : %s → %s", routine["name"], routine["action"])
            asyncio.create_task(_safe_run(routine["name"], action_fn))

        await asyncio.sleep(30)


async def _safe_run(name: str, coro_fn) -> None:
    """Exécute une action avec gestion d'erreur."""
    try:
        await coro_fn()
    except Exception as e:
        log.error("Erreur routine '%s' : %s", name, e)
