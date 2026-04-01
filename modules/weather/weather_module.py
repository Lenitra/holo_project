import logging

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response

from modules.core.base_module import BaseModule
from modules.tts.tts_service import text_to_speech


logger = logging.getLogger(__name__)

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


class WeatherModule(BaseModule):
    """Module météo — données du jour via Open-Meteo (gratuit, sans clé API)."""

    name = "weather"

    def __init__(self, app: FastAPI, config: dict):
        self._client = httpx.AsyncClient(timeout=10)
        module_conf = config.get("modules", {}).get("weather", {})
        self._default_location = module_conf.get("default_location", "Paris") if isinstance(module_conf, dict) else "Paris"
        super().__init__(app, config)

    def register_routes(self) -> None:
        @self.router.get("/today")
        async def today(location: str = Query(None, description="Nom de la ville (ex: Paris, Lyon)")):
            location = location or self._default_location
            return await self._get_today(location)

        @self.router.get("/summary")
        async def summary(location: str = Query(None, description="Nom de la ville (ex: Paris, Lyon)")):
            location = location or self._default_location
            data = await self._get_today(location)
            return {"location": data["location"], "summary": _build_summary(data)}

        @self.router.get("/summary/audio")
        async def summary_audio(location: str = Query(None, description="Nom de la ville (ex: Paris, Lyon)")):
            location = location or self._default_location
            data = await self._get_today(location)
            summary_text = _build_summary(data)
            audio = text_to_speech(summary_text)
            return Response(content=audio, media_type="audio/wav")

    async def _get_today(self, location: str) -> dict:
        coords = await self._geocode(location)
        forecast = await self._fetch_forecast(coords["latitude"], coords["longitude"])
        return {
            "location": coords["name"],
            "country": coords.get("country", ""),
            "latitude": coords["latitude"],
            "longitude": coords["longitude"],
            "forecast": forecast,
        }

    async def _geocode(self, city: str) -> dict:
        """Convertit un nom de ville en coordonnées via Open-Meteo Geocoding."""
        resp = await self._client.get(GEOCODING_URL, params={"name": city, "count": 1, "language": "fr"})
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results")
        if not results:
            raise HTTPException(status_code=404, detail=f"Ville '{city}' introuvable")
        return results[0]

    async def _fetch_forecast(self, lat: float, lon: float) -> dict:
        """Récupère la météo du jour (horaire + résumé journalier)."""
        params = {
            "latitude": lat,
            "longitude": lon,
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,weathercode",
            "hourly": "temperature_2m,weathercode,precipitation,windspeed_10m",
            "timezone": "auto",
            "forecast_days": 1,
        }
        resp = await self._client.get(FORECAST_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

        daily = data.get("daily", {})
        hourly = data.get("hourly", {})

        return {
            "daily": {
                "temperature_max": daily["temperature_2m_max"][0],
                "temperature_min": daily["temperature_2m_min"][0],
                "precipitation_mm": daily["precipitation_sum"][0],
                "windspeed_max_kmh": daily["windspeed_10m_max"][0],
                "weathercode": daily["weathercode"][0],
                "description": _weathercode_to_text(daily["weathercode"][0]),
            },
            "hourly": [
                {
                    "time": hourly["time"][i],
                    "temperature": hourly["temperature_2m"][i],
                    "precipitation_mm": hourly["precipitation"][i],
                    "windspeed_kmh": hourly["windspeed_10m"][i],
                    "weathercode": hourly["weathercode"][i],
                    "description": _weathercode_to_text(hourly["weathercode"][i]),
                }
                for i in range(len(hourly["time"]))
            ],
        }

    async def shutdown(self) -> None:
        await self._client.aclose()


WMO_CODES = {
    0: "Ciel dégagé",
    1: "Principalement dégagé",
    2: "Partiellement nuageux",
    3: "Couvert",
    45: "Brouillard",
    48: "Brouillard givrant",
    51: "Bruine légère",
    53: "Bruine modérée",
    55: "Bruine dense",
    61: "Pluie légère",
    63: "Pluie modérée",
    65: "Pluie forte",
    71: "Neige légère",
    73: "Neige modérée",
    75: "Neige forte",
    80: "Averses légères",
    81: "Averses modérées",
    82: "Averses violentes",
    95: "Orage",
    96: "Orage avec grêle légère",
    99: "Orage avec grêle forte",
}


def _weathercode_to_text(code: int) -> str:
    return WMO_CODES.get(code, "Inconnu")


def _build_summary(data: dict) -> str:
    """Construit une phrase résumant la météo du jour."""
    location = data["location"]
    daily = data["forecast"]["daily"]
    hourly = data["forecast"]["hourly"]

    t_min = daily["temperature_min"]
    t_max = daily["temperature_max"]
    description = daily["description"].lower()
    precip = round(daily["precipitation_mm"])
    wind = daily["windspeed_max_kmh"]

    # Trouver les périodes de pluie
    periodes_pluie = []
    en_pluie = False
    debut = None
    for h in hourly:
        if h["precipitation_mm"] > 0:
            if not en_pluie:
                debut = int(h["time"].split("T")[1].split(":")[0])
                en_pluie = True
        else:
            if en_pluie:
                fin = int(h["time"].split("T")[1].split(":")[0])
                periodes_pluie.append(f"{debut}h-{fin}h")
                en_pluie = False
    if en_pluie:
        fin = 23
        periodes_pluie.append(f"{debut}h-{fin}h")

    # Construction de la phrase
    phrase = f"Aujourd'hui à {location}, {description} avec des températures entre {t_min}° et {t_max}°."

    if precip > 0 and periodes_pluie:
        phrase += f" Précipitations de {precip} millimètres prévues ({', '.join(periodes_pluie)})."

    if wind > 50:
        phrase += f" Vent fort jusqu'à {wind} km/h."
    elif wind > 30:
        phrase += f" Vent modéré jusqu'à {wind} km/h."

    return phrase
