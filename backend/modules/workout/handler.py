"""
Handlers WebSocket pour le module Workout.

Messages gérés :
  Exercices :
  - exercise.list              → {}
  - exercise.add               → { title, description }
  - exercise.update            → { id, ...fields }
  - exercise.delete            → { id }

  Séances :
  - workout.list              → {}
  - workout.add               → { name, description, exercises: [{ exercise_id, reps?, duration?, description? }] }
  - workout.update            → { id, ...fields }
  - workout.delete            → { id }

  Sessions (résultats) :
  - workout.sessions          → { workout_id }
  - workout.session.add       → { workout_id, result, notes? }
  - workout.session.delete    → { id }
"""

from core.logger import get_logger
from core.ws_server import WebSocketServer
from modules.workout.store import WorkoutStore

log = get_logger(__name__)


def register(server: WebSocketServer) -> None:
    store = WorkoutStore()

    # ── Exercices ────────────────────────────────────────────────────

    @server.handle("exercise.list")
    async def handle_exercise_list(client_id: str, payload: dict) -> dict:
        return {"type": "exercise.list", "payload": {"exercises": store.list_exercises()}}

    @server.handle("exercise.add")
    async def handle_exercise_add(client_id: str, payload: dict) -> dict:
        title = payload.get("title", "").strip()
        description = payload.get("description", "").strip()

        if not title:
            return {"type": "workout.error", "payload": {"message": "Titre requis"}}

        exercise = store.add_exercise(title, description)
        return {"type": "exercise.added", "payload": exercise}

    @server.handle("exercise.update")
    async def handle_exercise_update(client_id: str, payload: dict) -> dict:
        eid = payload.get("id", "")
        if not eid:
            return {"type": "workout.error", "payload": {"message": "Champ 'id' requis"}}

        fields = {k: v for k, v in payload.items() if k != "id"}
        exercise = store.update_exercise(eid, **fields)
        if exercise is None:
            return {"type": "workout.error", "payload": {"message": "Exercice introuvable"}}
        return {"type": "exercise.updated", "payload": exercise}

    @server.handle("exercise.delete")
    async def handle_exercise_delete(client_id: str, payload: dict) -> dict:
        eid = payload.get("id", "")
        if store.delete_exercise(eid):
            return {"type": "exercise.deleted", "payload": {"id": eid}}
        return {"type": "workout.error", "payload": {"message": "Exercice introuvable"}}

    # ── Séances (workouts) ───────────────────────────────────────────

    @server.handle("workout.list")
    async def handle_list(client_id: str, payload: dict) -> dict:
        return {"type": "workout.list", "payload": {"workouts": store.list_workouts()}}

    @server.handle("workout.add")
    async def handle_add(client_id: str, payload: dict) -> dict:
        name = payload.get("name", "").strip()
        description = payload.get("description", "").strip()
        exercises = payload.get("exercises", [])

        if not name:
            return {"type": "workout.error", "payload": {"message": "Nom requis"}}

        workout = store.add_workout(name, description, exercises)
        return {"type": "workout.added", "payload": workout}

    @server.handle("workout.update")
    async def handle_update(client_id: str, payload: dict) -> dict:
        wid = payload.get("id", "")
        if not wid:
            return {"type": "workout.error", "payload": {"message": "Champ 'id' requis"}}

        fields = {k: v for k, v in payload.items() if k != "id"}
        workout = store.update_workout(wid, **fields)
        if workout is None:
            return {"type": "workout.error", "payload": {"message": "Séance introuvable"}}
        return {"type": "workout.updated", "payload": workout}

    @server.handle("workout.delete")
    async def handle_delete(client_id: str, payload: dict) -> dict:
        wid = payload.get("id", "")
        if store.delete_workout(wid):
            return {"type": "workout.deleted", "payload": {"id": wid}}
        return {"type": "workout.error", "payload": {"message": "Séance introuvable"}}

    # ── Sessions ─────────────────────────────────────────────────────

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
        result = str(payload.get("result", "")).strip()
        notes = payload.get("notes", "")

        if not workout_id or not store.get_workout(workout_id):
            return {"type": "workout.error", "payload": {"message": "Séance introuvable"}}
        if not result:
            return {"type": "workout.error", "payload": {"message": "Résultat requis"}}

        session = store.add_session(workout_id, result, notes)
        return {"type": "workout.session.added", "payload": session}

    @server.handle("workout.session.delete")
    async def handle_session_delete(client_id: str, payload: dict) -> dict:
        sid = payload.get("id", "")
        if store.delete_session(sid):
            return {"type": "workout.session.deleted", "payload": {"id": sid}}
        return {"type": "workout.error", "payload": {"message": "Session introuvable"}}

    log.info(
        "Module Workout enregistré (%d exercices, %d séances)",
        len(store.list_exercises()), len(store.list_workouts()),
    )
