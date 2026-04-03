"""
Logger simple — console uniquement, coloré par niveau.

Usage :
    from core.logger import get_logger
    log = get_logger(__name__)
    log.info("Serveur démarré")
"""

import logging
import os

_initialized = False


class _ColorFormatter(logging.Formatter):
    COLORS = {
        logging.DEBUG:    "\033[90m",
        logging.INFO:     "\033[94m",
        logging.WARNING:  "\033[93m",
        logging.ERROR:    "\033[91m",
        logging.CRITICAL: "\033[91;1m",
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelno, self.RESET)
        level = record.levelname.ljust(8)
        name = record.name.replace("backend.", "")
        return f"{color}{level}{self.RESET} │ {name} │ {record.getMessage()}"


def setup() -> None:
    """Configure le logging. À appeler une fois au démarrage."""
    global _initialized
    if _initialized:
        return

    level = getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper(), logging.INFO)

    root = logging.getLogger("backend")
    root.setLevel(level)

    handler = logging.StreamHandler()
    handler.setLevel(level)
    handler.setFormatter(_ColorFormatter())
    root.addHandler(handler)

    _initialized = True


def get_logger(name: str) -> logging.Logger:
    """Retourne un logger enfant de 'backend'."""
    if name.startswith("backend."):
        return logging.getLogger(name)
    return logging.getLogger(f"backend.{name}")
