"""
Suivi des avions visibles depuis un point d'observation.

Utilise l'API adsb.lol (100 % gratuite, sans clé) qui agrège les données
ADS-B communautaires. Le point d'observation, la direction du regard
(azimut), le champ de vision et le rayon sont configurables via
data/settings.json (clé "planes").

Par défaut, le point d'observation suit la ville météo.
"""

import json
import math
import os
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from core.logger import get_logger
from modules.weather.forecast import get_city

log = get_logger(__name__)

SETTINGS_PATH = Path(__file__).parent.parent.parent / "data" / "settings.json"

ADSB_URL = "https://api.adsb.lol/v2/point/{lat}/{lon}/{radius_nm}"
ROUTE_URL = "https://api.adsbdb.com/v0/callsign/{callsign}"
ROUTE_LOOKUP_MAX = 30      # nb max de résolutions de route par rafraîchissement
_ROUTE_CACHE_MAX = 1000
_route_cache: dict[str, dict | None] = {}  # callsign → {origin, destination} | None (inconnu)

NM_TO_KM = 1.852
FT_TO_M = 0.3048
KNOTS_TO_KMH = 1.852
API_MAX_RADIUS_NM = 250  # limite de l'API adsb.lol

# Valeurs par défaut (latitude/longitude à None → suit la ville météo)
_DEFAULT_CONFIG = {
    "latitude": None,
    "longitude": None,
    "azimuth": 180.0,   # direction du regard : 0=N, 90=E, 180=S, 270=O
    "fov": 120.0,       # ouverture du champ de vision en degrés
    "radius_km": 50.0,  # distance max de détection
}


# ── Settings ─────────────────────────────────────────────────────────

