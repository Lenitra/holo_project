"""
Module météo — récupère les prévisions via Open-Meteo (gratuit, sans clé API)
et génère un texte TTS formaté en français.
"""

from modules.weather.forecast import get_forecast, get_forecast_text
from modules.weather.handler import register

__all__ = ["get_forecast", "get_forecast_text", "register"]
