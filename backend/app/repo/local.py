from pathlib import Path
import json

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
SCORES_PATH = DATA_DIR / "scores_demo.json"

class LocalRepo:
    def upsert_score(self, item: dict):
        data = []
        if SCORES_PATH.exists():
            data = json.loads(SCORES_PATH.read_text("utf-8"))
        data.append(item)
        SCORES_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")
