"""
Pydantic models enforcing the exact JSON contracts from the spec.
Every LLM response is validated here before reaching the frontend.
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum


# ── Enums ──────────────────────────────────────────────────────────
class ImageQuality(str, Enum):
    clear = "clear"
    partial_cloud = "partial_cloud"
    low_resolution = "low_resolution"
    unusable = "unusable"


class Confidence(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class Effort(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


# ── Stage D: Vision analysis output ───────────────────────────────
class LandCover(BaseModel):
    vegetation_pct: Optional[int] = None
    water_pct: Optional[int] = None
    built_pct: Optional[int] = None
    bare_pct: Optional[int] = None


class VisionAnalysis(BaseModel):
    land_cover: Optional[LandCover] = None
    landmarks: Optional[List[str]] = Field(default_factory=list)
    image_quality: ImageQuality = ImageQuality.clear
    confidence: Confidence = Confidence.medium
    caveat: Optional[str] = None


# ── Stage E: Synthesis output ─────────────────────────────────────
class ActionItem(BaseModel):
    action: str
    why_local: str
    effort: Effort = Effort.medium


class SynthesisResult(BaseModel):
    area_profile: str
    top_actions: List[ActionItem] = Field(default_factory=list)
    responsible_ai_notes: str = ""
    confidence: Confidence = Confidence.medium


# ── Stage C: Weather data ─────────────────────────────────────────
class WeatherData(BaseModel):
    temperature_c: Optional[float] = None
    feels_like_c: Optional[float] = None
    wind_speed_kmh: Optional[float] = None
    wind_direction_deg: Optional[float] = None
    pm2_5: Optional[float] = None
    pm10: Optional[float] = None
    conditions: Optional[str] = None
    humidity_pct: Optional[float] = None
    retrieved_at: Optional[str] = None


# ── Stage C: Emitter entry ────────────────────────────────────────
class EmitterEntry(BaseModel):
    name: str = "Unknown"
    sector: str = "Unknown"
    distance_km: float = 0.0
    emissions_tons_co2e: float = 0.0


# ── Request / Response envelope ───────────────────────────────────
class AnalyzeRequest(BaseModel):
    lat: float
    lon: float
    radius_km: float = 15.0


class AnalyzeResponse(BaseModel):
    lat: float
    lon: float
    location_label: str = ""
    satellite_image_url: str = ""
    weather: Optional[WeatherData] = None
    emitters: List[EmitterEntry] = Field(default_factory=list)
    vision: Optional[VisionAnalysis] = None
    synthesis: Optional[SynthesisResult] = None
    errors: List[str] = Field(default_factory=list)
    data_retrieved_at: str = ""
