"""Stub do batch: lê beaches.json e escreve scores_dummy em data/scores_demo.json.
Substituir por integracão real com providers + DynamoDB.
"""
from pathlib import Path
import json, datetime as dt
from backend.app.scoring import Beach, Conditions, score_family, score_surf, score_snorkel

DATA = Path(__file__).resolve().parents[1] / "data"
BEACHES = json.loads((DATA/"beaches.json").read_text("utf-8"))

now = dt.datetime.utcnow().replace(minute=0, second=0, microsecond=0)
items = []
for b in BEACHES:
    beach = Beach(orientation_deg=b.get("orientacao_graus", 270), shelter=b.get("abrigo", 0))
    cond = Conditions(3.0, (beach.orientation_deg+180)%360, 0.6, 10.0, 30.0, 0.0, 19.0)
    for mode, fn in [("familia", score_family), ("surf", score_surf), ("snorkel", score_snorkel)]:
        score, breakdown = fn(beach, cond)
        items.append({
            "beach_id": b["id"],
            "ts": now.isoformat()+"Z",
            "mode": mode,
            "score": round(score,1),
            "breakdown": breakdown,
        })

(DATA/"scores_demo.json").write_text(json.dumps(items, ensure_ascii=False, indent=2), "utf-8")
print(f"Wrote {len(items)} scores → data/scores_demo.json")
