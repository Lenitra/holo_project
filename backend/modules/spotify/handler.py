"""
Handlers WebSocket pour le module Spotify.

Configuration :
  - spotify.status          → {} : état (configuré, connecté, compte, appareil)
  - spotify.set_credentials → { client_id, client_secret, redirect_uri }
  - spotify.auth_url        → {} : URL d'autorisation à ouvrir dans un navigateur
  - spotify.callback        → { code, state } : envoyé par le serveur Node
  - spotify.disconnect      → {} : oublie le compte (garde les identifiants d'app)

Bibliothèque :
  - spotify.search          → { query, kind: "playlist" | "track", limit? }
  - spotify.playlists       → {} : mes playlists
  - spotify.playlist        → { id } : détail + titres
  - spotify.playlist_create → { name, description?, public? }
  - spotify.playlist_add    → { playlist_id, uris: [...] }

Lecture :
  - spotify.queue           → { uri } ou { uris: [...] }
  - spotify.devices         → {}
  - spotify.set_device      → { device_id, play? }
  - spotify.now_playing     → {}
  - spotify.play / spotify.pause / spotify.next → {}
"""

import asyncio
from typing import Any, Callable

from core.logger import get_logger
from core.ws_server import WebSocketServer
from modules.spotify import api, auth, store

log = get_logger(__name__)


def _error(message: str) -> dict:
    return {"type": "spotify.error", "payload": {"message": message}}


async def _call(func: Callable[..., Any], *args: Any) -> Any:
    """Exécute un appel API bloquant dans un thread."""
    return await asyncio.to_thread(func, *args)


def _status() -> dict:
    """État courant du module, sans jamais exposer de secret."""
    status: dict[str, Any] = {
        "configured": store.is_configured(),
        "connected": store.is_connected(),
        **store.public_config(),
    }
    return status


