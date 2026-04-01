from abc import ABC, abstractmethod
from pathlib import Path

from fastapi import APIRouter, FastAPI


BASE_DIR = Path(__file__).resolve().parent.parent.parent


class BaseModule(ABC):
    """Classe de base pour tous les modules Holo_Project."""

    name: str = ""

    def __init__(self, app: FastAPI, config: dict):
        self.app = app
        self.config = config
        self.router = APIRouter()
        self.register_routes()

    @abstractmethod
    def register_routes(self) -> None:
        """Enregistre les routes FastAPI du module sur self.router."""

    async def startup(self) -> None:
        """Hook appele au demarrage de l'application."""

    async def shutdown(self) -> None:
        """Hook appele a l'arret de l'application."""

    def get_db_path(self) -> Path:
        """Retourne le chemin vers le fichier SQLite du module."""
        return BASE_DIR / "data" / f"{self.name}.db"

    def get_data_dir(self) -> Path:
        """Retourne le dossier data/ du projet."""
        return BASE_DIR / "data"

    def get_media_dir(self) -> Path:
        """Retourne le dossier media/ du projet."""
        return BASE_DIR / "media"
