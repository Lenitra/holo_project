"""
Module Spotify — recherche de playlists, file d'attente et création de playlists.

S'appuie sur l'API Web Spotify avec le flux OAuth « Authorization Code » :
les identifiants de l'application (Client ID / Secret / Redirect URI) se
règlent depuis la page Spotify de la télécommande, puis l'utilisateur
autorise son compte une fois pour toutes.

Piloter la lecture (file d'attente, play/pause) nécessite un compte **Premium**
et un appareil Spotify Connect actif.

Les identifiants et jetons sont stockés dans `backend/data/spotify.json`,
exclu du dépôt Git.
"""

from modules.spotify.handler import register

__all__ = ["register"]
