"""
Stages D & E — LLM integration via NVIDIA NIM (OpenAI-compatible).
  D: Vision analysis (cosmos3-nano-reasoner)
  E: Synthesis     (kimi-k2.6 → gpt-oss-120b fallback)
"""
import os
import json
import base64
import logging
from typing import Optional

try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False
    OpenAI = None

from server.backend.schemas import VisionAnalysis, SynthesisResult

logger = logging.getLogger(__name__)

# ── Model names ────────────────────────────────────────────────────
VISION_MODEL = "meta/llama-3.2-90b-vision-instruct"
PRIMARY_SYNTH = "moonshotai/kimi-k2.6"
BACKUP_SYNTH = "openai/gpt-oss-120b"

# ── Prompts ────────────────────────────────────────────────────────
VISION_SYSTEM_PROMPT = """You are a satellite land-cover analyst. You receive one composite satellite
tile image centered on a coordinate, with Google map labels. A pin/marker in the center indicates the exact location being analyzed. Describe only what is visually present —
land use, surface type, vegetation, water. Do not identify people, vehicles,
license plates, or attribute ownership of any structure.

Respond ONLY with valid JSON in this shape:
{
  "land_cover": {"vegetation_pct": int, "water_pct": int, "built_pct": int, "bare_pct": int},
  "image_quality": "clear" | "partial_cloud" | "low_resolution" | "unusable",
  "confidence": "low" | "medium" | "high"
}

If image_quality is "unusable", set land_cover to null and explain
why in a "caveat" field instead."""

SYNTHESIS_SYSTEM_PROMPT = """You are the synthesis engine for a local climate-action tool. You receive a
JSON bundle with three sources: land_cover_analysis (from a vision model),
weather_current, and nearby_emitters (from ClimateTrace, with sector,
distance_km, emissions_tons_co2e per entry). Some fields may be missing —
never invent data that isn't in the input.

Hard rules for interpreting data:
- temperature_2m vs apparent_temperature: Use this to mathematically calculate and explicitly state the Urban Heat Island penalty.
- wind_speed_10m & wind_direction_10m: Use this to track emission plumes (how fast and which direction smoke/emissions are blowing).
- pm2_5: Use as a heavy transit tracer (e.g. diesel exhaust).
- pm10: Use as a mechanical friction tracer (e.g. brake dust, coal dust).
- Never state or imply that a named facility "caused" harm to this location.
  Only report proximity + reported category, e.g. "a transport-sector source
  is reported 4.2km away."
- Every action you recommend must cite at least one specific input fact
  (a feature, a weather value, or an emitter entry). No generic filler advice.
- If nearby_emitters is empty or land_cover_analysis.image_quality is not
  "clear", say so plainly in area_profile rather than guessing.

Respond ONLY with valid JSON:
{
  "area_profile": string,
  "top_actions": [
    {"action": string, "why_local": string, "effort": "low" | "medium" | "high"}
  ],
  "responsible_ai_notes": string,
  "confidence": "low" | "medium" | "high"
}

You must provide EXACTLY 5 top_actions, no more and no less."""


def _get_client() -> OpenAI:
    """Create an OpenAI-compatible client pointed at NVIDIA NIM."""
    if not HAS_OPENAI:
        raise RuntimeError(
            "openai package not installed. Run: pip install openai"
        )
    api_key = os.environ.get("NVIDIA_API_KEY", "")
    if not api_key:
        raise RuntimeError("NVIDIA_API_KEY environment variable is not set")
    return OpenAI(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key=api_key,
    )


def _extract_json(text: str) -> dict:
    """Extract JSON from model output that may contain markdown fences or conversational filler."""
    text = text.strip()
    
    # Find the first { and the last }
    start = text.find("{")
    end = text.rfind("}")
    
    if start != -1 and end != -1:
        text = text[start:end+1]
        
    return json.loads(text)


# ── Stage D: Vision ────────────────────────────────────────────────
def analyze_image(image_png_bytes: bytes) -> VisionAnalysis:
    """
    Send composite satellite image to the vision model.
    Returns validated VisionAnalysis.
    """
    client = _get_client()
    b64_image = base64.b64encode(image_png_bytes).decode("utf-8")

    for attempt in range(2):  # retry once on parse failure
        try:
            response = client.chat.completions.create(
                model=VISION_MODEL,
                messages=[
                    {"role": "system", "content": VISION_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "Analyze this satellite composite image and respond ONLY with the requested JSON schema.",
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{b64_image}",
                                },
                            },
                        ],
                    },
                ],
                temperature=0.2,
                max_tokens=1024,
            )
            raw = response.choices[0].message.content
            logger.info(f"Vision model raw output (attempt {attempt+1}): {raw[:200]}")
            data = _extract_json(raw)
            return VisionAnalysis(**data)
        except json.JSONDecodeError as e:
            logger.warning(f"Vision JSON parse failed (attempt {attempt+1}): {e}")
        except Exception as e:
            logger.error(f"Vision model error (attempt {attempt+1}): {e}")

    # Fallback: return unusable-quality analysis
    logger.error("Vision analysis failed after retries")
    return VisionAnalysis(
        image_quality="unusable",
        confidence="low",
        caveat="Vision model failed to produce valid output after retries.",
    )


# ── Stage E: Synthesis ─────────────────────────────────────────────
def synthesize(
    land_cover_analysis: dict,
    weather_current: dict,
    nearby_emitters: list,
    location_label: str,
) -> SynthesisResult:
    """
    Combine all ground-truth data into a local area profile + ranked actions.
    Tries PRIMARY_SYNTH, falls back to BACKUP_SYNTH.
    """
    input_bundle = json.dumps(
        {
            "land_cover_analysis": land_cover_analysis,
            "weather_current": weather_current,
            "nearby_emitters": nearby_emitters,
            "location_label": location_label,
        },
        indent=2,
    )

    client = _get_client()

    for model_name in [PRIMARY_SYNTH, BACKUP_SYNTH]:
        for attempt in range(2):  # retry once per model
            try:
                response = client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {"role": "system", "content": SYNTHESIS_SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": f"INPUT BUNDLE:\n{input_bundle}",
                        },
                    ],
                    temperature=0.3,
                    max_tokens=2048,
                )
                raw = response.choices[0].message.content
                logger.info(
                    f"Synthesis ({model_name}, attempt {attempt+1}): {raw[:200]}"
                )
                data = _extract_json(raw)
                return SynthesisResult(**data)
            except json.JSONDecodeError as e:
                logger.warning(
                    f"Synthesis JSON parse failed ({model_name}, attempt {attempt+1}): {e}"
                )
            except Exception as e:
                logger.error(
                    f"Synthesis error ({model_name}, attempt {attempt+1}): {e}"
                )

        logger.warning(f"Model {model_name} exhausted retries, trying fallback...")

    # All models failed
    logger.error("Synthesis failed on all models")
    return SynthesisResult(
        area_profile="Analysis could not be completed — all AI models failed to respond. Please try again.",
        responsible_ai_notes="No AI-generated analysis was produced.",
        confidence="low",
    )
