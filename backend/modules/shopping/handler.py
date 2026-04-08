"""
Handlers WebSocket pour le module Shopping (liste de courses).

Messages gérés :
  - shopping.list   → {}
  - shopping.add    → { text }
  - shopping.toggle → { id }
  - shopping.delete → { id }
  - shopping.clear  → {}  (supprime les articles cochés)
"""

from core.logger import get_logger
from core.ws_server import WebSocketServer
from modules.shopping.store import ShoppingStore

log = get_logger(__name__)


def register(server: WebSocketServer) -> None:
    store = ShoppingStore()

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

    log.info("Module Shopping enregistré (%d articles)", len(store.list()))
