# TerraLens — Local Climate Action Assistant

TerraLens is a robust, location-based intelligence application developed for the USAII Global AI Hackathon 2026. It replaces generic climate advice with hyper-local, actionable insights by orchestrating a high-performance 5-stage data and AI pipeline.

A localized, interactive climate information and action-recommendation engine. TerraLens allows users to drop a pin on a map, select a radius (5km-50km), and instantly receive a detailed climate profile of that location. It achieves this by integrating real-time weather data, satellite imagery analysis, and global emissions data to provide actionable, tailored recommendations for climate resilience and mitigation.

### Live At: https://adhyanshaa-terralens.hf.space/

## 🚀 Project Overview

TerraLens bridges the gap between global climate data and local impact. By combining satellite imagery, live weather conditions, and global emissions data, it synthesizes an individualized "Area Profile" for any coordinate on Earth. 

Key features include:
- **Interactive Map Interface**: Leaflet-based map to drop a pin and define a scanning radius.
- **Story Mode**: An immersive presentation mode showing real-time AI synthesis.
- **Data Export**: Users can download their complete area profile and emitter list as a JSON file for local records.
- **Responsible AI Notes**: Every analysis includes a transparent summary of the data sources used and the confidence level of the AI models.

## ⚙️ The 5-Stage Architecture Pipeline

The backend (FastAPI) handles the complex orchestration of data gathering and AI analysis through a structured pipeline:

### Stage A: Location Capture (Frontend)
The frontend captures the exact `lat` and `lon` via an interactive Leaflet map. Users can define a scan radius (5km to 50km). This data is passed securely to the backend `/api/analyze` endpoint.

### Stage B: Satellite Tile Fetch & Stitch
The system translates the coordinates into slippy-map tile coordinates and asynchronously fetches a 3x3 grid of map tiles (using Google Hybrid imagery, falling back to Esri Imagery). These tiles are stitched together in memory using the `Pillow` library to create a composite high-resolution satellite image of the surrounding area.

### Stage C: Weather + Emissions (Concurrent Data Pull)
Using Python's `asyncio`, the system parallelizes two critical real-time API calls:
1. **Weather (Open-Meteo)**: Fetches real-time temperature, apparent temperature, wind speed, wind direction, PM2.5, and PM10 to identify Urban Heat Island effects and pollution tracking.
2. **Emissions (ClimateTrace)**: Hits the ClimateTrace V7 API to find global emitting assets. It uses a bounding box filter, then precisely calculates the Haversine distance to ensure emitters are strictly within the user's defined radius. 

### Stage D: Vision Analysis (NVIDIA NIM)
The stitched satellite composite is encoded in base64 and sent to the NVIDIA NIM endpoint using the `meta/llama-3.2-90b-vision-instruct` model. The vision model analyzes the land cover (vegetation, water, built environments, bare land) and returns a structured JSON response regarding the area's physical characteristics.

### Stage E: Synthesis and Recommendation Engine
A large language model (`moonshotai/kimi-k2.6` with a fallback to `openai/gpt-oss-120b`) receives the data bundle (Vision Analysis, Weather Data, Emission Sources). With a strict system prompt, it synthesizes the data to generate:
- An **Area Profile** detailing the environmental realities of the location.
- **Top 5 Actionable Recommendations**, ranked by effort and specifically citing the local data points (e.g., advising air filtration because a specific transport emitter is 4.2km away upwind).

## 🛠️ Technology Stack

- **Backend**: FastAPI, Uvicorn, Python 3.11, httpx (async requests), asyncio
- **AI / LLMs**: NVIDIA NIM (OpenAI-compatible client), Llama 3.2 Vision, Kimi
- **Image Processing**: Pillow (PIL)
- **Frontend**: HTML5, Vanilla JS, CSS3, Leaflet.js
- **Data Validation**: Pydantic
- **APIs**: ClimateTrace, Open-Meteo

## 💻 Getting Started

### Prerequisites
- **Python 3.11+** installed on your system.
- API keys defined in a `.env` file (you can copy the structure from `.env.example`). You will need an `NVIDIA_API_KEY`.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/AVadhyanshverma/TerraLens.git
   cd TerraLens
   ```

2. **Set up a Virtual Environment (Recommended):**
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows use: .venv\Scripts\activate
   ```

3. **Install Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Environment Variables:**
   Make sure you have created your `.env` file containing your `NVIDIA_API_KEY`.

### Running the Application

Start the FastAPI server locally:

```bash
uvicorn server.backend.main:app --host 0.0.0.0 --port 7860
```

Once the server is running, open your web browser and navigate to `http://localhost:7860` to access the TerraLens interface.

## 🛡️ Privacy & Responsible AI

TerraLens is designed with privacy and responsibility as core tenets:
- **No Data Retention**: Location data is processed entirely in-session. No coordinates or user searches are saved to a database.
- **No Hallucinations**: The Synthesis LLM is strictly prompted to only cite data present in the input bundle. It cannot invent emission sources.
- **Transparent Confidence**: The UI explicitly displays the confidence level of the vision model and data completeness.