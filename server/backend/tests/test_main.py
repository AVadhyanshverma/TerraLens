from fastapi.testclient import TestClient
from server.backend.main import app
import pytest

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "timestamp" in data

@pytest.mark.asyncio
async def test_analyze_endpoint_missing_body():
    response = client.post("/api/analyze")
    assert response.status_code == 422 # Unprocessable Entity
