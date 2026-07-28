"""
Handlers WebSocket pour le module Todo (plusieurs listes de tâches).

Listes :
  - todo.lists        → {}
  - todo.list_add     → { name }
  - todo.list_rename  → { id, name }
  - todo.list_delete  → { id }

Tâches (toujours rattachées à une liste) :
  - todo.item_add     → { list_id, text }
  - todo.item_toggle  → { list_id, id }
  - todo.item_update  → { list_id, id, text }
  - todo.item_delete  → { list_id, id }
  - todo.clear_done   → { list_id }  (supprime les tâches faites)

Toute modification de tâche renvoie `todo.list_updated` avec la liste
complète : le front n'a qu'un seul cas à traiter et reste toujours en phase.
"""

from core.logger import get_logger
from core.ws_server import WebSocketServer
from modules.todo.store import TodoStore

log = get_logger(__name__)


def register(server: WebSocketServer) -> None:
    store = TodoStore()

    def error(message: str) -> dict:
        return {"type": "todo.error", "payload": {"message": message}}

    def updated(todo_list: dict) -> dict:
        return {"type": "todo.list_updated", "payload": todo_list}

    # ── Listes ──────────────────────────────────────────────────────

    @server.handle("todo.lists")
    async def handle_lists(client_id: str, payload: dict) -> dict:
        return {"type": "todo.lists", "payload": {"lists": store.lists()}}

    @server.handle("todo.list_add")
    async def handle_list_add(client_id: str, payload: dict) -> dict:
        name = str(payload.get("name", "")).strip()
        if not name:
            return error("Champ 'name' requis")
        todo_list = store.add_list(name)
        log.info("Liste de tâches créée : %s", todo_list["name"])
        return {"type": "todo.list_added", "payload": todo_list}

    @server.handle("todo.list_rename")
    async def handle_list_rename(client_id: str, payload: dict) -> dict:
        name = str(payload.get("name", "")).strip()
        if not name:
            return error("Champ 'name' requis")
        todo_list = store.rename_list(payload.get("id", ""), name)
        if todo_list is None:
            return error("Liste introuvable")
        return updated(todo_list)

    @server.handle("todo.list_delete")
    async def handle_list_delete(client_id: str, payload: dict) -> dict:
        list_id = payload.get("id", "")
        if store.delete_list(list_id):
            return {"type": "todo.list_deleted", "payload": {"id": list_id}}
        return error("Liste introuvable")

    # ── Tâches ──────────────────────────────────────────────────────

    @server.handle("todo.item_add")
    async def handle_item_add(client_id: str, payload: dict) -> dict:
        text = str(payload.get("text", "")).strip()
        if not text:
            return error("Champ 'text' requis")
        todo_list = store.add_item(payload.get("list_id", ""), text)
        if todo_list is None:
            return error("Liste introuvable")
        return updated(todo_list)

    @server.handle("todo.item_toggle")
    async def handle_item_toggle(client_id: str, payload: dict) -> dict:
        todo_list = store.toggle_item(payload.get("list_id", ""), payload.get("id", ""))
        if todo_list is None:
            return error("Tâche introuvable")
        return updated(todo_list)

    @server.handle("todo.item_update")
    async def handle_item_update(client_id: str, payload: dict) -> dict:
        text = str(payload.get("text", "")).strip()
        if not text:
            return error("Champ 'text' requis")
        todo_list = store.update_item(payload.get("list_id", ""), payload.get("id", ""), text)
        if todo_list is None:
            return error("Tâche introuvable")
        return updated(todo_list)

    @server.handle("todo.item_delete")
    async def handle_item_delete(client_id: str, payload: dict) -> dict:
        todo_list = store.delete_item(payload.get("list_id", ""), payload.get("id", ""))
        if todo_list is None:
            return error("Tâche introuvable")
        return updated(todo_list)

    @server.handle("todo.clear_done")
    async def handle_clear_done(client_id: str, payload: dict) -> dict:
        todo_list = store.clear_done(payload.get("list_id", ""))
        if todo_list is None:
            return error("Liste introuvable")
        return updated(todo_list)

    log.info(
        "Module Todo enregistré (%d listes, %d tâches)",
        len(store.lists()),
        sum(len(lst["items"]) for lst in store.lists()),
    )
