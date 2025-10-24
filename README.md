# PraiaFinder — README (MVP → Cloud-Ready)

App para recomendar a **melhor praia em Portugal** por janela horária, zona ou localização, com **nota 0–10**, distinção **mar vs praia fluvial** (Ondas vs Corrente) e UI responsiva (mobile/desktop).

Este README cobre **dev local**, **estrutura**, **APIs**, **batch**, **deploy AWS (S3 + ECS Fargate + Amplify)**, **envs**, **Docker** e **troubleshooting**.


---

## 1) Estrutura do projeto

```
praiafinder/
├─ backend/
│  ├─ app/
│  │  ├─ main.py           # FastAPI (endpoints /health, /beaches, /top, /reload)
│  │  └─ scoring.py        # Beach/Conditions + score_family/surf/snorkel
│  ├─ requirements.txt
│  └─ Dockerfile           # (prod) uvicorn + boto3 + httpx
├─ batch/
│  └─ fetch_and_score.py   # Script batch: Open‑Meteo + (opcional) Marine + scoring → scores.json
├─ data/
│  ├─ beaches.json         # Praias (amostra PT)
│  └─ scores_demo.json     # Saída local (dev)
├─ frontend/
│  ├─ app/
│  │  ├─ layout.tsx        # Layout full‑width (sem max-w)
│  │  └─ page.tsx          # UI principal (Nota, filtros, “Zonas/Perto”, pesquisa, breakdown)
│  ├─ public/
│  │  ├─ manifest.webmanifest
│  │  ├─ icon-192.png, icon-512.png, apple-touch-icon.png, favicon.ico
│  ├─ package.json
│  └─ (tailwind/postcss configs)
└─ tools/
   └─ s3_bootstrap.py      # (opcional) Criar bucket S3 + subir scores por boto3
```


---

## 2) Requisitos / versões sugeridas

- **Python 3.12** (ou 3.10+)
- **Node 20** (LTS) e **npm 10** (ou pnpm/yarn)
- **AWS CLI v2** (para deploy) **ou** `pip install awscli`
- **Docker** (para imagens e ECS/ECR)

> Windows: usa **PowerShell**. Em Linux/macOS, usa bash com os mesmos comandos (ajustando paths).


---

## 3) Dev local

### 3.1 Backend (FastAPI)

```powershell
cd backend
python -m venv .venv
# Windows
.\.venv\Scripts\Activate.ps1
# Linux/macOS
# source .venv/bin/activate

pip install -r requirements.txt
# Se não existir, instala mínimos:
# pip install fastapi uvicorn httpx boto3

# a partir da raiz do projeto
uvicorn backend.app.main:app --reload --port 8000
# http://127.0.0.1:8000/health  → {"status":"ok"}
```

> **Dica Windows**: se vires `ModuleNotFoundError: No module named 'backend'`, corre o uvicorn **a partir da raiz** do repo (não dentro de `backend/`).


### 3.2 Batch (gerar scores locais)

```powershell
# na raiz do projeto (venv ativo do backend)
python batch\fetch_and_score.py --days 3 --sleep-ms 300 --skip-marine
# Saída: data\scores_demo.json
```

Opções úteis:
- `--zones "lisboa,algarve"` (filtrar)
- `--cell-res 0.1` (agrupar chamadas por célula ~10 km)
- `--limit-cells 5` (debug)
- **Ondas**: remove `--skip-marine` para usar o endpoint marine da Open‑Meteo.


### 3.3 Frontend (Next.js)

```powershell
cd frontend
npm i
npm run dev
# http://localhost:3000
```

> Se **Tailwind** não iniciar, garante as devDeps:
> ```powershell
> npm i -D tailwindcss postcss autoprefixer
> ```
> e os ficheiros `tailwind.config.js` e `postcss.config.js` corretos.


---

## 4) API do backend

### GET `/health`
Health check simples.

### GET `/beaches`
Lista de praias do `data/beaches.json` (ou fonte futura).

### GET `/top`
Recomendações ordenadas por nota.
**Query params**:
- `lat`, `lon` (float) — localização do utilizador (opcional)
- `radius_km` (int, default 40) — raio para “Perto de mim”
- `zone` (str) — zona (`norte|centro|lisboa|alentejo|algarve|acores|madeira`)
- `when` (ISO UTC, ex: `2025-10-24T10:00:00Z`) — janela alvo
- `mode` (`familia|surf|snorkel`), `limit` (int)

**Resposta (array)**:
```jsonc
[{
  "beach_id": "PT-LIS-001",
  "nome": "Praia X",
  "nota": 8.7,                    // 0..10
  "distancia_km": 12.3,           // pode vir null se sem geoloc
  "used_timestamp": "2025-10-24T10:00:00Z",
  "water_type": "mar|fluvial",
  "breakdown": {
    "Offshore": 2.1,
    "Vento": -1.2,
    "Ondas": 3.0,                  // omitido em praias fluviais
    "Corrente": -0.5               // só para fluviais
  }
}]
```

**Headers opcionais**:
- `x-available-until` — horizonte de previsão disponível para o pedido.


---

## 5) Scoring (resumo)

