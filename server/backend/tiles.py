"""
Stage B — Satellite tile fetch & stitch.
Converts lat/lon to slippy-map tile coordinates, pulls a grid of tiles,
and stitches them into one composite image with Pillow.
"""
from __future__ import annotations
import math
import io
import logging
from typing import Tuple

import httpx

try:
    from PIL import Image
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False

logger = logging.getLogger(__name__)

TILE_SIZE = 256  # standard Web Mercator tile pixel size

# ── Tile sources ───────────────────────────────────────────────────
GOOGLE_HYBRID = "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
ESRI_IMAGERY = (
    "https://server.arcgisonline.com/ArcGIS/rest/services/"
    "World_Imagery/MapServer/tile/{z}/{y}/{x}"
)

# Headers to prevent 403s from tile servers
TILE_HEADERS = {
    "User-Agent": "ClimateActionAssistant/1.0 (educational project)",
    "Referer": "https://localhost",
}


def lat_lon_to_tile(lat: float, lon: float, zoom: int) -> Tuple[int, int]:
    """Convert lat/lon to slippy-map tile x/y at given zoom level."""
    lat_rad = math.radians(lat)
    n = 2 ** zoom
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


async def fetch_tile(
    client: httpx.AsyncClient,
    url_template: str,
    x: int,
    y: int,
    z: int,
) -> Image.Image | None:
    """Fetch a single tile, return as PIL Image or None on failure."""
    url = url_template.format(x=x, y=y, z=z)
    try:
        resp = await client.get(url, headers=TILE_HEADERS, timeout=10.0)
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content))
    except Exception as e:
        logger.warning(f"Tile fetch failed ({x},{y},{z}): {e}")
        return None


async def fetch_composite(
    lat: float,
    lon: float,
    zoom: int = 14,
    grid: int = 3,
) -> bytes:
    """
    Fetch a grid×grid tile mosaic centered on lat/lon.
    Returns the stitched image as PNG bytes.

    Falls back from Google Hybrid → Esri if Google tiles fail.
    If Pillow is not installed, returns a single center tile as-is.
    """
    cx, cy = lat_lon_to_tile(lat, lon, zoom)

    # ── No-Pillow fallback: fetch single center tile ──────────────
    if not HAS_PILLOW:
        logger.warning("Pillow not installed — returning single center tile")
        async with httpx.AsyncClient() as client:
            for source_name, url_template in [
                ("Google Hybrid", GOOGLE_HYBRID),
                ("Esri Imagery", ESRI_IMAGERY),
            ]:
                url = url_template.format(x=cx, y=cy, z=zoom)
                try:
                    resp = await client.get(url, headers=TILE_HEADERS, timeout=10.0)
                    resp.raise_for_status()
                    logger.info(f"Single tile fetched from {source_name}")
                    return resp.content
                except Exception as e:
                    logger.warning(f"Single tile from {source_name} failed: {e}")
        # 1x1 transparent PNG placeholder
        return _minimal_png()

    # ── Full Pillow stitching path ────────────────────────────────
    half = grid // 2

    async with httpx.AsyncClient() as client:
        # Try Google first, then Esri
        for source_name, url_template in [
            ("Google Hybrid", GOOGLE_HYBRID),
            ("Esri Imagery", ESRI_IMAGERY),
        ]:
            composite = Image.new("RGB", (TILE_SIZE * grid, TILE_SIZE * grid))
            success_count = 0

            for dy in range(-half, half + 1):
                for dx in range(-half, half + 1):
                    tile_img = await fetch_tile(
                        client, url_template, cx + dx, cy + dy, zoom
                    )
                    if tile_img:
                        px = (dx + half) * TILE_SIZE
                        py = (dy + half) * TILE_SIZE
                        # Convert to RGB if necessary (some tiles are RGBA/P)
                        if tile_img.mode != "RGB":
                            tile_img = tile_img.convert("RGB")
                        composite.paste(tile_img, (px, py))
                        success_count += 1

            # If we got at least half the tiles, consider it a success
            if success_count >= (grid * grid) // 2:
                logger.info(
                    f"Stitched {success_count}/{grid*grid} tiles from {source_name}"
                )
                buf = io.BytesIO()
                composite.save(buf, format="PNG")
                return buf.getvalue()
            else:
                logger.warning(
                    f"{source_name}: only {success_count}/{grid*grid} tiles — trying fallback"
                )

    # If all sources fail, return placeholder
    logger.error("All tile sources failed — returning placeholder")
    placeholder = Image.new("RGB", (TILE_SIZE * grid, TILE_SIZE * grid), (30, 30, 30))
    buf = io.BytesIO()
    placeholder.save(buf, format="PNG")
    return buf.getvalue()


def _minimal_png() -> bytes:
    """Return a tiny valid 1x1 dark PNG (no Pillow needed)."""
    import struct, zlib
    # 1x1 RGB PNG
    raw = b'\x00\x1e\x1e\x1e'  # filter byte + RGB
    compressed = zlib.compress(raw)
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', compressed)
        + chunk(b'IEND', b'')
    )

