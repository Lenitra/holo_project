"""
Serveur WebSocket central du backend.

Écoute sur localhost:8765, gère les connexions des clients (hologramme, télécommande).
Chaque client s'identifie à la connexion via :
    { "type": "identify", "payload": { "role": "hologram" } }

Les messages suivent le format JSON : { "type": "...", "payload": {...} }
Les handlers sont enregistrés via server.handle("type").
"""

import asyncio
import json
import os
from typing import Any, Callable, Coroutine

import websockets
from websockets.asyncio.server import ServerConnection

from core.logger import get_logger

log = get_logger(__name__)

Handler = Callable[[str, Any], Coroutine[Any, Any, dict | None]]


def build(msg_type: str, payload: dict | None = None) -> str:
    """Construit un message JSON prêt à envoyer."""
    return json.dumps({"type": msg_type, "payload": payload or {}})


class WebSocketServer:
    """Serveur WebSocket central avec routing intégré."""

    def __init__(self) -> None:
        self._clients: dict[str, "Client"] = {}
        self._handlers: dict[str, Handler] = {}
        self._hologram_counter: int = 0
        self._remote_counter: int = 0
        self._handlers["identify"] = self._handle_identify

    def handle(self, msg_type: str):
        """Décorateur pour enregistrer un handler sur un type de message."""
        def decorator(func: Handler) -> Handler:
            self._handlers[msg_type] = func
            return func
        return decorator

    async def _on_connect(self, ws: ServerConnection) -> None:
        """Gère le cycle de vie d'une connexion WebSocket."""
        client = Client(ws)
        self._clients[client.id] = client
        log.info(f"Connexion : {client.id}")

        try:
            async for raw in ws:
                await self._on_message(client, raw)
        except websockets.ConnectionClosed:
            pass
        finally:
            self._clients.pop(client.id, None)
            log.info(f"Déconnexion : {client}")

    async def _on_message(self, client: "Client", raw: str) -> None:
        """Parse, dispatche et répond."""
        try:
            data = json.loads(raw)
            msg_type = data["type"]
            payload = data.get("payload", {})
        except (json.JSONDecodeError, KeyError, TypeError):
            await self.send_to(client.id, build("error", {"message": "Message invalide"}))
            return

        handler = self._handlers.get(msg_type)
        if handler is None:
            await self.send_to(client.id, build("error", {"message": f"Type inconnu : {msg_type}"}))
            return

        response = await handler(client.id, payload)
        if response is not None:
            await self.send_to(client.id, json.dumps(response))

    async def _handle_identify(self, client_id: str, payload: dict) -> dict | None:
        """Identifie un client par son rôle (hologram / remote)."""
        client = self._clients.get(client_id)
        if client is None:
            return {"type": "error", "payload": {"message": "Client introuvable"}}

        role = payload.get("role", "unknown")
        self._clients.pop(client.id, None)

        if role == "hologram":
            self._hologram_counter += 1
            client.id = f"hologram_{self._hologram_counter}"
            client.role = "hologram"
        elif role == "remote":
            self._remote_counter += 1
            client.id = f"remote_{self._remote_counter}"
            client.role = "remote"

        self._clients[client.id] = client
        log.info(f"Identifié : {client}")
        return {"type": "identified", "payload": {"id": client.id, "role": client.role}}

    async def send_to(self, client_id: str, message: str) -> bool:
        """Envoie un message JSON à un client spécifique."""
        client = self._clients.get(client_id)
        if client is None:
            return False
        try:
            await client.ws.send(message)
            return True
        except websockets.ConnectionClosed:
            return False

    async def send_to_role(self, role: str, message: str) -> int:
        """Envoie un message à tous les clients ayant un rôle donné."""
        targets = [c for c in self._clients.values() if c.role == role]
        results = await asyncio.gather(*[self.send_to(c.id, message) for c in targets])
        return sum(1 for r in results if r is True)

    async def start(self) -> None:
        """Démarre le serveur WebSocket."""
        host = os.environ.get("WS_HOST", "localhost")
        port = int(os.environ.get("WS_PORT", "8765"))
        log.info(f"WebSocket sur ws://{host}:{port}")

        async with websockets.serve(self._on_connect, host, port):
            await asyncio.Future()

    def get_clients(self) -> dict[str, dict]:
        """Snapshot des clients connectés."""
        return {cid: {"role": c.role} for cid, c in self._clients.items()}


class Client:
    """Client WebSocket connecté."""
    def __init__(self, ws: ServerConnection) -> None:
        self.ws = ws
        self.id: str = f"anon_{id(ws)}"
        self.role: str = "unknown"

    def __repr__(self) -> str:
        return f"Client({self.id}, {self.role})"


server = WebSocketServer()
