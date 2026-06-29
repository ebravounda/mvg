"""Servicio de geocoding usando Nominatim (OpenStreetMap) — gratuito.

Provee:
- ``geocode_address`` para convertir una dirección textual en coords (lat, lng).
- ``haversine`` para calcular distancia (km) entre 2 puntos.
- ``nearest_neighbor_sort`` para ordenar puntos por proximidad (TSP greedy).

Nominatim tiene un rate limit recomendado de 1 req/s. Se incluye:
- Cache persistente en MongoDB (colección ``geocode_cache``).
- ``User-Agent`` obligatorio.
- Bloqueo asíncrono para serializar peticiones.
"""
from __future__ import annotations

import asyncio
import logging
import math
import os
from typing import Any, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "MVG-Computacion/1.0 (admin@mvg.cl)"
DEFAULT_COUNTRY = os.environ.get("GEOCODE_COUNTRY", "Chile")
DEFAULT_TIMEOUT = 12.0
MIN_INTERVAL_SEC = 1.05  # rate limit cumplimiento

_last_call_ts = 0.0
_lock = asyncio.Lock()


def _norm(s: Optional[str]) -> str:
    return (s or "").strip()


def build_address_query(
    direccion: Optional[str],
    comuna: Optional[str] = None,
    region: Optional[str] = None,
    pais: Optional[str] = None,
) -> str:
    parts = [_norm(direccion), _norm(comuna), _norm(region), _norm(pais) or DEFAULT_COUNTRY]
    return ", ".join(p for p in parts if p)


async def geocode_address(
    db: Any,
    direccion: Optional[str],
    comuna: Optional[str] = None,
    region: Optional[str] = None,
    pais: Optional[str] = None,
    *,
    use_cache: bool = True,
) -> Optional[Tuple[float, float, str]]:
    """Devuelve (lat, lng, display_name) o ``None`` si no se pudo geocodificar.

    - ``db``: instancia de Motor (puede ser ``None`` para deshabilitar cache).
    - Cache key: query exacto en minúsculas.
    """
    global _last_call_ts

    query = build_address_query(direccion, comuna, region, pais)
    if not query or len(query) < 4:
        return None

    cache_key = query.lower()

    # Lookup cache primero
    if use_cache and db is not None:
        try:
            cached = await db.geocode_cache.find_one({"query": cache_key})
            if cached:
                if cached.get("lat") is None:
                    return None  # cache de "no encontrado"
                return (
                    float(cached["lat"]),
                    float(cached["lng"]),
                    cached.get("display_name", query),
                )
        except Exception as e:
            logger.warning("[geocode] cache read err: %s", e)

    params = {
        "q": query,
        "format": "json",
        "limit": 1,
        "addressdetails": 0,
    }
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "es"}

    async with _lock:
        # rate-limit: esperar si la última llamada fue hace <1s
        loop = asyncio.get_event_loop()
        wait = MIN_INTERVAL_SEC - (loop.time() - _last_call_ts)
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
                r = await client.get(NOMINATIM_URL, params=params, headers=headers)
            _last_call_ts = loop.time()
            if r.status_code != 200:
                logger.warning(
                    "[geocode] HTTP %s for %s — body: %s",
                    r.status_code,
                    query,
                    r.text[:200],
                )
                return None
            data = r.json()
        except Exception as e:
            logger.warning("[geocode] req err for %r: %s", query, e)
            return None

    if not data:
        # cache miss negativo (24h aprox; usamos doc con lat=None)
        if use_cache and db is not None:
            try:
                await db.geocode_cache.update_one(
                    {"query": cache_key},
                    {"$set": {"query": cache_key, "lat": None, "lng": None}},
                    upsert=True,
                )
            except Exception:
                pass
        return None

    first = data[0]
    try:
        lat = float(first["lat"])
        lng = float(first["lon"])
        display = first.get("display_name", query)
    except (KeyError, ValueError, TypeError):
        return None

    if use_cache and db is not None:
        try:
            await db.geocode_cache.update_one(
                {"query": cache_key},
                {"$set": {
                    "query": cache_key,
                    "lat": lat,
                    "lng": lng,
                    "display_name": display,
                }},
                upsert=True,
            )
        except Exception as e:
            logger.warning("[geocode] cache write err: %s", e)

    return (lat, lng, display)


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distancia en kilómetros entre dos puntos GPS."""
    R = 6371.0  # radio Tierra km
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(min(1.0, math.sqrt(a)))


def nearest_neighbor_sort(
    start: Optional[Tuple[float, float]],
    points: List[dict],
    *,
    lat_key: str = "lat",
    lng_key: str = "lng",
) -> List[dict]:
    """Ordena ``points`` por vecino más cercano partiendo de ``start``.

    Puntos sin lat/lng se ponen al final preservando el orden original.
    """
    with_coords: List[dict] = []
    without_coords: List[dict] = []
    for p in points:
        lat = p.get(lat_key)
        lng = p.get(lng_key)
        if lat is not None and lng is not None:
            with_coords.append(p)
        else:
            without_coords.append(p)

    if not with_coords:
        return points  # nada que ordenar

    ordered: List[dict] = []
    remaining = list(with_coords)
    cursor = start

    while remaining:
        if cursor is None:
            # sin punto de partida → arrancar por el primero
            next_p = remaining.pop(0)
        else:
            cx, cy = cursor
            # min por distancia
            idx_min = 0
            d_min = haversine(cx, cy, remaining[0][lat_key], remaining[0][lng_key])
            for i in range(1, len(remaining)):
                d = haversine(cx, cy, remaining[i][lat_key], remaining[i][lng_key])
                if d < d_min:
                    d_min = d
                    idx_min = i
            next_p = remaining.pop(idx_min)
            next_p = {**next_p, "_dist_km_prev": round(d_min, 2)}
        ordered.append(next_p)
        cursor = (next_p[lat_key], next_p[lng_key])

    return ordered + without_coords
