import pytest
from server.backend.emissions import haversine, scan_local_emissions
from server.backend.schemas import EmitterEntry
import math

def test_haversine():
    # Test identical points should be 0
    assert round(haversine(0, 0, 0, 0), 2) == 0.0
    
    # Test known distance: SF to LA ~559 km
    dist = haversine(37.7749, -122.4194, 34.0522, -118.2437)
    assert 550 < dist < 570

@pytest.mark.asyncio
async def test_scan_local_emissions_empty(monkeypatch):
    # Mock network call to return empty
    async def mock_fetch(*args, **kwargs):
        return []
    
    monkeypatch.setattr("backend.emissions._fetch_from_climatetrace", mock_fetch)
    
    results = await scan_local_emissions(37.7749, -122.4194, 15, 2023)
    assert results == []
