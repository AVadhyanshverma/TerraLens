import json
import math
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

BENCHMARKS_FILE = Path(__file__).resolve().parent.parent / "hatia_all_labels.json"

_benchmarks_data = []

def load_benchmarks():
    global _benchmarks_data
    if _benchmarks_data:
        return
    if not BENCHMARKS_FILE.exists():
        logger.warning(f"Benchmarks file not found: {BENCHMARKS_FILE}")
        return
    
    try:
        with open(BENCHMARKS_FILE, "r", encoding="utf-8") as f:
            raw_data = json.load(f)
            for el in raw_data.get("elements", []):
                tags = el.get("tags", {})
                name = tags.get("name") or tags.get("name:en")
                if name and "lat" in el and "lon" in el:
                    _benchmarks_data.append({
                        "name": name,
                        "lat": el["lat"],
                        "lon": el["lon"]
                    })
        logger.info(f"Loaded {len(_benchmarks_data)} benchmarks from JSON.")
    except Exception as e:
        logger.error(f"Failed to load benchmarks: {e}")

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def get_benchmarks(lat: float, lon: float, radius_km: float, max_limit: int = 1000) -> list[str]:
    load_benchmarks()
    
    results = []
    for b in _benchmarks_data:
        d = haversine(lat, lon, b["lat"], b["lon"])
        if d <= radius_km:
            results.append((d, b["name"]))
    
    # Sort by distance
    results.sort(key=lambda x: x[0])
    
    seen = set()
    final_names = []
    for d, name in results:
        if name not in seen:
            seen.add(name)
            final_names.append(name)
            if len(final_names) >= max_limit:
                break
                
    return final_names
