"""
Handlers WebSocket pour le module Workout.

Messages gérés :
  - workout.list              → {}
  - workout.add               → { name, description, category }
  - workout.update            → { id, ...fields }
  - workout.delete            → { id }
  - workout.sessions          → { workout_id }
  - workout.session.add       → { workout_id, value, notes? }
  - workout.session.delete    → { id }
"""

from core.logger import get_logger
from core.ws_server import WebSocketServer
from modules.workout.store import WorkoutStore

log = get_logger(__name__)


def register(server: WebSocketServer) -> None:
    store = WorkoutStore()

    @server.handle("workout.list")
    async def handle_list(client_id: str, payload: dict) -> dict:
        return {"type": "workout.list", "payload": {"workouts": store.list_workouts()}}

    @server.handle("workout.add")
    async def handle_add(client_id: str, payload: dict) -> dict:
        name = payload.get("name", "").strip()
        description = payload.get("description", "").strip()
        category = payload.get("category", "")

        if not name:
            return {"type": "workout.error", "payload": {"message": "Nom requis"}}
        if category not in WorkoutStore.VALID_CATEGORIES:
            return {"type": "workout.error", "payload": {"message": f"Catégorie invalide : {category}"}}

        workout = store.add_workout(name, description, category)
        return {"type": "workout.added", "payload": workout}

    @server.handle("workout.update")
    async def handle_update(client_id: str, payload: dict) -> dict:
        wid = payload.get("id", "")
        if not wid:
            return {"type": "workout.error", "payload": {"message": "Champ 'id' requis"}}

        fields = {k: v for k, v in payload.items() if k != "id"}
        if "category" in fields and fields["category"] not in WorkoutStore.VALID_CATEGORIES:
            return {"type": "workout.error", "payload": {"message": f"Catégorie invalide"}}

        workout = store.update_workout(wid, **fields)
        if workout is None:
            return {"type": "workout.error", "payload": {"message": "Workout introuvable"}}
        return {"type": "workout.updated", "payload": workout}

    @server.handle("workout.delete")
    async def handle_delete(client_id: str, payload: dict) -> dict:
        wid = payload.get("id", "")
        if store.delete_workout(wid):
            return {"type": "workout.deleted", "payload": {"id": wid}}
        return {"type": "workout.error", "payload": {"message": "Workout introuvable"}}

    @server.handle("workout.sessions")
    async def handle_sessions(client_id: str, payload: dict) -> dict:
        workout_id = payload.get("workout_id", "")
        return {
            "type": "workout.sessions",
            "payload": {"workout_id": workout_id, "sessions": store.list_sessions(workout_id)},
        }

    @server.handle("workout.session.add")
    async def handle_session_add(client_id: str, payload: dict) -> dict:
        workout_id = payload.get("workout_id", "")
        value = payload.get("value")
        notes = payload.get("notes", "")

        if not workout_id or not store.get_workout(workout_id):
            return {"type": "workout.error", "payload": {"message": "Workout introuvable"}}
        if value is None or not isinstance(value, (int, float)) or value < 0:
            return {"type": "workout.error", "payload": {"message": "Valeur invalide"}}

        session = store.add_session(workout_id, float(value), notes)
        return {"type": "workout.session.added", "payload": session}

    @server.handle("workout.session.delete")
    async def handle_session_delete(client_id: str, payload: dict) -> dict:
        sid = payload.get("id", "")
        if store.delete_session(sid):
            return {"type": "workout.session.deleted", "payload": {"id": sid}}
        return {"type": "workout.error", "payload": {"message": "Session introuvable"}}

    log.info("Module Workout enregistré (%d templates)", len(store.list_workouts()))
