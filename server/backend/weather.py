"""
Stage C (part 1) — Weather & air quality fetch.
Uses Open-Meteo (no API key required) as the primary source.
Falls back to OpenWeatherMap free tier if OPENWEATHER_API_KEY is set.
"""
import os
import logging
from datetime import datetime, timezone

import httpx

from server.backend.schemas import WeatherData

logger = logging.getLogger(__name__)


async def fetch_weather(lat: float, lon: float) -> WeatherData:
    """
    Fetch current weather + air quality for a coordinate.
    Primary: Open-Meteo (free, no key).
    Fallback: OpenWeatherMap (requires OPENWEATHER_API_KEY env var).
    """
    try:
        return await _fetch_open_meteo(lat, lon)
    except Exception as e:
        logger.warning(f"Open-Meteo failed: {e}")

    # Fallback to OpenWeatherMap if key is available
    owm_key = os.environ.get("OPENWEATHER_API_KEY")
    if owm_key:
        try:
            return await _fetch_openweathermap(lat, lon, owm_key)
        except Exception as e:
            logger.warning(f"OpenWeatherMap failed: {e}")

    # Return empty weather data with timestamp
    return WeatherData(retrieved_at=datetime.now(timezone.utc).isoformat())


async def _fetch_open_meteo(lat: float, lon: float) -> WeatherData:
    """Pull from Open-Meteo weather + air-quality endpoints."""
    async with httpx.AsyncClient() as client:
        # Weather
        weather_resp = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,apparent_temperature,wind_speed_10m,"
                           "wind_direction_10m,relative_humidity_2m,weather_code",
            },
            timeout=10.0,
        )
        weather_resp.raise_for_status()
        w = weather_resp.json().get("current", {})

        # Air quality
        aq_resp = await client.get(
            "https://air-quality-api.open-meteo.com/v1/air-quality",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "pm10,pm2_5",
            },
            timeout=10.0,
        )
        aq_resp.raise_for_status()
        aq = aq_resp.json().get("current", {})

    # Map WMO weather codes to human-readable conditions
    wmo_code = w.get("weather_code")
    conditions = _wmo_to_text(wmo_code) if wmo_code is not None else None

    return WeatherData(
        temperature_c=w.get("temperature_2m"),
        feels_like_c=w.get("apparent_temperature"),
        wind_speed_kmh=w.get("wind_speed_10m"),
        wind_direction_deg=w.get("wind_direction_10m"),
        humidity_pct=w.get("relative_humidity_2m"),
        pm2_5=aq.get("pm2_5"),
        pm10=aq.get("pm10"),
        conditions=conditions,
        retrieved_at=datetime.now(timezone.utc).isoformat(),
    )


async def _fetch_openweathermap(
    lat: float, lon: float, api_key: str
) -> WeatherData:
    """Pull from OpenWeatherMap free-tier current weather endpoint."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={
                "lat": lat,
                "lon": lon,
                "appid": api_key,
                "units": "metric",
            },
            timeout=10.0,
        )
        resp.raise_for_status()
        data = resp.json()

    main = data.get("main", {})
    wind = data.get("wind", {})
    weather_desc = data.get("weather", [{}])[0].get("description", "")

    return WeatherData(
        temperature_c=main.get("temp"),
        feels_like_c=main.get("feels_like"),
        wind_speed_kmh=(wind.get("speed", 0) * 3.6),  # m/s → km/h
        wind_direction_deg=wind.get("deg"),
        humidity_pct=main.get("humidity"),
        conditions=weather_desc,
        retrieved_at=datetime.now(timezone.utc).isoformat(),
    )


def _wmo_to_text(code: int) -> str:
    """Convert WMO weather code to human-readable text."""
    mapping = {
        0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy",
        3: "Overcast", 45: "Foggy", 48: "Depositing rime fog",
        51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
        61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
        71: "Slight snowfall", 73: "Moderate snowfall", 75: "Heavy snowfall",
        80: "Slight rain showers", 81: "Moderate rain showers",
        82: "Violent rain showers", 95: "Thunderstorm",
        96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
    }
    return mapping.get(code, f"WMO code {code}")
