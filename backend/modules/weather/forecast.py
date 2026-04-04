"""
Récupère et formate les prévisions météo depuis Open-Meteo.

Open-Meteo est 100 % gratuit et ne nécessite aucune clé API.
"""

import urllib.request
import urllib.parse
import json
from datetime import datetime

from core.logger import get_logger

log = get_logger(__name__)

# Toulouse
LATITUDE = 43.6047
LONGITUDE = 1.4442
CITY = "Toulouse"

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# WMO Weather interpretation codes → description française
WMO_CODES: dict[int, str] = {
    0: "ciel dégagé",
    1: "principalement dégagé",
    2: "partiellement nuageux",
    3: "couvert",
    45: "brouillard",
    48: "brouillard givrant",
    51: "bruine légère",
    53: "bruine modérée",
    55: "bruine dense",
    56: "bruine verglaçante légère",
    57: "bruine verglaçante dense",
    61: "pluie légère",
    63: "pluie modérée",
    65: "pluie forte",
    66: "pluie verglaçante légère",
    67: "pluie verglaçante forte",
    71: "chute de neige légère",
    73: "chute de neige modérée",
    75: "chute de neige forte",
    77: "grains de neige",
    80: "averses légères",
    81: "averses modérées",
    82: "averses violentes",
    85: "averses de neige légères",
    86: "averses de neige fortes",
    95: "orage",
    96: "orage avec grêle légère",
    99: "orage avec grêle forte",
}

# Codes WMO considérés comme "averses / pluie"
RAIN_CODES = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99}


def _fetch_json(url: str) -> dict:
    """GET synchrone simple (pas besoin de requests pour un seul appel)."""
    req = urllib.request.Request(url, headers={"User-Agent": "HoloProject/1.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def _rain_ranges(hourly_codes: list[int], hourly_times: list[str]) -> list[tuple[int, int]]:
    """
    Détecte les plages horaires de pluie/averses à partir des codes WMO horaires.
    Retourne une liste de tuples (heure_début, heure_fin).
    """
    ranges: list[tuple[int, int]] = []
    in_rain = False
    start_h = 0

    for i, code in enumerate(hourly_codes):
        hour = int(hourly_times[i].split("T")[1].split(":")[0])
        if code in RAIN_CODES:
            if not in_rain:
                in_rain = True
                start_h = hour
        else:
            if in_rain:
                in_rain = False
                ranges.append((start_h, hour))

    # Pluie qui dure jusqu'à la fin de la journée
    if in_rain:
        ranges.append((start_h, 24))

    return ranges


def _format_rain_text(ranges: list[tuple[int, int]]) -> str:
    """Formate les plages de pluie en texte français."""
    if not ranges:
        return ""
    parts = [f"entre {s}h et {e}h" for s, e in ranges]
    return "Averses " + " puis ".join(parts) + "."


def fetch_forecast() -> dict:
    """
    Interroge Open-Meteo et retourne les données brutes du jour
    (code météo global, T min/max, codes horaires).
    """
    params = urllib.parse.urlencode({
        "latitude": LATITUDE,
        "longitude": LONGITUDE,
        "daily": "weather_code,temperature_2m_max,temperature_2m_min",
        "hourly": "weather_code",
        "timezone": "Europe/Paris",
        "forecast_days": 1,
    })
    url = f"{OPEN_METEO_URL}?{params}"
    log.info("Open-Meteo → %s", url)
    return _fetch_json(url)


def get_forecast() -> dict:
    """
    Récupère la météo du jour et retourne un dict avec :
      - text : texte complet pour le TTS
      - description : météo globale
      - t_min / t_max : températures
      - rain_text : texte des averses (ou "")
      - overlay : texte court pour l'overlay hologramme
    """
    data = fetch_forecast()

    daily = data["daily"]
    weather_code = daily["weather_code"][0]
    t_min = round(daily["temperature_2m_min"][0])
    t_max = round(daily["temperature_2m_max"][0])

    description = WMO_CODES.get(weather_code, "conditions indéterminées")

    # Plages de pluie
    hourly_codes = data["hourly"]["weather_code"]
    hourly_times = data["hourly"]["time"]
    rain_ranges = _rain_ranges(hourly_codes, hourly_times)
    rain_text = _format_rain_text(rain_ranges)

    # Texte TTS complet
    parts = [
        f"Voici la météo du jour à {CITY}.",
        f"{description.capitalize()}, températures annoncées entre {t_min}° et {t_max}°.",
    ]
    if rain_text:
        parts.append(rain_text)
    parts.append("Passez une bonne journée.")
    text = " ".join(parts)

    # Texte court pour l'overlay hologramme
    overlay = f"{description.capitalize()} — {t_min}° / {t_max}°"
    if rain_text:
        overlay += f"\n{rain_text}"

    log.info("Météo TTS : %s", text)

    return {
        "text": text,
        "description": description,
        "t_min": t_min,
        "t_max": t_max,
        "rain_text": rain_text,
        "overlay": overlay,
    }


def get_forecast_text() -> str:
    """Raccourci : retourne uniquement le texte TTS."""
    return get_forecast()["text"]
