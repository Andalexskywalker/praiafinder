# 🏖️ PraiaFinder

**Find the perfect beach in Portugal, every time.**

PraiaFinder is a real-time beach recommendation engine that analyzes wind, waves, and temperature to give every beach a simple **0-10 score**. It distinguishes between "Surf Mode" (big waves = good) and "Family Mode" (big waves = bad) to ensure you always have the best experience.

![PraiaFinder Demo](https://via.placeholder.com/800x400?text=PraiaFinder+Dashboard+Preview)

## 🚀 Live Demo
**[View Live Demo](https://praiafinder.vercel.app)** _(Replace with your actual link)_

## ✨ Key Features
- **Real-time Scoring**: Complex meteorological data condensed into a simple 0-10 score.
- **Smart Modes**: Toggle between **Family**, **Surf**, and **Snorkel** modes.
- **Interactive Map**: Visualise conditions across the entire coast.
- **Responsive Design**: Beautiful, mobile-first UI built with Framer Motion.

## 🛠️ Tech Stack
- **Frontend**: [Next.js 14](https://nextjs.org/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/), [Framer Motion](https://www.framer.com/motion/)
- **Backend**: [FastAPI](https://fastapi.tiangolo.com/), [Python](https://www.python.org/)
- **Data**: Open-Meteo API (Weather), Marine Weather API
- **Deployment**: Vercel (Frontend), Render (Backend)

## 🏃‍♂️ How to Run Locally

### 1. Clone the repo
```bash
git clone https://github.com/yourusername/praiafinder.git
cd praiafinder
```

### 2. Start the Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
# Running on http://localhost:8000
```

### 3. Start the Frontend
```bash
cd frontend
npm install
npm run dev
# Running on http://localhost:3000
```

## 📄 License
MIT License.
