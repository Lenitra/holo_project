from __future__ import annotations

"""
Stockage des listes de tâches dans un fichier JSON.

Chaque liste contient ses propres tâches :
  { "id": "hex8", "name": "Maison", "items": [
      { "id": "hex8", "text": "Changer l'ampoule", "done": false }
  ] }
"""

import json
import uuid
from pathlib import Path
from typing import Any

from core.logger import get_logger

log = get_logger(__name__)

DEFAULT_PATH = Path(__file__).parent.parent.parent / "data" / "todos.json"


class TodoStore:
    """CRUD sur les listes de tâches et leurs tâches, persisté en JSON."""

    def __init__(self, path: Path = DEFAULT_PATH) -> None:
        self._path = path
        self._lists: list[dict[str, Any]] = []
        self._load()

    def _load(self) -> None:
        if self._path.exists():
            try:
                self._lists = json.loads(self._path.read_text("utf-8"))
                log.info("Listes de tâches chargées : %d", len(self._lists))
            except (json.JSONDecodeError, OSError) as e:
                log.error("Erreur lecture listes de tâches : %s", e)
                self._lists = []
        else:
            self._lists = []

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(self._lists, ensure_ascii=False, indent=2), "utf-8")

    # ── Listes ───────────────────────────────────────────────────────

    def lists(self) -> list[dict[str, Any]]:
        return self._lists

    def get(self, list_id: str) -> dict[str, Any] | None:
        return next((lst for lst in self._lists if lst["id"] == list_id), None)

    def add_list(self, name: str) -> dict[str, Any]:
        todo_list = {"id": uuid.uuid4().hex[:8], "name": name.strip(), "items": []}
        self._lists.append(todo_list)
        self._save()
        return todo_list

    def rename_list(self, list_id: str, name: str) -> dict[str, Any] | None:
        todo_list = self.get(list_id)
        if todo_list is None or not name.strip():
            return None
        todo_list["name"] = name.strip()
        self._save()
        return todo_list

    def delete_list(self, list_id: str) -> bool:
        before = len(self._lists)
        self._lists = [lst for lst in self._lists if lst["id"] != list_id]
        if len(self._lists) < before:
            self._save()
            return True
        return False

    # ── Tâches ───────────────────────────────────────────────────────

    def add_item(self, list_id: str, text: str) -> dict[str, Any] | None:
        """Ajoute une tâche. Retourne la liste entière (ou None si introuvable)."""
        todo_list = self.get(list_id)
        if todo_list is None:
            return None
        todo_list["items"].append({"id": uuid.uuid4().hex[:8], "text": text.strip(), "done": False})
        self._save()
        return todo_list

    def toggle_item(self, list_id: str, item_id: str) -> dict[str, Any] | None:
        todo_list = self.get(list_id)
        if todo_list is None:
            return None
        item = next((i for i in todo_list["items"] if i["id"] == item_id), None)
        if item is None:
            return None
        item["done"] = not item["done"]
        self._save()
        return todo_list

    def update_item(self, list_id: str, item_id: str, text: str) -> dict[str, Any] | None:
        todo_list = self.get(list_id)
        if todo_list is None or not text.strip():
            return None
        item = next((i for i in todo_list["items"] if i["id"] == item_id), None)
        if item is None:
            return None
        item["text"] = text.strip()
        self._save()
        return todo_list

    def delete_item(self, list_id: str, item_id: str) -> dict[str, Any] | None:
        todo_list = self.get(list_id)
        if todo_list is None:
            return None
        before = len(todo_list["items"])
        todo_list["items"] = [i for i in todo_list["items"] if i["id"] != item_id]
        if len(todo_list["items"]) == before:
            return None
        self._save()
        return todo_list

    def clear_done(self, list_id: str) -> dict[str, Any] | None:
        """Supprime les tâches faites d'une liste."""
        todo_list = self.get(list_id)
        if todo_list is None:
            return None
        before = len(todo_list["items"])
        todo_list["items"] = [i for i in todo_list["items"] if not i["done"]]
        if len(todo_list["items"]) < before:
            self._save()
        return todo_list
