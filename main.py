import importlib
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import yaml
from fastapi import FastAPI

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("holo")

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.yaml"


def load_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_modules(app: FastAPI, config: dict) -> dict:
    """Charge dynamiquement les modules actives dans config.yaml."""
    modules = {}
    for name, module_conf in config.get("modules", {}).items():
        # module_conf peut etre True/False ou un dict avec "enabled"
        if isinstance(module_conf, dict):
            if not module_conf.get("enabled", False):
                continue
        elif not module_conf:
            continue
        try:
            mod = importlib.import_module(f"modules.{name}.{name}_module")
            cls = getattr(mod, f"{name.capitalize()}Module")
            instance = cls(app=app, config=config)
            modules[name] = instance
            app.include_router(instance.router, prefix=f"/api/{name}", tags=[name])
            logger.info("Module '%s' loaded", name)
        except Exception:
            logger.exception("Failed to load module '%s'", name)
    return modules


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    config = load_config()
    app.state.modules = load_modules(app, config)

    for name, module in app.state.modules.items():
        await module.startup()
        logger.info("Module '%s' started", name)

    yield

    # --- Shutdown ---
    for name, module in app.state.modules.items():
        await module.shutdown()
        logger.info("Module '%s' stopped", name)


app = FastAPI(
    title="Holo_Project",
    description="Serveur domestique avec interface holographique",
    lifespan=lifespan,
)


@app.get("/")
async def root():
    modules = list(app.state.modules.keys()) if hasattr(app.state, "modules") else []
    return {"status": "ok", "modules": modules}


if __name__ == "__main__":
    import uvicorn

    config = load_config()
    server = config.get("server", {})
    uvicorn.run(
        "main:app",
        host=server.get("host", "0.0.0.0"),
        port=server.get("port", 8000),
        reload=server.get("debug", False),
    )
