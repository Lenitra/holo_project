"""
Client de l'API Web Spotify.

Uniquement `urllib` (comme les modules météo et avions) : pas de dépendance
supplémentaire. Toutes les fonctions sont synchrones et bloquantes — elles sont
appelées via `asyncio.to_thread` depuis les handlers.

Les réponses de Spotify sont volumineuses : on ne renvoie à la télécommande
que des objets compacts (cf. `_playlist` / `_track`).
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from core.logger import get_logger
from modules.spotify import auth, store

log = get_logger(__name__)

API_BASE = "https://api.spotify.com/v1"
TIMEOUT = 15

# Nombre max de titres mis en file d'attente en une fois : chaque titre coûte
# un appel API, au-delà on se ferait limiter (429).
QUEUE_MAX = 50


class SpotifyError(Exception):
    """Erreur renvoyée par l'API Spotify, avec un message lisible en français."""

    def __init__(self, message: str, status: int = 0, reason: str = "") -> None:
        super().__init__(message)
        self.status = status
        self.reason = reason


# ── Transport ───────────────────────────────────────────────────────

def _friendly_error(status: int, reason: str, message: str) -> str:
    """Traduit les erreurs Spotify courantes en message actionnable."""
    if reason == "NO_ACTIVE_DEVICE" or (status == 404 and "device" in message.lower()):
        return ("Aucun appareil Spotify actif. Lance la lecture sur une enceinte "
                "ou un téléphone, puis réessaie.")
    if reason == "PREMIUM_REQUIRED" or status == 403:
        return "Action refusée par Spotify : un compte Premium est nécessaire pour piloter la lecture."
    if status == 401:
        return "Session Spotify expirée — reconnecter le compte depuis la page Spotify."
    if status == 429:
        return "Trop de requêtes envoyées à Spotify, réessaie dans quelques secondes."
    return message or f"Erreur Spotify ({status})"


def _request(
    method: str,
    path: str,
    params: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
    _retried: bool = False,
) -> dict[str, Any]:
    """Appel authentifié à l'API. Retourne {} pour les réponses vides (204)."""
    url = f"{API_BASE}{path}"
    if params:
        url += "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v not in (None, "")})

    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {auth.access_token()}",
            "Content-Type": "application/json",
        },
        method=method,
    )

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            raw = response.read()
            return json.loads(raw.decode("utf-8")) if raw else {}
    except urllib.error.HTTPError as e:
        payload = e.read().decode("utf-8", errors="replace")
        message, reason = "", ""
        try:
            error = json.loads(payload).get("error", {})
            if isinstance(error, dict):
                message, reason = error.get("message", ""), error.get("reason", "")
            else:
                message = str(error)
        except json.JSONDecodeError:
            message = payload[:200]

        # Jeton périmé côté Spotify : on le renouvelle et on retente une fois.
        if e.code == 401 and not _retried:
            log.info("401 Spotify — renouvellement du jeton")
            auth.access_token(force_refresh=True)
            return _request(method, path, params, body, _retried=True)

        raise SpotifyError(_friendly_error(e.code, reason, message), e.code, reason) from e
    except urllib.error.URLError as e:
        raise SpotifyError(f"Spotify injoignable : {e.reason}") from e


# ── Mise en forme ───────────────────────────────────────────────────

def _image(images: list[dict] | None) -> str:
    """URL de la plus petite pochette disponible (économise la bande passante)."""
    if not images:
        return ""
    return min(images, key=lambda i: i.get("width") or 9999).get("url", "")


def _playlist(item: dict) -> dict[str, Any]:
    return {
        "id": item.get("id", ""),
        "uri": item.get("uri", ""),
        "name": item.get("name", ""),
        "owner": (item.get("owner") or {}).get("display_name", ""),
        "tracks": (item.get("tracks") or {}).get("total", 0),
        "image": _image(item.get("images")),
        "public": bool(item.get("public")),
    }


def _track(item: dict) -> dict[str, Any]:
    album = item.get("album") or {}
    return {
        "id": item.get("id", ""),
        "uri": item.get("uri", ""),
        "name": item.get("name", ""),
        "artists": ", ".join(a.get("name", "") for a in item.get("artists", [])),
        "album": album.get("name", ""),
        "duration_ms": item.get("duration_ms", 0),
        "image": _image(album.get("images")),
    }


def _market() -> str:
    return store.load().get("market") or "FR"


# ── Compte ──────────────────────────────────────────────────────────

def me() -> dict[str, Any]:
    """Profil du compte connecté."""
    profile = _request("GET", "/me")
    return {
        "id": profile.get("id", ""),
        "name": profile.get("display_name") or profile.get("id", ""),
        "premium": profile.get("product") == "premium",
    }


# ── Recherche et playlists ──────────────────────────────────────────

def search(query: str, kind: str = "playlist", limit: int = 20) -> dict[str, Any]:
    """Recherche des playlists ou des titres."""
    if kind not in ("playlist", "track"):
        raise SpotifyError(f"Type de recherche invalide : {kind}")

    result = _request("GET", "/search", {
        "q": query,
        "type": kind,
        "limit": max(1, min(50, limit)),
        "market": _market(),
    })

    # L'API renvoie parfois des entrées nulles dans les résultats de playlists.
    items = [i for i in (result.get(f"{kind}s") or {}).get("items", []) if i]
    formatter = _playlist if kind == "playlist" else _track
    return {"kind": kind, "query": query, "items": [formatter(i) for i in items]}