def _load_settings(strict: bool = False) -> dict:
    """
    Charge settings.json. En mode strict (avant réécriture), un fichier
    existant mais illisible lève une erreur au lieu de retourner {} :
    sinon la sauvegarde suivante écraserait les clés des autres modules.
    """
    if SETTINGS_PATH.exists():
        try:
            return json.loads(SETTINGS_PATH.read_text("utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            if strict:
                raise ValueError(f"settings.json illisible, modification refusée ({e})")
    return {}


def _save_settings(settings: dict) -> None:
    """Écriture atomique (temp + replace) : server.ts lit aussi ce fichier."""
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = SETTINGS_PATH.with_name(SETTINGS_PATH.name + ".tmp")
    tmp.write_text(json.dumps(settings, ensure_ascii=False, indent=2), "utf-8")
    os.replace(tmp, SETTINGS_PATH)


def _as_float(value, name: str) -> float:
    """Convertit en float en rejetant NaN/Infinity (corrompraient le JSON)."""
    f = float(value)
    if not math.isfinite(f):
        raise ValueError(f"{name} doit être un nombre fini")
    return f


def get_config() -> dict:
    """
    Retourne la configuration résolue :
      { latitude, longitude, azimuth, fov, radius_km, follows_city }
    Si latitude/longitude ne sont pas définies, le point d'observation
    est la ville météo (follows_city = true).
    """
    stored = _load_settings().get("planes", {})
    cfg = {**_DEFAULT_CONFIG, **{k: stored[k] for k in _DEFAULT_CONFIG if k in stored}}

    follows_city = cfg["latitude"] is None or cfg["longitude"] is None
    if follows_city:
        city = get_city()
        cfg["latitude"] = city["latitude"]
        cfg["longitude"] = city["longitude"]

    cfg["follows_city"] = follows_city
    return cfg


def set_config(payload: dict) -> dict:
    """
    Met à jour la configuration (champs optionnels : azimuth, fov,
    radius_km, latitude, longitude, use_city) et persiste.
    Retourne la configuration résolue.
    """
    settings = _load_settings(strict=True)
    stored = settings.get("planes", {})

    if payload.get("use_city"):
        stored["latitude"] = None
        stored["longitude"] = None
    elif "latitude" in payload and "longitude" in payload:
        stored["latitude"] = max(-90.0, min(90.0, _as_float(payload["latitude"], "latitude")))
        stored["longitude"] = max(-180.0, min(180.0, _as_float(payload["longitude"], "longitude")))

    if "azimuth" in payload:
        stored["azimuth"] = _as_float(payload["azimuth"], "azimuth") % 360.0
    if "fov" in payload:
        stored["fov"] = max(10.0, min(360.0, _as_float(payload["fov"], "fov")))
    if "radius_km" in payload:
        stored["radius_km"] = max(5.0, min(400.0, _as_float(payload["radius_km"], "radius_km")))

    settings["planes"] = stored
    _save_settings(settings)

    cfg = get_config()
    log.info(
        "Config avions → (%.4f, %.4f) azimut %.0f°, fov %.0f°, rayon %.0f km",
        cfg["latitude"], cfg["longitude"], cfg["azimuth"], cfg["fov"], cfg["radius_km"],
    )
    return cfg


# ── Géométrie ────────────────────────────────────────────────────────

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance en km entre deux points GPS."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Cap initial (0-360, 0=N) du point 1 vers le point 2."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return math.degrees(math.atan2(x, y)) % 360.0


def angle_diff(a: float, b: float) -> float:
    """Écart signé a - b ramené dans [-180, 180]."""
    return (a - b + 180.0) % 360.0 - 180.0


# ── Récupération des avions ─────────────────────────────────────────

def _fetch_json(url: str, timeout: float = 10) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "HoloProject/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def fetch_area(latitude: float, longitude: float, radius_km: float) -> dict:
    """Interroge adsb.lol pour tous les avions dans un rayon donné."""
    radius_nm = min(API_MAX_RADIUS_NM, math.ceil(radius_km / NM_TO_KM))
    url = ADSB_URL.format(lat=latitude, lon=longitude, radius_nm=radius_nm)
    log.info("adsb.lol → %s", url)
    return _fetch_json(url)


def _to_number(value) -> float | None:
    """Convertit une valeur API en nombre (alt_baro peut valoir 'ground')."""
    return float(value) if isinstance(value, (int, float)) else None


# ── Routes de vol (aéroports de départ / destination) ───────────────

def _airport_place(airport) -> dict | None:
    """Ville + pays d'un aéroport adsbdb (le front traduit le pays via l'ISO)."""
    if not isinstance(airport, dict):
        return None
    city = airport.get("municipality") or None
    country_iso = airport.get("country_iso_name") or None
    country = airport.get("country_name") or None
    if city is None and country is None:
        return None
    return {"city": city, "country_iso": country_iso, "country": country}


def _fetch_route(callsign: str) -> dict | None:
    """
    Interroge adsbdb pour un indicatif.
    Retourne {origin, destination} ou None si la route est inconnue
    (vols privés / indicatifs non commerciaux — réponse 404 ou
    "unknown callsign" selon les cas).
    """
    try:
        data = _fetch_json(ROUTE_URL.format(callsign=callsign), timeout=6)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    resp = data.get("response")
    if not isinstance(resp, dict):
        return None  # "unknown callsign"
    flightroute = resp.get("flightroute") or {}
    origin = _airport_place(flightroute.get("origin"))
    destination = _airport_place(flightroute.get("destination"))
    if origin is None and destination is None:
        return None
    return {"origin": origin, "destination": destination}


def _get_routes(callsigns: list[str]) -> dict[str, dict | None]:
    """
    Routes par indicatif, avec cache mémoire (une route ne change pas
    en cours de vol) et résolutions en parallèle. Un échec réseau n'est
    pas mis en cache (retenté au rafraîchissement suivant).
    """
    if len(_route_cache) > _ROUTE_CACHE_MAX:
        _route_cache.clear()

    missing = list(dict.fromkeys(cs for cs in callsigns if cs not in _route_cache))
    if missing:
        def worker(cs: str):
            try:
                return cs, _fetch_route(cs), True
            except Exception as e:
                log.warning("Route %s indisponible : %s", cs, e)
                return cs, None, False

        with ThreadPoolExecutor(max_workers=8) as pool:
            for cs, route, ok in pool.map(worker, missing):
                if ok:
                    _route_cache[cs] = route
        log.info("Routes résolues : %d indicatif(s)", len(missing))

    return {cs: _route_cache.get(cs) for cs in callsigns}


def get_visible_planes() -> dict:
    """
    Récupère les avions autour du point d'observation et calcule
    pour chacun distance, cap et présence dans le champ de vision.

    Retourne :
      - planes : liste triée par distance, chaque avion avec
        { hex, callsign, registration, type, distance_km, bearing,
          rel_bearing, track, speed_kmh, altitude_m, visible,
          origin, destination }
      - config : configuration résolue utilisée pour le calcul
    """
    cfg = get_config()
    data = fetch_area(cfg["latitude"], cfg["longitude"], cfg["radius_km"])

    half_fov = cfg["fov"] / 2.0
    planes: list[dict] = []

    for ac in data.get("ac", []):
        lat, lon = _to_number(ac.get("lat")), _to_number(ac.get("lon"))
        if lat is None or lon is None:
            continue
        # Les avions au sol ne sont pas visibles dans le ciel
        if ac.get("alt_baro") == "ground":
            continue

        # L'API fournit dst (NM) et dir depuis le point ; sinon on calcule
        distance_km = _to_number(ac.get("dst"))
        bearing = _to_number(ac.get("dir"))
        if distance_km is not None:
            distance_km *= NM_TO_KM
        else:
            distance_km = haversine_km(cfg["latitude"], cfg["longitude"], lat, lon)
        if bearing is None:
            bearing = bearing_deg(cfg["latitude"], cfg["longitude"], lat, lon)

        if distance_km > cfg["radius_km"]:
            continue

        rel_bearing = angle_diff(bearing, cfg["azimuth"])
        visible = cfg["fov"] >= 360.0 or abs(rel_bearing) <= half_fov

        speed = _to_number(ac.get("gs"))
        altitude = _to_number(ac.get("alt_baro"))

        planes.append({
            "hex": ac.get("hex", ""),
            "callsign": (ac.get("flight") or "").strip() or None,
            "registration": ac.get("r"),
            "type": ac.get("t"),
            "distance_km": round(distance_km, 1),
            "bearing": round(bearing) % 360,
            "rel_bearing": round(rel_bearing, 1),
            "track": _to_number(ac.get("track")),
            "speed_kmh": round(speed * KNOTS_TO_KMH) if speed is not None else None,
            "altitude_m": round(altitude * FT_TO_M) if altitude is not None else None,
            "visible": visible,
        })

    planes.sort(key=lambda p: p["distance_km"])

    # Aéroports de départ / destination (les plus proches d'abord, plafonné)
    callsigns = [p["callsign"] for p in planes[:ROUTE_LOOKUP_MAX] if p["callsign"]]
    routes = _get_routes(callsigns)
    for p in planes:
        route = routes.get(p["callsign"]) if p["callsign"] else None
        p["origin"] = route["origin"] if route else None
        p["destination"] = route["destination"] if route else None

    visible_count = sum(1 for p in planes if p["visible"])
    log.info("Avions : %d dans le rayon, %d dans le champ de vision", len(planes), visible_count)

    return {"planes": planes, "config": cfg}
