from __future__ import annotations

"""
Stockage des routines dans un fichier JSON.

Chaque routine :
  {
    "id": "uuid",
    "name": "Météo matin",
    "action": "weather.tts",
    "time": "07:30",
    "days": [1, 2, 3, 4, 5],   # 1=lundi … 7=dimanche (ISO)
    "enabled": true
  }
"""

import json
import uuid
from pathlib import Path
from typing import Any

from core.logger import get_logger

log = get_logger(__name__)

DEFAULT_PATH = Path(__file__).parent.parent.parent / "data" / "routines.json"


class RoutineStore:
    """CRUD sur les routines, persisté en JSON."""

    def __init__(self, path: Path = DEFAULT_PATH) -> None:
        self._path = path
        self._routines: list[dict[str, Any]] = []
        self._load()

    # ── Persistence ──────────────────────────────────────────────────

    def _load(self) -> None:
        if self._path.exists():
            try:
                self._routines = json.loads(self._path.read_text("utf-8"))
                log.info("Routines chargées : %d", len(self._routines))
            except (json.JSONDecodeError, OSError) as e:
                log.error("Erreur lecture routines : %s", e)
                self._routines = []
        else:
            self._routines = []

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(self._routines, ensure_ascii=False, indent=2), "utf-8")

    # ── CRUD ─────────────────────────────────────────────────────────

    def list(self) -> list[dict[str, Any]]:
        return self._routines

    def get(self, routine_id: str) -> dict[str, Any] | None:
        return next((r for r in self._routines if r["id"] == routine_id), None)

    def add(self, name: str, action: str, time: str, days: list[int], enabled: bool = True) -> dict[str, Any]:
        routine = {
            "id": uuid.uuid4().hex[:8],
            "name": name,
            "action": action,
            "time": time,
            "days": sorted(days),
            "enabled": enabled,
        }
        self._routines.append(routine)
        self._save()
        log.info("Routine ajoutée : %s (%s à %s)", name, action, time)
        return routine

    def update(self, routine_id: str, **fields) -> dict[str, Any] | None:
        routine = self.get(routine_id)
        if routine is None:
            return None
        for key in ("name", "action", "time", "days", "enabled"):
            if key in fields:
                routine[key] = fields[key]
        if "days" in fields:
            routine["days"] = sorted(routine["days"])
        self._save()
        log.info("Routine modifiée : %s", routine_id)
        return routine

    def delete(self, routine_id: str) -> bool:
        before = len(self._routines)
        self._routines = [r for r in self._routines if r["id"] != routine_id]
        if len(self._routines) < before:
            self._save()
            log.info("Routine supprimée : %s", routine_id)
            return True
        return False