def my_playlists(limit: int = 50) -> list[dict[str, Any]]:
    """Playlists du compte connecté."""
    result = _request("GET", "/me/playlists", {"limit": max(1, min(50, limit))})
    return [_playlist(i) for i in result.get("items", []) if i]


def playlist_tracks(playlist_id: str, limit: int = 100) -> dict[str, Any]:
    """Détail d'une playlist et ses titres (100 max, soit deux pages d'API)."""
    detail = _request("GET", f"/playlists/{playlist_id}", {
        "market": _market(),
        "fields": "id,uri,name,public,images,owner(display_name),tracks(total)",
    })

    tracks: list[dict[str, Any]] = []
    offset = 0
    while len(tracks) < limit:
        page = _request("GET", f"/playlists/{playlist_id}/tracks", {
            "market": _market(),
            "limit": min(50, limit - len(tracks)),
            "offset": offset,
            "fields": "next,items(track(id,uri,name,duration_ms,artists(name),album(name,images)))",
        })
        items = page.get("items", [])
        tracks.extend(_track(i["track"]) for i in items if i and i.get("track"))
        if not page.get("next") or not items:
            break
        offset += len(items)

    return {"playlist": _playlist(detail), "tracks": tracks}


def create_playlist(name: str, description: str = "", public: bool = False) -> dict[str, Any]:
    """Crée une playlist sur le compte connecté."""
    if not name.strip():
        raise SpotifyError("Le nom de la playlist est obligatoire.")

    user_id = me()["id"]
    created = _request("POST", f"/users/{user_id}/playlists", body={
        "name": name.strip(),
        "description": description.strip(),
        "public": bool(public),
    })
    log.info("Playlist Spotify créée : %s", name)
    return _playlist(created)


def add_tracks(playlist_id: str, uris: list[str]) -> int:
    """Ajoute des titres à une playlist. Retourne le nombre ajouté."""
    uris = [u for u in uris if u]
    if not uris:
        raise SpotifyError("Aucun titre à ajouter.")

    # L'API accepte 100 URIs par appel.
    for start in range(0, len(uris), 100):
        _request("POST", f"/playlists/{playlist_id}/tracks", body={"uris": uris[start:start + 100]})

    log.info("%d titre(s) ajouté(s) à la playlist %s", len(uris), playlist_id)
    return len(uris)


# ── Lecture ─────────────────────────────────────────────────────────

def devices() -> list[dict[str, Any]]:
    """Appareils Spotify Connect visibles par le compte."""
    result = _request("GET", "/me/player/devices")
    return [
        {
            "id": d.get("id", ""),
            "name": d.get("name", ""),
            "type": d.get("type", ""),
            "active": bool(d.get("is_active")),
            "volume": d.get("volume_percent"),
        }
        for d in result.get("devices", [])
    ]


def _target_device(device_id: str | None = None) -> str:
    """Appareil visé : celui demandé, sinon le dernier mémorisé."""
    return device_id or store.load().get("device_id") or ""


def queue(uri: str, device_id: str | None = None) -> None:
    """Ajoute un titre à la file d'attente de lecture."""
    _request("POST", "/me/player/queue", {"uri": uri, "device_id": _target_device(device_id)})


def queue_many(uris: list[str], device_id: str | None = None) -> int:
    """
    Met plusieurs titres en file d'attente, dans l'ordre.

    Plafonné à QUEUE_MAX : un appel par titre, au-delà Spotify limite le débit.
    Retourne le nombre effectivement mis en file.
    """
    selected = [u for u in uris if u][:QUEUE_MAX]
    target = _target_device(device_id)
    for uri in selected:
        queue(uri, target)
    log.info("%d titre(s) mis en file d'attente", len(selected))
    return len(selected)


def now_playing() -> dict[str, Any]:
    """Lecture en cours (vide si rien ne joue)."""
    state = _request("GET", "/me/player", {"market": _market()})
    if not state:
        return {"playing": False}

    item = state.get("item") or {}
    device = state.get("device") or {}
    return {
        "playing": bool(state.get("is_playing")),
        "track": _track(item) if item else None,
        "progress_ms": state.get("progress_ms", 0),
        "device": {"id": device.get("id", ""), "name": device.get("name", "")},
    }


def transfer(device_id: str, play: bool = False) -> None:
    """Bascule la lecture sur un appareil et le mémorise comme cible."""
    _request("PUT", "/me/player", body={"device_ids": [device_id], "play": play})
    store.save(device_id=device_id)
    log.info("Lecture transférée vers %s", device_id)


def play(device_id: str | None = None) -> None:
    """Reprend la lecture. Corps vide = « reprendre où on en était »."""
    _request("PUT", "/me/player/play", {"device_id": _target_device(device_id)}, body={})


def pause() -> None:
    """Met la lecture en pause."""
    _request("PUT", "/me/player/pause", {"device_id": _target_device()}, body={})


def next_track() -> None:
    """Passe au titre suivant (celui en tête de file d'attente)."""
    _request("POST", "/me/player/next", {"device_id": _target_device()})
