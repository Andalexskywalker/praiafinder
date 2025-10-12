# PraiaFinder — MVP Skeleton

- Backend: FastAPI (endpoints `beaches`, `top`, `health`)
- Batch: stub para gerar scores demo
- Frontend: Next.js (PWA básica) com chamada ao `/top`
- Dados: `data/beaches.json` (PT inteiro — amostra)

## Como correr local
1. **Backend**
   ```bash
   cd backend
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```

2. **Frontend**
   ```bash
   cd frontend
   npm i
   npm run dev
   ```
   Abre http://localhost:3000

## Próximos passos
- Ligar providers reais (Open‑Meteo e ondas) no batch
- Persistir em DynamoDB e servir scores reais
- Mapa e filtros de zona na UI
- Deploy AWS (S3/CloudFront + Lambda Function URL)

_Gerado em 2025-10-12T15:24:20.788569Z_
