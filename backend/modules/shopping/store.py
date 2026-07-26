from __future__ import annotations

"""
Stockage de la liste de courses dans un fichier JSON.

Chaque article :
  { "id": "hex8", "text": "Lait", "checked": false }
"""

import json
import uuid
from pathlib import Path
from typing import Any

from core.logger import get_logger

log = get_logger(__name__)

DEFAULT_PATH = Path(__file__).parent.parent.parent / "data" / "shopping.json"


class ShoppingStore:
    """CRUD sur la liste de courses, persisté en JSON."""

    def __init__(self, path: Path = DEFAULT_PATH) -> None:
        self._path = path
        self._items: list[dict[str, Any]] = []
        self._load()

    def _load(self) -> None:
        if self._path.exists():
            try:
                self._items = json.loads(self._path.read_text("utf-8"))
                log.info("Liste de courses chargée : %d articles", len(self._items))
            except (json.JSONDecodeError, OSError) as e:
                log.error("Erreur lecture liste de courses : %s", e)
                self._items = []
        else:
            self._items = []

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(self._items, ensure_ascii=False, indent=2), "utf-8")

    def list(self) -> list[dict[str, Any]]:
        return self._items

    def add(self, text: str) -> dict[str, Any]:
        item = {"id": uuid.uuid4().hex[:8], "text": text, "checked": False}
        self._items.append(item)
        self._save()
        return item

    def toggle(self, item_id: str) -> dict[str, Any] | None:
        item = next((i for i in self._items if i["id"] == item_id), None)
        if item is None:
            return None
        item["checked"] = not item["checked"]
        self._save()
        return item

    def delete(self, item_id: str) -> bool:
        before = len(self._items)
        self._items = [i for i in self._items if i["id"] != item_id]
        if len(self._items) < before:
            self._save()
            return True
        return False

    def clear_checked(self) -> int:
        """Supprime tous les articles cochés. Retourne le nombre supprimé."""
        before = len(self._items)
        self._items = [i for i in self._items if not i["checked"]]
        removed = before - len(self._items)
        if removed > 0:
            self._save()
        return removed

    def merge(self, texts: list[str]) -> dict[str, int]:
        """
        Verse une liste d'articles dans la liste de courses, sans doublons
        (comparaison insensible à la casse) :
          - absent               → ajouté
          - présent déjà coché   → re-décoché (à racheter)
          - présent non coché    → ignoré
        Retourne les compteurs { added, restored, skipped }.
        """
        by_text = {i["text"].strip().casefold(): i for i in self._items}
        added = restored = skipped = 0

        for raw in texts:
            text = str(raw).strip()
            if not text:
                continue
            existing = by_text.get(text.casefold())
            if existing is None:
                item = {"id": uuid.uuid4().hex[:8], "text": text, "checked": False}
                self._items.append(item)
                by_text[text.casefold()] = item
                added += 1
            elif existing["checked"]:
                existing["checked"] = False
                restored += 1
            else:
                skipped += 1

        if added or restored:
            self._save()
        return {"added": added, "restored": restored, "skipped": skipped}
