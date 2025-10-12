import httpx

BASE = "https://api.open-meteo.com/v1/forecast"

async def fetch_basic(lat: float, lon: float):
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": ["windspeed_10m","winddirection_10m","wave_height","wave_direction","wave_period","cloudcover","precipitation","water_temperature"],
        "forecast_days": 2,
        "timezone": "UTC",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(BASE, params=params)
        r.raise_for_status()
        return r.json()
