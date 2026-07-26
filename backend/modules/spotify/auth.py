"""
Authentification Spotify — OAuth 2.0 « Authorization Code ».

Déroulé :
  1. La télécommande demande `spotify.auth_url` → on renvoie l'URL d'autorisation
     Spotify (avec un `state` anti-CSRF à usage unique).
  2. L'utilisateur autorise l'app ; Spotify redirige le navigateur vers
     `redirect_uri`, servi par le serveur Node (`/api/spotify/callback`).
  3. Node transmet le `code` au backend, qui l'échange contre un
     `refresh_token` (permanent) et un `access_token` (1 h).
  4. L'`access_token` est ensuite renouvelé automatiquement à l'expiration.

Le `redirect_uri` doit être **strictement identique** à celui déclaré dans le
dashboard Spotify (https://developer.spotify.com/dashboard).
"""

from __future__ import annotations

import base64
import json
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from core.logger import get_logger
from modules.spotify import store

log = get_logger(__name__)

AUTHORIZE_URL = "https://accounts.spotify.com/authorize"
TOKEN_URL = "https://accounts.spotify.com/api/token"

# Permissions demandées au compte Spotify.
SCOPES = " ".join([
    "user-read-private",            # profil (offre Premium ou non)
    "user-read-playback-state",     # appareils, lecture en cours
    "user-modify-playback-state",   # file d'attente, play/pause/suivant
    "playlist-read-private",        # mes playlists
    "playlist-modify-private",      # création / ajout
    "playlist-modify-public",
])

# `state` en attente : jeton → timestamp d'émission.
_pending_states: dict[str, float] = {}
_STATE_TTL = 15 * 60  # 15 min pour terminer l'autorisation

_token_lock = threading.Lock()


class SpotifyAuthError(Exception):
    """Erreur d'authentification (configuration absente, refus, jeton mort…)."""


# ── URL d'autorisation ──────────────────────────────────────────────

def authorize_url() -> str:
    """Construit l'URL d'autorisation Spotify et mémorise le `state`."""
    if not store.is_configured():
        raise SpotifyAuthError(
            "Identifiants Spotify manquants : renseigner Client ID, Client Secret "
            "et Redirect URI sur la page Spotify."
        )

    config = store.load()
    state = secrets.token_urlsafe(24)

    now = time.time()
    _pending_states[state] = now
    for old, issued in list(_pending_states.items()):
        if now - issued > _STATE_TTL:
            _pending_states.pop(old, None)

    params = urllib.parse.urlencode({
        "client_id": config["client_id"],
        "response_type": "code",
        "redirect_uri": config["redirect_uri"],
        "scope": SCOPES,
        "state": state,
        "show_dialog": "false",
    })
    return f"{AUTHORIZE_URL}?{params}"


# ── Échange de jetons ───────────────────────────────────────────────

def _post_token(data: dict[str, str]) -> dict[str, Any]:
    """Appelle l'endpoint /api/token avec l'auth Basic client_id:client_secret."""
    config = store.load()
    credentials = f"{config['client_id']}:{config['client_secret']}".encode()

    request = urllib.request.Request(
        TOKEN_URL,
        data=urllib.parse.urlencode(data).encode(),
        headers={
            "Authorization": "Basic " + base64.b64encode(credentials).decode(),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(body).get("error_description") or json.loads(body).get("error")
        except json.JSONDecodeError:
            detail = body[:200]
        raise SpotifyAuthError(f"Spotify a refusé la demande ({e.code}) : {detail}") from e
    except urllib.error.URLError as e:
        raise SpotifyAuthError(f"Spotify injoignable : {e.reason}") from e


def exchange_code(code: str, state: str) -> dict[str, Any]:
    """Échange le code d'autorisation contre les jetons, et les persiste."""
    if state not in _pending_states:
        raise SpotifyAuthError("État d'autorisation inconnu ou expiré — relancer la connexion.")
    _pending_states.pop(state, None)

    config = store.load()
    tokens = _post_token({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": config["redirect_uri"],
    })

    refresh_token = tokens.get("refresh_token", "")
    if not refresh_token:
        raise SpotifyAuthError("Spotify n'a pas renvoyé de refresh_token.")

    store.save(
        refresh_token=refresh_token,
        access_token=tokens.get("access_token", ""),
        expires_at=int(time.time()) + int(tokens.get("expires_in", 3600)),
    )
    log.info("Compte Spotify connecté")
    return tokens


def refresh() -> str:
    """Renouvelle l'access_token à partir du refresh_token. Retourne le jeton."""
    config = store.load()
    if not config["refresh_token"]:
        raise SpotifyAuthError("Compte Spotify non connecté.")

    tokens = _post_token({
        "grant_type": "refresh_token",
        "refresh_token": config["refresh_token"],
    })

    access_token = tokens.get("access_token", "")
    if not access_token:
        raise SpotifyAuthError("Spotify n'a pas renvoyé d'access_token.")

    changes: dict[str, Any] = {
        "access_token": access_token,
        "expires_at": int(time.time()) + int(tokens.get("expires_in", 3600)),
    }
    # Spotify peut faire tourner le refresh_token : on garde le plus récent.
    if tokens.get("refresh_token"):
        changes["refresh_token"] = tokens["refresh_token"]

    store.save(**changes)
    log.info("Jeton d'accès Spotify renouvelé")
    return access_token


def access_token(force_refresh: bool = False) -> str:
    """
    Jeton d'accès valide, renouvelé si besoin.

    Une marge de 60 s évite d'utiliser un jeton qui expire pendant la requête.
    """
    with _token_lock:
        config = store.load()
        if not force_refresh and config["access_token"] and config["expires_at"] - 60 > time.time():
            return config["access_token"]
        return refresh()
