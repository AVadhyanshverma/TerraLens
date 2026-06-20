"""
Stage C (part 2) — ClimateTrace emissions scanner.
Based on the reference script with two required fixes:
  1. Guard against null centroid coordinates.
  2. Request timeout + in-memory bbox cache.
"""
import logging
from math import radians, cos, sin, asin, sqrt
from typing import List, Dict, Any

import httpx

from server.backend.schemas import EmitterEntry

logger = logging.getLogger(__name__)

# ── In-memory cache keyed by (rounded bbox string) ────────────────
_bbox_cache: Dict[str, List[Dict[str, Any]]] = {}


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in km."""
    R = 6371.0
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    )
    return 2 * R * asin(sqrt(a))


async def scan_local_emissions(
    target_lat: float,
    target_lon: float,
    radius_km: float = 15,
    year: int = 2023,
) -> List[EmitterEntry]:
    """
    Query ClimateTrace for emitting assets within radius_km of target.
    Returns sorted list of EmitterEntry (closest first).
    """
    offset = radius_km / 100.0
    bbox = (
        f"{target_lon - offset:.4f},{target_lat - offset:.4f},"
        f"{target_lon + offset:.4f},{target_lat + offset:.4f}"
    )

    # Check cache
    cache_key = bbox
    if cache_key in _bbox_cache:
        logger.info(f"Emissions cache hit for bbox={bbox}")
        raw_assets = _bbox_cache[cache_key]
    else:
        raw_assets = await _fetch_from_climatetrace(bbox, year)
        _bbox_cache[cache_key] = raw_assets

    # Spatial filter
    local: List[EmitterEntry] = []
    for asset in raw_assets:
        centroid = asset.get("centroid") or {}
        asset_lat = centroid.get("latitude")
        asset_lon = centroid.get("longitude")

        # FIX #1: Guard against missing centroid coordinates
        if asset_lat is None or asset_lon is None:
            continue

        distance = haversine(target_lat, target_lon, asset_lat, asset_lon)
        if distance <= radius_km:
            local.append(
                EmitterEntry(
                    name=asset.get("name", "Unknown"),
                    sector=asset.get("sector", "Unknown"),
                    distance_km=round(distance, 2),
                    emissions_tons_co2e=asset.get("emissionsQuantity", 0),
                )
            )

    local.sort(key=lambda e: e.distance_km)
    logger.info(f"Found {len(local)} emitters within {radius_km}km")
    return local


async def _fetch_from_climatetrace(
    bbox: str, year: int
) -> List[Dict[str, Any]]:
    """Hit ClimateTrace admins → sources pipeline. Returns raw asset dicts."""
    all_assets: List[Dict[str, Any]] = []

    async with httpx.AsyncClient() as client:
        # Step 1: Resolve admin regions intersecting bbox
        admin_url = f"https://api.climatetrace.org/v7/admins?bbox={bbox}&level=2"
        try:
            # FIX #2: Request timeout
            admin_resp = await client.get(admin_url, timeout=15.0)
            admin_resp.raise_for_status()
            admin_data = admin_resp.json()
        except Exception as e:
            logger.error(f"ClimateTrace admins call failed: {e}")
            return []

        if not admin_data:
            logger.info("No admin regions found for bbox")
            return []

        logger.info(f"ClimateTrace: {len(admin_data)} admin region(s) for bbox")

        # Step 2: Pull sources from each region
        for region in admin_data:
            gadm_id = region.get("id")
            if not gadm_id:
                continue
            sources_url = (
                f"https://api.climatetrace.org/v7/sources"
                f"?gadmId={gadm_id}&year={year}&limit=10000"
            )
            try:
                sources_resp = await client.get(sources_url, timeout=15.0)
                sources_resp.raise_for_status()
                sources_data = sources_resp.json()
                if sources_data:
                    all_assets.extend(sources_data)
            except Exception as e:
                logger.warning(f"ClimateTrace sources for {gadm_id} failed: {e}")

    return all_assets
