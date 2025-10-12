# Backend local

## Requisitos
- Python 3.11

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Endpoints:
- GET http://localhost:8000/health
- GET http://localhost:8000/beaches
- GET http://localhost:8000/top?lat=38.72&lon=-9.14&mode=familia
