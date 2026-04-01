import logging
import sys
import time

from fastapi import FastAPI

from .base_module import BaseModule


logger = logging.getLogger(__name__)


class CoreModule(BaseModule):
    """Module principal — endpoints systeme et sante du serveur."""

    name = "core"

    def __init__(self, app: FastAPI, config: dict):
        self._start_time = time.time()
        super().__init__(app, config)

    def register_routes(self) -> None:
        @self.router.get("/status")
        async def status():
            uptime = time.time() - self._start_time
            modules = list(self.app.state.modules.keys())
            return {
                "uptime_seconds": round(uptime, 1),
                "modules": modules,
                "python_version": sys.version,
            }

        @self.router.get("/health")
        async def health():
            return {"status": "ok"}

    async def startup(self) -> None:
        logger.info("Core module started")

    async def shutdown(self) -> None:
        logger.info("Core module stopped")