def register(server: WebSocketServer) -> None:
    """Enregistre les handlers Spotify sur le serveur WebSocket."""

    # ── Configuration ───────────────────────────────────────────────

    @server.handle("spotify.status")
    async def handle_status(client_id: str, payload: dict) -> dict:
        status = _status()
        if status["connected"]:
            try:
                status["account"] = await _call(api.me)
            except Exception as e:
                # Compte injoignable : on reste informatif plutôt que bloquant.
                status["account"] = None
                status["warning"] = str(e)
        return {"type": "spotify.status", "payload": status}

    @server.handle("spotify.set_credentials")
    async def handle_set_credentials(client_id: str, payload: dict) -> dict:
        changes: dict[str, Any] = {}
        for field in ("client_id", "redirect_uri", "market"):
            if payload.get(field) is not None:
                changes[field] = str(payload[field]).strip()
        # Un secret vide signifie « ne pas modifier » (le champ n'est jamais
        # renvoyé au client, il revient donc vide du formulaire).
        secret = (payload.get("client_secret") or "").strip()
        if secret:
            changes["client_secret"] = secret

        if not changes:
            return _error("Aucun champ à enregistrer")

        store.save(**changes)
        log.info("Identifiants Spotify mis à jour (%s)", ", ".join(sorted(changes)))
        return {"type": "spotify.status", "payload": _status()}

    @server.handle("spotify.auth_url")
    async def handle_auth_url(client_id: str, payload: dict) -> dict:
        try:
            url = auth.authorize_url()
        except auth.SpotifyAuthError as e:
            return _error(str(e))
        return {"type": "spotify.auth_url", "payload": {"url": url}}

    @server.handle("spotify.callback")
    async def handle_callback(client_id: str, payload: dict) -> dict:
        """Fin du flux OAuth : le serveur Node relaie le code d'autorisation."""
        code = payload.get("code", "")
        state = payload.get("state", "")
        if not code or not state:
            return _error("Code d'autorisation manquant")

        try:
            await _call(auth.exchange_code, code, state)
        except auth.SpotifyAuthError as e:
            log.error("Connexion Spotify échouée : %s", e)
            return _error(str(e))

        status = _status()
        await server.send_to_role("remote", _json_status(status))
        return {"type": "spotify.status", "payload": status}

    @server.handle("spotify.disconnect")
    async def handle_disconnect(client_id: str, payload: dict) -> dict:
        store.clear_tokens()
        log.info("Compte Spotify déconnecté")
        return {"type": "spotify.status", "payload": _status()}

    # ── Bibliothèque ────────────────────────────────────────────────

    @server.handle("spotify.search")
    async def handle_search(client_id: str, payload: dict) -> dict:
        query = (payload.get("query") or "").strip()
        if not query:
            return _error("Recherche vide")
        try:
            result = await _call(api.search, query, payload.get("kind", "playlist"),
                                 int(payload.get("limit", 20)))
        except Exception as e:
            return _error(str(e))
        return {"type": "spotify.search", "payload": result}

    @server.handle("spotify.playlists")
    async def handle_playlists(client_id: str, payload: dict) -> dict:
        try:
            playlists = await _call(api.my_playlists)
        except Exception as e:
            return _error(str(e))
        return {"type": "spotify.playlists", "payload": {"playlists": playlists}}

    @server.handle("spotify.playlist")
    async def handle_playlist(client_id: str, payload: dict) -> dict:
        playlist_id = payload.get("id", "")
        if not playlist_id:
            return _error("Champ 'id' requis")
        try:
            result = await _call(api.playlist_tracks, playlist_id)
        except Exception as e:
            return _error(str(e))
        return {"type": "spotify.playlist", "payload": result}

    @server.handle("spotify.playlist_create")
    async def handle_playlist_create(client_id: str, payload: dict) -> dict:
        try:
            playlist = await _call(
                api.create_playlist,
                payload.get("name", ""),
                payload.get("description", ""),
                bool(payload.get("public", False)),
            )
        except Exception as e:
            return _error(str(e))
        return {"type": "spotify.playlist_created", "payload": playlist}

    @server.handle("spotify.playlist_add")
    async def handle_playlist_add(client_id: str, payload: dict) -> dict:
        playlist_id = payload.get("playlist_id", "")
        uris = payload.get("uris") or ([payload["uri"]] if payload.get("uri") else [])
        if not playlist_id or not uris:
            return _error("Champs 'playlist_id' et 'uris' requis")
        try:
            count = await _call(api.add_tracks, playlist_id, uris)
        except Exception as e:
            return _error(str(e))
        return {"type": "spotify.playlist_updated",
                "payload": {"playlist_id": playlist_id, "added": count}}

    # ── Lecture ─────────────────────────────────────────────────────

    @server.handle("spotify.queue")
    async def handle_queue(client_id: str, payload: dict) -> dict:
        uris = payload.get("uris") or ([payload["uri"]] if payload.get("uri") else [])
        if not uris:
            return _error("Champ 'uri' ou 'uris' requis")
        try:
            count = await _call(api.queue_many, uris)
        except Exception as e:
            return _error(str(e))
        return {"type": "spotify.queued",
                "payload": {"count": count, "truncated": len(uris) > count}}

    @server.handle("spotify.devices")
    async def handle_devices(client_id: str, payload: dict) -> dict:
        try:
            devices = await _call(api.devices)
        except Exception as e:
            return _error(str(e))
        return {"type": "spotify.devices",
                "payload": {"devices": devices, "selected": store.load().get("device_id", "")}}

    @server.handle("spotify.set_device")
    async def handle_set_device(client_id: str, payload: dict) -> dict:
        device_id = payload.get("device_id", "")
        if not device_id:
            return _error("Champ 'device_id' requis")
        try:
            await _call(api.transfer, device_id, bool(payload.get("play", False)))
        except Exception as e:
            return _error(str(e))
        return {"type": "spotify.status", "payload": _status()}

    @server.handle("spotify.now_playing")
    async def handle_now_playing(client_id: str, payload: dict) -> dict:
        try:
            state = await _call(api.now_playing)
        except Exception as e:
            return _error(str(e))
        return {"type": "spotify.now_playing", "payload": state}

    for message, action in (("spotify.play", api.play), ("spotify.pause", api.pause),
                            ("spotify.next", api.next_track)):
        _register_transport(server, message, action)

    log.info("Module Spotify enregistré (16 handlers)")


def _register_transport(server: WebSocketServer, message: str, action: Callable[[], None]) -> None:
    """Enregistre une commande de lecture simple (play / pause / suivant)."""

    @server.handle(message)
    async def handle(client_id: str, payload: dict) -> dict:
        try:
            await _call(action)
        except Exception as e:
            return _error(str(e))
        return {"type": "spotify.done", "payload": {"action": message}}


def _json_status(status: dict) -> str:
    """Message `spotify.status` prêt à diffuser aux télécommandes."""
    from core.ws_server import build
    return build("spotify.status", status)
