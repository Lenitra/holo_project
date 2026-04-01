import logging

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from modules.core.base_module import BaseModule
from .tts_service import configure, text_to_speech


logger = logging.getLogger(__name__)


class TTSRequest(BaseModel):
    text: str


class TtsModule(BaseModule):
    """Module TTS — convertit du texte en audio WAV (100% local)."""

    name = "tts"

    def __init__(self, app: FastAPI, config: dict):
        module_conf = config.get("modules", {}).get("tts", {})
        if isinstance(module_conf, dict):
            configure(rate=module_conf.get("rate", 150))
        super().__init__(app, config)

    def register_routes(self) -> None:
        @self.router.post("/speak")
        async def speak(req: TTSRequest):
            if not req.text.strip():
                raise HTTPException(status_code=400, detail="Le texte ne peut pas etre vide")

            audio = text_to_speech(req.text)
            return Response(content=audio, media_type="audio/wav")