- **Nota 0–10** com semáforos:
  - <4.5 = vermelho, 4.5–6.5 = amarelo, 6.5–8.5 = verde‑claro, 8.5–10 = verde‑escuro.
- **Praia fluvial**: não usa “Ondas”; usa “Corrente” (se existir).
- **Mar**: inclui “Ondas”; não mostra “Corrente”.
- `breakdown` mostra até **4 contribuições** mais relevantes (positivas/negativas).


---

## 6) Variáveis de ambiente

### Backend / Batch
```
SCORES_S3_BUCKET=praiafinder-prod-pt           # bucket S3 (prod)
SCORES_S3_KEY=scores/scores.json               # caminho dos scores
ALLOWED_ORIGIN=https://app.seu-dominio         # CORS para o front
```

### Frontend
```
NEXT_PUBLIC_API_BASE=https://api.seu-dominio   # base URL do backend
```

> Em dev local, podes deixar `NEXT_PUBLIC_API_BASE` vazio para chamar `http://localhost:3000/api` se tiveres um proxy; ou aponta para `http://127.0.0.1:8000`.


---

## 7) Deploy AWS (resumo objetivo)

### 7.1 S3 para os scores
- Cria bucket único (nome global, ex.: `praiafinder-prod-pt`).
- Sobe um ficheiro inicial (CLI ou `tools/s3_bootstrap.py`).

### 7.2 Imagem do backend (ECR + ECS Fargate)
- Build & push image (`backend/Dockerfile`).
- ECS **Task Definition** (Fargate 0.25vCPU/512MB):
  - Env: `SCORES_S3_BUCKET`, `SCORES_S3_KEY`, `ALLOWED_ORIGIN`.
  - Role com policy `s3:GetObject` nesse `Key`.
- ECS **Service** com **ALB** (health `/health`).

### 7.3 Batch como Scheduled Task (EventBridge → ECS)
- Reutiliza a mesma imagem (tem boto3/httpx).
- Command: `python batch/fetch_and_score.py --days 3 --sleep-ms 300 --ua "PraiaFinder/1.0"`
- Role com policy `s3:PutObject` no `scores.json` (e `GetObject`).

### 7.4 Frontend (Amplify Hosting)
- Conecta ao repo → define `NEXT_PUBLIC_API_BASE=https://api.seu-dominio`.

### 7.5 DNS/SSL (Route 53 + ACM)
- `app.seu-dominio` → Amplify/CloudFront.
- `api.seu-dominio` → ALB (A/AAAA Alias).


---

## 8) Docker local (opcional)

### 8.1 Backend
```bash
docker build -t praiafinder-backend ./backend
docker run --rm -p 8000:8000 \
  -e SCORES_S3_BUCKET= \
  -e SCORES_S3_KEY=scores/scores.json \
  praiafinder-backend
# http://127.0.0.1:8000/health
```

### 8.2 Compose (exemplo mínimo)
```yaml
version: "3.9"
services:
  api:
    build: ./backend
    ports: ["8000:8000"]
    environment:
      SCORES_S3_BUCKET: ""
      SCORES_S3_KEY: "scores/scores.json"
      ALLOWED_ORIGIN: "http://localhost:3000"
  web:
    image: node:20
    working_dir: /app
    volumes: [ "./frontend:/app" ]
    command: sh -c "npm i && npm run dev"
    ports: ["3000:3000"]
    environment:
      NEXT_PUBLIC_API_BASE: "http://localhost:8000"
```


---

## 9) Troubleshooting (erros comuns)

- **`ModuleNotFoundError: No module named 'backend'`**  
  Corre `uvicorn backend.app.main:app` **na raiz** do projeto (PYTHONPATH certo).

- **`ImportError: validate_core_schema / pydantic_core`**  
  Atualiza fastapi/pydantic: `pip install "fastapi>=0.110" "pydantic>=2.5"` (e reinicia).

- **`No module named httpx`** no batch  
  `pip install httpx` (ou `pip install -r backend/requirements.txt`).

- **Next: `module is not defined in ES module scope` (next.config.mjs)**  
  Usa `.mjs` corretamente ou troca para `.cjs`. Não mistures `module.exports` (CJS) num ficheiro ESM.

- **Tailwind `npx tailwindcss init -p` não corre**  
  Garante `tailwindcss` em devDeps e Node 18/20; alternativa: `node node_modules/tailwindcss/lib/cli.js init -p`.

- **`aws` não encontrado**  
  Instala **AWS CLI v2** (winget) ou `pip install awscli` e faz `aws configure`.

- **CORS**  
  Define `ALLOWED_ORIGIN` no backend para o domínio do teu front (ou `http://localhost:3000` em dev).


---

## 10) Roadmap rápido

- ✅ Nota 0–10 com semáforos; fluvial vs mar (Corrente vs Ondas).  
- ✅ Distância também em “Zonas” se geolocalização for permitida.  
- ⏳ Melhorar “Ondas”: validar Marine API e aparar limites.  
- ⏳ Cache HTTP (5 min) no `/top`.  
- ⏳ Sentry/Logs; métricas (latência por endpoint).  
- ⏳ Mapa (leaflet) e filtros avançados (vento off/onshore, período, etc.).

---

**Qualquer dúvida, abre um issue ou pergunta. Bom surf 🏄 e boas praias!**
