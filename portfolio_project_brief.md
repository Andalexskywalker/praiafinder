# 🏖️ PraiaFinder

**Find the perfect beach in Portugal, every time.**

## 📌 Project Overview
PraiaFinder is a real-time beach recommendation engine designed to simplify the decision-making process for beachgoers in Portugal. Instead of drowning users in raw meteorological data (wind speed knots, swell period seconds, etc.), PraiaFinder aggregates complex weather and marine forecasts into a simple **0-10 score**.

The core innovation is its context-aware scoring system, which evaluates conditions differently based on the user's intent:
- **Surf Mode**: High waves and strong offshore winds boost the score.
- **Family Mode**: Calm waters, low wind, and warm temperatures are prioritized.

## 🛠️ Tech Stack & Architecture
This project demonstrates a full-stack approach with a focus on data processing and user experience.

### Frontend (User Experience)
- **Framework**: [Next.js 14](https://nextjs.org/) (App Router) for server-side rendering and performance.
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) for a mobile-first, responsive design.
- **Animations**: [Framer Motion](https://www.framer.com/motion/) for fluid page transitions and interactive elements.
- **Language**: TypeScript for type safety and scalability.

### Backend (Logic & Data)
- **API**: [FastAPI](https://fastapi.tiangolo.com/) providing high-performance endpoints.
- **Language**: Python 3.10+.
- **Data Processing**: Custom ETL pipeline (`fetch_and_score.py`) that handles:
    - **Concurrent Fetching**: Uses `asyncio` and `httpx` with semaphores to efficiently query external APIs for hundreds of beaches without hitting rate limits.
    - **Smart Classification**: automatically distinguishes between "Maritime" (ocean) and "Fluvial" (river) beaches to apply the correct forecasting models (e.g., ignoring wave height for river beaches).
    - **Scoring Algorithm**: A weighted scoring matrix that normalizes raw weather data into user-friendly ratings.

### External APIs
- **Weather**: Open-Meteo API for high-precision hourly forecasts.
- **Marine**: Marine Weather API for swell height, direction, and period.

## ✨ Key Features
1.  **Context-Aware Scoring**: A unique algorithm that interprets the same weather data differently depending on the user's goal (Surfing vs. Relaxing).
2.  **Interactive Coast Map**: Visualizes beach conditions across the entire Portuguese coastline, allowing users to find "pockets" of good weather.
3.  **Smart Caching**: The backend implements efficient data caching strategies to minimize external API calls and ensure instant load times for users.
4.  **Resilient Data Pipeline**: The batch processing system handles API failures gracefully with exponential backoff and retry mechanisms.

## 🚀 Why I Built This
Living in Portugal, the weather can vary drastically just a few kilometers apart. I wanted to build a tool that solves the "where should we go?" problem by replacing guesswork with data. This project allowed me to explore advanced Python concurrency patterns while building a polished, consumer-facing React application.
