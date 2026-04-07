from __future__ import annotations

"""
Boucle d'exécution des routines.

Se réveille au début de chaque minute et déclenche les routines
dont l'heure et le jour correspondent.
"""

import asyncio
from datetime import datetime, timedelta
from typing import Any

from core.logger import get_logger

log = get_logger(__name__)

# Actions disponibles — chaque clé mappe vers une coroutine qui reçoit la config
_actions: dict[str, Any] = {}
# Références aux tasks en cours pour éviter le garbage collection
_running_tasks: set[asyncio.Task] = set()


def register_action(name: str, coro_fn) -> None:
    """Enregistre une action exécutable par le scheduler."""
    _actions[name] = coro_fn
    log.info("Action scheduler enregistrée : %s", name)


async def run_loop(store) -> None:
    """Boucle infinie : se réveille au début de chaque nouvelle minute."""
    last_fired_minute: str = ""  # "YYYY-MM-DD HH:MM" de la dernière évaluation

    log.info("Boucle scheduler démarrée")

    while True:
        try:
            # ── Attendre le début de la prochaine minute ─────────────
            await _sleep_until_next_minute()

            now = datetime.now()
            minute_key = now.strftime("%Y-%m-%d %H:%M")

            # Garde-fou : ne pas évaluer deux fois la même minute
            if minute_key == last_fired_minute:
                continue
            last_fired_minute = minute_key

            current_time = now.strftime("%H:%M")
            current_day = now.isoweekday()

            # ── Évaluer les routines ─────────────────────────────────
            for routine in store.list():
                if not routine["enabled"]:
                    continue
                if routine["time"] != current_time:
                    continue
                if current_day not in routine["days"]:
                    continue

                action_fn = _actions.get(routine["action"])
                if action_fn is None:
                    log.warning("Action inconnue : %s (routine %s)", routine["action"], routine["name"])
                    continue

                config = routine.get("config", {})
                log.info("Routine déclenchée : %s → %s", routine["name"], routine["action"])
                task = asyncio.create_task(_safe_run(routine["name"], action_fn, config))
                _running_tasks.add(task)
                task.add_done_callback(_running_tasks.discard)

        except asyncio.CancelledError:
            log.info("Boucle scheduler annulée")
            raise
        except Exception as e:
            log.error("Erreur dans la boucle scheduler : %s", e, exc_info=True)
            # Attendre un peu avant de réessayer pour ne pas boucler sur une erreur
            await asyncio.sleep(5)


async def _sleep_until_next_minute() -> None:
    """Dort jusqu'à ~1 s après le début de la prochaine minute."""
    now = datetime.now()
    # Prochaine minute pile + 1 s de marge
    next_minute = (now + timedelta(minutes=1)).replace(second=1, microsecond=0)
    delta = (next_minute - now).total_seconds()
    # Clamp entre 1 et 61 s pour la sécurité
    await asyncio.sleep(max(1.0, min(61.0, delta)))


async def _safe_run(name: str, coro_fn, config: dict) -> None:
    """Exécute une action avec gestion d'erreur."""
    try:
        await coro_fn(config)
    except asyncio.CancelledError:
        log.warning("Action '%s' annulée", name)
    except Exception as e:
        log.error("Erreur routine '%s' : %s", name, e, exc_info=True)
