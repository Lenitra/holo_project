from __future__ import annotations

"""
Stockage des exercices, séances et sessions.

Exercices :
  { "id": "hex8", "title": "Pompes", "description": "..." }

Séances (workouts) :
  { "id": "hex8", "name": "Full Body", "description": "...",
    "exercises": [
      { "exercise_id": "hex8", "reps": 21, "duration": null, "description": "Avec poids" }
    ] }

Sessions (résultats) :
  { "id": "hex8", "workout_id": "hex8", "date": "2026-04-14T10:30:00",
    "result": "21 reps — 15kg", "notes": "..." }
"""

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from core.logger import get_logger

log = get_logger(__name__)

DATA_DIR = Path(__file__).parent.parent.parent / "data"
EXERCISES_PATH = DATA_DIR / "exercises.json"
WORKOUTS_PATH = DATA_DIR / "workouts.json"
SESSIONS_PATH = DATA_DIR / "workout_sessions.json"


def _load(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text("utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        log.error("Erreur lecture %s : %s", path.name, e)
        return []


def _save(path: Path, data: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")


class WorkoutStore:
    """CRUD sur les exercices, séances et sessions, persistés en JSON."""

    def __init__(self) -> None:
        self._exercises: list[dict[str, Any]] = _load(EXERCISES_PATH)
        self._workouts: list[dict[str, Any]] = _load(WORKOUTS_PATH)
        self._sessions: list[dict[str, Any]] = _load(SESSIONS_PATH)
        log.info(
            "Workouts : %d exercices, %d séances, %d sessions",
            len(self._exercises), len(self._workouts), len(self._sessions),
        )

    # ── Exercices ────────────────────────────────────────────────────

    def list_exercises(self) -> list[dict[str, Any]]:
        return self._exercises

    def get_exercise(self, exercise_id: str) -> dict[str, Any] | None:
        return next((e for e in self._exercises if e["id"] == exercise_id), None)

    def add_exercise(self, title: str, description: str) -> dict[str, Any]:
        exercise = {
            "id": uuid.uuid4().hex[:8],
            "title": title,
            "description": description,
        }
        self._exercises.append(exercise)
        _save(EXERCISES_PATH, self._exercises)
        return exercise

    def update_exercise(self, exercise_id: str, **fields) -> dict[str, Any] | None:
        exercise = self.get_exercise(exercise_id)
        if exercise is None:
            return None
        for key in ("title", "description"):
            if key in fields:
                exercise[key] = fields[key]
        _save(EXERCISES_PATH, self._exercises)
        return exercise

    def delete_exercise(self, exercise_id: str) -> bool:
        before = len(self._exercises)
        self._exercises = [e for e in self._exercises if e["id"] != exercise_id]
        if len(self._exercises) == before:
            return False
        # Retirer cet exercice de toutes les séances qui l'utilisent
        for w in self._workouts:
            w["exercises"] = [
                ex for ex in w.get("exercises", []) if ex["exercise_id"] != exercise_id
            ]
        _save(EXERCISES_PATH, self._exercises)
        _save(WORKOUTS_PATH, self._workouts)
        return True

    # ── Séances (workouts) ───────────────────────────────────────────

    def list_workouts(self) -> list[dict[str, Any]]:
        return self._workouts

    def get_workout(self, workout_id: str) -> dict[str, Any] | None:
        return next((w for w in self._workouts if w["id"] == workout_id), None)

    def add_workout(
        self,
        name: str,
        description: str,
        exercises: list[dict[str, Any]],
    ) -> dict[str, Any]:
        workout = {
            "id": uuid.uuid4().hex[:8],
            "name": name,
            "description": description,
            "exercises": exercises,
        }
        self._workouts.append(workout)
        _save(WORKOUTS_PATH, self._workouts)
        return workout

    def update_workout(self, workout_id: str, **fields) -> dict[str, Any] | None:
        workout = self.get_workout(workout_id)
        if workout is None:
            return None
        for key in ("name", "description", "exercises"):
            if key in fields:
                workout[key] = fields[key]
        _save(WORKOUTS_PATH, self._workouts)
        return workout

    def delete_workout(self, workout_id: str) -> bool:
        before = len(self._workouts)
        self._workouts = [w for w in self._workouts if w["id"] != workout_id]
        if len(self._workouts) == before:
            return False
        # Supprimer aussi toutes les sessions associées
        self._sessions = [s for s in self._sessions if s["workout_id"] != workout_id]
        _save(WORKOUTS_PATH, self._workouts)
        _save(SESSIONS_PATH, self._sessions)
        return True

    # ── Sessions ─────────────────────────────────────────────────────

    def list_sessions(self, workout_id: str) -> list[dict[str, Any]]:
        """Retourne les sessions d'un workout, triées par date croissante."""
        sessions = [s for s in self._sessions if s["workout_id"] == workout_id]
        return sorted(sessions, key=lambda s: s["date"])

    def add_session(self, workout_id: str, result: str, notes: str = "") -> dict[str, Any]:
        session = {
            "id": uuid.uuid4().hex[:8],
            "workout_id": workout_id,
            "date": datetime.now().isoformat(timespec="seconds"),
            "result": result,
            "notes": notes,
        }
        self._sessions.append(session)
        _save(SESSIONS_PATH, self._sessions)
        return session

    def delete_session(self, session_id: str) -> bool:
        before = len(self._sessions)
        self._sessions = [s for s in self._sessions if s["id"] != session_id]
        if len(self._sessions) < before:
            _save(SESSIONS_PATH, self._sessions)
            return True
        return False
