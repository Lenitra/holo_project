from __future__ import annotations

"""
Stockage des repas dans un fichier JSON.

Un repas est une liste d'ingrédients réutilisable : le sélectionner depuis la
télécommande verse ses ingrédients dans la liste de courses.

Chaque repas :
  { "id": "hex8", "name": "Lasagnes", "ingredients": ["Pâtes", "Boeuf haché"] }
"""

import json
import uuid
from pathlib import Path
from typing import Any

from core.logger import get_logger

log = get_logger(__name__)

DEFAULT_PATH = Path(__file__).parent.parent.parent / "data" / "meals.json"


def _clean_ingredients(ingredients: list[Any]) -> list[str]:
    """Nettoie la liste d'ingrédients : chaînes non vides, sans doublons."""
    seen: set[str] = set()
    result: list[str] = []
    for raw in ingredients:
        text = str(raw).strip()
        if text and text.casefold() not in seen:
            seen.add(text.casefold())
            result.append(text)
    return result


class MealStore:
    """CRUD sur les repas, persisté en JSON."""

    def __init__(self, path: Path = DEFAULT_PATH) -> None:
        self._path = path
        self._meals: list[dict[str, Any]] = []
        self._load()

    def _load(self) -> None:
        if self._path.exists():
            try:
                self._meals = json.loads(self._path.read_text("utf-8"))
                log.info("Repas chargés : %d", len(self._meals))
            except (json.JSONDecodeError, OSError) as e:
                log.error("Erreur lecture repas : %s", e)
                self._meals = []
        else:
            self._meals = []

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(self._meals, ensure_ascii=False, indent=2), "utf-8")

    def list(self) -> list[dict[str, Any]]:
        return self._meals

    def get(self, meal_id: str) -> dict[str, Any] | None:
        return next((m for m in self._meals if m["id"] == meal_id), None)

    def add(self, name: str, ingredients: list[Any]) -> dict[str, Any]:
        meal = {
            "id": uuid.uuid4().hex[:8],
            "name": name.strip(),
            "ingredients": _clean_ingredients(ingredients),
        }
        self._meals.append(meal)
        self._save()
        return meal

    def update(self, meal_id: str, name: str | None, ingredients: list[Any] | None) -> dict[str, Any] | None:
        meal = self.get(meal_id)
        if meal is None:
            return None
        if name is not None and name.strip():
            meal["name"] = name.strip()
        if ingredients is not None:
            meal["ingredients"] = _clean_ingredients(ingredients)
        self._save()
        return meal

    def delete(self, meal_id: str) -> bool:
        before = len(self._meals)
        self._meals = [m for m in self._meals if m["id"] != meal_id]
        if len(self._meals) < before:
            self._save()
            return True
        return False
