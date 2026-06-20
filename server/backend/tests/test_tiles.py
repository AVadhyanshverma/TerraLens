import pytest
from server.backend.tiles import lat_lon_to_tile, fetch_composite, _minimal_png

def test_lat_lon_to_tile():
    x, y = lat_lon_to_tile(37.7749, -122.4194, 14)
    # Expected Web Mercator tile coords for SF at zoom 14
    assert x > 0
    assert y > 0

def test_minimal_png():
    data = _minimal_png()
    assert isinstance(data, bytes)
    assert data.startswith(b'\x89PNG\r\n\x1a\n')

@pytest.mark.asyncio
async def test_fetch_composite_fallback(monkeypatch):
    # Mocking httpx.AsyncClient.get to always raise Exception
    class MockResponse:
        def raise_for_status(self):
            raise Exception("Mock failure")

    class MockClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def get(self, *args, **kwargs):
            return MockResponse()

    monkeypatch.setattr("httpx.AsyncClient", MockClient)
    
    result = await fetch_composite(37.7749, -122.4194, 14, 1)
    # Even on complete failure, it should return a placeholder PNG
    assert isinstance(result, bytes)
