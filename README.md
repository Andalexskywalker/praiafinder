# 🏖️ PraiaFinder

**Find the perfect beach in Portugal, every time.**

PraiaFinder is a real-time beach recommendation engine designed to simplify the decision-making process for beachgoers in Portugal. It aggregates complex weather and marine forecasts into a simple **0-10 score**, distinguishing between "Surf Mode" (big waves = good) and "Family Mode" (calm waters = good).

![PraiaFinder Demo](https://via.placeholder.com/800x400?text=PraiaFinder+Dashboard+Preview)

## 🚀 Live Demo
**[View Live Demo](https://praiafinder.vercel.app)** _(Replace with your actual link)_

## ✨ Key Features
1.  **Context-Aware Scoring**: A unique algorithm that interprets the same weather data differently depending on the user's goal (Surfing vs. Relaxing).
2.  **Interactive Coast Map**: Visualizes beach conditions across the entire Portuguese coastline, allowing users to find "pockets" of good weather.
3.  **Smart Caching**: The backend implements efficient data caching strategies to minimize external API calls and ensure instant load times for users.
4.  **Resilient Data Pipeline**: The batch processing system handles API failures gracefully with exponential backoff and retry mechanisms.

## 🛠️ Tech Stack & Architecture

### Frontend (User Experience)
- **Framework**: [Next.js 14](https://nextjs.org/) (App Router).
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) for mobile-first design.
- **Animations**: [Framer Motion](https://www.framer.com/motion/) for fluid transitions.
- **Language**: TypeScript.

### Backend (Logic & Data)
- **API**: [FastAPI](https://fastapi.tiangolo.com/) for high-performance endpoints.
- **Data Processing**: Custom Python ETL pipeline (`fetch_and_score.py`) using `asyncio` for concurrent fetching from external APIs.
- **Smart Classification**: Automatically discriminates between "Maritime" and "River" beaches to apply correct forecasting models.
- **Scoring Algorithm**: Weighted matrix normalizing raw weather data into user-friendly ratings.

### External APIs & Deployment
- **Weather**: Open-Meteo API & Marine Weather API.
- **Deployment**: Vercel (Frontend), Render (Backend).

## 🚀 Why I Built This
Living in Portugal, the weather can vary drastically just a few kilometers apart. I wanted to build a tool that solves the "where should we go?" problem by replacing guesswork with data. This project allowed me to explore advanced Python concurrency patterns while building a polished, consumer-facing React application.

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
