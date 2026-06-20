"""
Local Climate Action Assistant — FastAPI backend.
Orchestrates the 5-stage pipeline:
  A: Location capture (frontend)
  B: Satellite tile fetch & stitch
  C: Weather + ClimateTrace emissions (parallel)
  D: Vision analysis (NVIDIA NIM)
  E: Synthesis (NVIDIA NIM with fallback)
"""
import asyncio
import base64
import logging
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from server.backend.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    WeatherData,
)
from server.backend.tiles import fetch_composite
from server.backend.weather import fetch_weather
from server.backend.emissions import scan_local_emissions
from server.backend.llm import analyze_image, synthesize
from server.backend.benchmarks import get_benchmarks

# ── Logging ────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── App ────────────────────────────────────────────────────────────
app = FastAPI(
    title="Local Climate Action Assistant",
    description="Satellite-grounded, locally-actionable climate profiles",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend static files
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=FRONTEND_DIR / "static"), name="static")


@app.get("/")
async def serve_index():
    """Serve the main frontend page."""
    return FileResponse(FRONTEND_DIR / "index.html")


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze_location(req: AnalyzeRequest):
    """
    Full 5-stage pipeline: tile fetch → weather+emissions → vision → synthesis.
    """
    errors: list[str] = []
    timestamp = datetime.now(timezone.utc).isoformat()
    location_label = f"{req.lat:.4f}, {req.lon:.4f}"

    logger.info(f"=== Analysis started for {location_label} (r={req.radius_km}km) ===")
    logger.debug(f"Request payload: {req.model_dump_json()}")

    # ── Stage B: Satellite imagery ─────────────────────────────────
    logger.info("Stage B: Fetching satellite tiles...")
    try:
        image_bytes = await fetch_composite(req.lat, req.lon, zoom=14, grid=3)
        logger.debug(f"Fetched {len(image_bytes)} bytes of satellite imagery.")
        satellite_b64 = base64.b64encode(image_bytes).decode("utf-8")
        satellite_image_url = f"data:image/png;base64,{satellite_b64}"
        logger.info(f"Stage B complete: {len(image_bytes)} bytes")
    except Exception as e:
        logger.error(f"Stage B failed: {e}")
        errors.append(f"Satellite imagery unavailable: {e}")
        image_bytes = None
        satellite_image_url = ""

    # ── Stage C: Weather + Emissions (parallel) ────────────────────
    logger.info("Stage C: Fetching weather + emissions in parallel...")
    weather_task = fetch_weather(req.lat, req.lon)
    emissions_task = scan_local_emissions(req.lat, req.lon, req.radius_km)

    weather_data, emitters = await asyncio.gather(
        weather_task, emissions_task, return_exceptions=True
    )

    if isinstance(weather_data, Exception):
        logger.error(f"Weather fetch failed: {weather_data}")
        errors.append(f"Weather data unavailable: {weather_data}")
        weather_data = WeatherData(retrieved_at=timestamp)

    if isinstance(emitters, Exception):
        logger.error(f"Emissions scan failed: {emitters}")
        errors.append(f"Emissions data unavailable: {emitters}")
        emitters = []

    logger.info(
        f"Stage C complete: weather={'ok' if weather_data.temperature_c else 'partial'}, "
        f"emitters={len(emitters)}"
    )

    # ── Stage D: Vision analysis ───────────────────────────────────
    vision_result = None
    if image_bytes:
        logger.info("Stage D: Running vision analysis...")
        try:
            vision_result = analyze_image(image_bytes)
            logger.info(f"Stage D complete: quality={vision_result.image_quality}, confidence={vision_result.confidence}")
        except Exception as e:
            logger.error(f"Stage D failed: {e}")
            errors.append(f"Vision analysis failed: {e}")

    if vision_result is None:
        from server.backend.schemas import VisionAnalysis
        vision_result = VisionAnalysis()
        
    logger.info("Injecting local benchmarks from JSON...")
    vision_result.landmarks = get_benchmarks(req.lat, req.lon, req.radius_km, max_limit=1000)

    # ── Stage E: Synthesis ─────────────────────────────────────────
    synthesis_result = None
    logger.info("Stage E: Running synthesis...")
    try:
        land_cover_dict = vision_result.model_dump() if vision_result else {}
        weather_dict = weather_data.model_dump() if weather_data else {}
        emitters_list = [e.model_dump() for e in emitters] if emitters else []

        synthesis_result = synthesize(
            land_cover_analysis=land_cover_dict,
            weather_current=weather_dict,
            nearby_emitters=emitters_list,
            location_label=location_label,
        )
        logger.info(f"Stage E complete: confidence={synthesis_result.confidence}")
    except Exception as e:
        logger.error(f"Stage E failed: {e}")
        errors.append(f"Synthesis failed: {e}")

    # ── Build response ─────────────────────────────────────────────
    response = AnalyzeResponse(
        lat=req.lat,
        lon=req.lon,
        location_label=location_label,
        satellite_image_url=satellite_image_url,
        weather=weather_data if not isinstance(weather_data, Exception) else None,
        emitters=emitters if not isinstance(emitters, Exception) else [],
        vision=vision_result,
        synthesis=synthesis_result,
        errors=errors,
        data_retrieved_at=timestamp,
    )

    logger.info(f"=== Analysis complete for {location_label} ({len(errors)} errors) ===")
    return response


@app.get("/api/health")
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}
