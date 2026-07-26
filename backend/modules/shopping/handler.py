"""
Handlers WebSocket pour le module Shopping (liste de courses + repas).

Liste de courses :
  - shopping.list   → {}
  - shopping.add    → { text }
  - shopping.toggle → { id }
  - shopping.delete → { id }
  - shopping.clear  → {}  (supprime les articles cochés)

Repas (listes d'ingrédients réutilisables) :
  - shopping.meals        → {}
  - shopping.meal_add     → { name, ingredients: ["Pâtes", …] }
  - shopping.meal_update  → { id, name?, ingredients? }
  - shopping.meal_delete  → { id }
  - shopping.meal_to_list → { id } : verse les ingrédients dans la liste
                            (doublons ignorés, articles cochés re-décochés)
"""

from core.logger import get_logger
from core.ws_server import WebSocketServer
from modules.shopping.meals import MealStore
from modules.shopping.store import ShoppingStore

log = get_logger(__name__)


def register(server: WebSocketServer) -> None:
    store = ShoppingStore()
    meals = MealStore()

    @server.handle("shopping.list")
    async def handle_list(client_id: str, payload: dict) -> dict:
        return {"type": "shopping.list", "payload": {"items": store.list()}}

    @server.handle("shopping.add")
    async def handle_add(client_id: str, payload: dict) -> dict:
        text = payload.get("text", "").strip()
        if not text:
            return {"type": "shopping.error", "payload": {"message": "Champ 'text' requis"}}
        item = store.add(text)
        return {"type": "shopping.added", "payload": item}

    @server.handle("shopping.toggle")
    async def handle_toggle(client_id: str, payload: dict) -> dict:
        item_id = payload.get("id", "")
        item = store.toggle(item_id)
        if item is None:
            return {"type": "shopping.error", "payload": {"message": "Article introuvable"}}
        return {"type": "shopping.toggled", "payload": item}

    @server.handle("shopping.delete")
    async def handle_delete(client_id: str, payload: dict) -> dict:
        item_id = payload.get("id", "")
        if store.delete(item_id):
            return {"type": "shopping.deleted", "payload": {"id": item_id}}
        return {"type": "shopping.error", "payload": {"message": "Article introuvable"}}

    @server.handle("shopping.clear")
    async def handle_clear(client_id: str, payload: dict) -> dict:
        count = store.clear_checked()
        return {"type": "shopping.cleared", "payload": {"removed": count, "items": store.list()}}

    # ── Repas ───────────────────────────────────────────────────────

    @server.handle("shopping.meals")
    async def handle_meals(client_id: str, payload: dict) -> dict:
        return {"type": "shopping.meals", "payload": {"meals": meals.list()}}

    @server.handle("shopping.meal_add")
    async def handle_meal_add(client_id: str, payload: dict) -> dict:
        name = str(payload.get("name", "")).strip()
        ingredients = payload.get("ingredients") or []
        if not name:
            return {"type": "shopping.error", "payload": {"message": "Champ 'name' requis"}}
        if not isinstance(ingredients, list) or not any(str(i).strip() for i in ingredients):
            return {"type": "shopping.error", "payload": {"message": "Au moins un ingrédient requis"}}
        meal = meals.add(name, ingredients)
        log.info("Repas ajouté : %s (%d ingrédients)", meal["name"], len(meal["ingredients"]))
        return {"type": "shopping.meal_added", "payload": meal}

    @server.handle("shopping.meal_update")
    async def handle_meal_update(client_id: str, payload: dict) -> dict:
        meal = meals.update(
            payload.get("id", ""),
            payload.get("name"),
            payload.get("ingredients"),
        )
        if meal is None:
            return {"type": "shopping.error", "payload": {"message": "Repas introuvable"}}
        return {"type": "shopping.meal_updated", "payload": meal}

    @server.handle("shopping.meal_delete")
    async def handle_meal_delete(client_id: str, payload: dict) -> dict:
        meal_id = payload.get("id", "")
        if meals.delete(meal_id):
            return {"type": "shopping.meal_deleted", "payload": {"id": meal_id}}
        return {"type": "shopping.error", "payload": {"message": "Repas introuvable"}}

    @server.handle("shopping.meal_to_list")
    async def handle_meal_to_list(client_id: str, payload: dict) -> dict:
        meal = meals.get(payload.get("id", ""))
        if meal is None:
            return {"type": "shopping.error", "payload": {"message": "Repas introuvable"}}
        counts = store.merge(meal["ingredients"])
        log.info(
            "Repas « %s » → liste : %d ajoutés, %d re-décochés, %d déjà présents",
            meal["name"], counts["added"], counts["restored"], counts["skipped"],
        )
        return {
            "type": "shopping.merged",
            "payload": {"meal": meal["name"], "items": store.list(), **counts},
        }

    log.info(
        "Module Shopping enregistré (%d articles, %d repas)",
        len(store.list()), len(meals.list()),
    )
