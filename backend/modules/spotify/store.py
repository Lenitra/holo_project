"""
Stockage des identifiants et des jetons Spotify.

Tout est dans `backend/data/spotify.json`, **hors du dépôt Git** : ce fichier
contient le client secret et le refresh token du compte.

Contenu :
    {
      "client_id":     "...",
      "client_secret": "...",
      "redirect_uri":  "https://prism.taumah.fr/api/spotify/callback",
      "refresh_token": "...",       # obtenu après autorisation
      "access_token":  "...",       # jeton court (1 h), régénéré à la volée
      "expires_at":    1750000000,  # timestamp d'expiration de l'access_token
      "device_id":     "...",       # dernier appareil choisi pour la lecture
      "market":        "FR"
    }
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

from core.logger import get_logger

log = get_logger(__name__)

STORE_PATH = Path(__file__).parent.parent.parent / "data" / "spotify.json"

DEFAULTS: dict[str, Any] = {
    "client_id": "",
    "client_secret": "",
    "redirect_uri": "",
    "refresh_token": "",
    "access_token": "",
    "expires_at": 0,
    "device_id": "",
    "market": "FR",
}

# Champs jamais renvoyés aux clients (télécommande, logs).
SECRET_FIELDS = ("client_secret", "refresh_token", "access_token")

_lock = threading.Lock()
_cache: dict[str, Any] | None = None


def load() -> dict[str, Any]:
    """Configuration complète (secrets compris) — usage interne uniquement."""
    global _cache
    if _cache is None:
        data: dict[str, Any] = {}
        if STORE_PATH.exists():
            try:
                data = json.loads(STORE_PATH.read_text("utf-8"))
            except (json.JSONDecodeError, OSError) as e:
                log.error("spotify.json illisible (%s) — configuration ignorée", e)
        _cache = {**DEFAULTS, **data}
    return _cache


def save(**changes: Any) -> dict[str, Any]:
    """Met à jour et persiste la configuration (écriture atomique)."""
    global _cache
    with _lock:
        current = {**load(), **changes}
        _cache = current

        STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = STORE_PATH.with_name(STORE_PATH.name + ".tmp")
        tmp.write_text(json.dumps(current, ensure_ascii=False, indent=2), "utf-8")
        os.replace(tmp, STORE_PATH)

        # Le fichier contient un secret : lisible par le propriétaire seul.
        try:
            os.chmod(STORE_PATH, 0o600)
        except OSError:
            pass  # système de fichiers sans permissions POSIX (Windows)

    return current


def public_config() -> dict[str, Any]:
    """
    Configuration expurgée, sûre à envoyer à la télécommande.

    Le secret n'est jamais transmis : on indique seulement s'il est renseigné.
    """
    data = load()
    return {
        "client_id": data["client_id"],
        "redirect_uri": data["redirect_uri"],
        "has_secret": bool(data["client_secret"]),
        "device_id": data["device_id"],
        "market": data["market"],
    }


def is_configured() -> bool:
    """True si les identifiants de l'application Spotify sont renseignés."""
    data = load()
    return bool(data["client_id"] and data["client_secret"] and data["redirect_uri"])


def is_connected() -> bool:
    """True si un compte utilisateur a autorisé l'application."""
    return bool(load()["refresh_token"])


def clear_tokens() -> None:
    """Déconnecte le compte (les identifiants de l'app sont conservés)."""
    save(refresh_token="", access_token="", expires_at=0, device_id="")
