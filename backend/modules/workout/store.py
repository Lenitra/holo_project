from __future__ import annotations

"""
Stockage des workouts et sessions.

Workouts (templates) :
  { "id": "hex8", "name": "Fran", "description": "...", "category": "max_reps" | "max_time" }

Sessions (résultats) :
  { "id": "hex8", "workout_id": "hex8", "date": "2026-04-14T10:30:00",
    "value": 42,    # nombre de reps (max_reps) ou secondes (max_time)
    "notes": "..." }
"""

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from core.logger import get_logger

log = get_logger(__name__)

DATA_DIR = Path(__file__).parent.parent.parent / "data"
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
    """CRUD sur les workouts et sessions, persistés en JSON."""

    VALID_CATEGORIES = {"max_reps", "max_time"}

    def __init__(self) -> None:
        self._workouts: list[dict[str, Any]] = _load(WORKOUTS_PATH)
        self._sessions: list[dict[str, Any]] = _load(SESSIONS_PATH)
        log.info("Workouts : %d templates, %d sessions", len(self._workouts), len(self._sessions))

    # ── Workouts ─────────────────────────────────────────────────────

    def list_workouts(self) -> list[dict[str, Any]]:
        return self._workouts

    def get_workout(self, workout_id: str) -> dict[str, Any] | None:
        return next((w for w in self._workouts if w["id"] == workout_id), None)

    def add_workout(self, name: str, description: str, category: str) -> dict[str, Any]:
        workout = {
            "id": uuid.uuid4().hex[:8],
            "name": name,
            "description": description,
            "category": category,
        }
        self._workouts.append(workout)
        _save(WORKOUTS_PATH, self._workouts)
        return workout

    def update_workout(self, workout_id: str, **fields) -> dict[str, Any] | None:
        workout = self.get_workout(workout_id)
        if workout is None:
            return None
        for key in ("name", "description", "category"):
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

    def add_session(self, workout_id: str, value: float, notes: str = "") -> dict[str, Any]:
        session = {
            "id": uuid.uuid4().hex[:8],
            "workout_id": workout_id,
            "date": datetime.now().isoformat(timespec="seconds"),
            "value": value,
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
