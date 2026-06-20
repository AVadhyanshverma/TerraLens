import pytest
from server.backend.weather import _wmo_to_text, fetch_weather
from server.backend.schemas import WeatherData

def test_wmo_to_text():
    assert _wmo_to_text(0) == "Clear sky"
    assert _wmo_to_text(61) == "Slight rain"
    assert _wmo_to_text(999) == "WMO code 999"

@pytest.mark.asyncio
async def test_fetch_weather_fallback(monkeypatch):
    # If network fails, should return empty with timestamp
    async def mock_fail(*args, **kwargs):
        raise Exception("Network Error")
    
    monkeypatch.setattr("backend.weather._fetch_open_meteo", mock_fail)
    monkeypatch.setattr("backend.weather._fetch_openweathermap", mock_fail)
    
    result = await fetch_weather(37.7749, -122.4194)
    assert isinstance(result, WeatherData)
    assert result.temperature_c is None
    assert result.retrieved_at is not None
