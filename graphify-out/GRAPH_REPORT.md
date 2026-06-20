# Graph Report - .  (2026-06-20)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 117 nodes · 198 edges · 13 communities (12 shown, 1 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fa2a38a6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 9|Community 9]]

## God Nodes (most connected - your core abstractions)
1. `analyze_location()` - 12 edges
2. `WeatherData` - 11 edges
3. `scan_local_emissions()` - 10 edges
4. `VisionAnalysis` - 10 edges
5. `fetch_composite()` - 10 edges
6. `fetch_weather()` - 10 edges
7. `_extract_json()` - 8 edges
8. `analyze_image()` - 8 edges
9. `synthesize()` - 8 edges
10. `SynthesisResult` - 7 edges

## Surprising Connections (you probably didn't know these)
- `EmitterEntry` --uses--> `EmitterEntry`  [INFERRED]
  server/backend/emissions.py → server/backend/schemas.py
- `Any` --uses--> `EmitterEntry`  [INFERRED]
  server/backend/emissions.py → server/backend/schemas.py
- `AnalyzeRequest` --uses--> `VisionAnalysis`  [INFERRED]
  server/backend/main.py → server/backend/schemas.py
- `WeatherData` --uses--> `WeatherData`  [INFERRED]
  server/backend/weather.py → server/backend/schemas.py
- `analyze_location()` --calls--> `get_benchmarks()`  [EXTRACTED]
  server/backend/main.py → server/backend/benchmarks.py

## Import Cycles
- 1-file cycle: `server/backend/llm.py -> server/backend/llm.py`

## Communities (13 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.17
Nodes (19): analyze_image(), _get_client(), Stages D & E — LLM integration via NVIDIA NIM (OpenAI-compatible).   D: Vision a, Send composite satellite image to the vision model.     Returns validated Vision, Combine all ground-truth data into a local area profile + ranked actions.     Tr, Create an OpenAI-compatible client pointed at NVIDIA NIM., synthesize(), analyze_location() (+11 more)

### Community 1 - "Community 1"
Cohesion: 0.13
Nodes (8): animateSteps(), confirmAnalysis(), renderActions(), renderDashboard(), renderEmitters(), renderWeather(), searchLocation(), setPin()

### Community 2 - "Community 2"
Cohesion: 0.20
Nodes (14): AsyncClient, fetch_composite(), fetch_tile(), lat_lon_to_tile(), _minimal_png(), Stage B — Satellite tile fetch & stitch. Converts lat/lon to slippy-map tile coo, Return a tiny valid 1x1 dark PNG (no Pillow needed)., Convert lat/lon to slippy-map tile x/y at given zoom level. (+6 more)

### Community 3 - "Community 3"
Cohesion: 0.26
Nodes (13): AnalyzeRequest, ActionItem, AnalyzeRequest, AnalyzeResponse, Confidence, Effort, ImageQuality, LandCover (+5 more)

### Community 4 - "Community 4"
Cohesion: 0.24
Nodes (12): Any, _fetch_from_climatetrace(), haversine(), Stage C (part 2) — ClimateTrace emissions scanner. Based on the reference script, Great-circle distance between two points in km., Query ClimateTrace for emitting assets within radius_km of target.     Returns s, Hit ClimateTrace admins → sources pipeline. Returns raw asset dicts., scan_local_emissions() (+4 more)

### Community 5 - "Community 5"
Cohesion: 0.23
Nodes (12): _fetch_open_meteo(), _fetch_openweathermap(), fetch_weather(), Stage C (part 1) — Weather & air quality fetch. Uses Open-Meteo (no API key requ, Convert WMO weather code to human-readable text., Fetch current weather + air quality for a coordinate.     Primary: Open-Meteo (f, Pull from Open-Meteo weather + air-quality endpoints., Pull from OpenWeatherMap free-tier current weather endpoint. (+4 more)

### Community 6 - "Community 6"
Cohesion: 0.53
Nodes (5): _extract_json(), Extract JSON from model output that may contain markdown fences or conversationa, test_extract_json_clean(), test_extract_json_invalid(), test_extract_json_markdown()

### Community 7 - "Community 7"
Cohesion: 0.83
Nodes (3): get_benchmarks(), haversine(), load_benchmarks()

## Knowledge Gaps
- **2 isolated node(s):** `Image`, `StoryEngine`
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fetch_composite()` connect `Community 2` to `Community 0`?**
  _High betweenness centrality (0.171) - this node is a cross-community bridge._
- **Why does `analyze_location()` connect `Community 0` to `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 7`?**
  _High betweenness centrality (0.160) - this node is a cross-community bridge._
- **Why does `scan_local_emissions()` connect `Community 4` to `Community 0`?**
  _High betweenness centrality (0.120) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `WeatherData` (e.g. with `AnalyzeRequest` and `WeatherData`) actually correct?**
  _`WeatherData` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `VisionAnalysis` (e.g. with `AnalyzeRequest` and `OpenAI`) actually correct?**
  _`VisionAnalysis` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Stage C (part 2) — ClimateTrace emissions scanner. Based on the reference script`, `Great-circle distance between two points in km.`, `Query ClimateTrace for emitting assets within radius_km of target.     Returns s` to the rest of the system?**
  _26 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.13157894736842105 - nodes in this community are weakly interconnected._