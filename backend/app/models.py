from pydantic import BaseModel
from typing import Optional, Literal

Mode = Literal["familia", "surf", "snorkel"]

class TopRequest(BaseModel):
    lat: Optional[float] = None
    lon: Optional[float] = None
    radius_km: int = 40
    zone: Optional[str] = None
    when: Optional[str] = None
    mode: Mode = "familia"
    limit: int = 5
