# Legion

Real-time global events visualization on a 3D globe.

## Quick Start

### Docker (Recommended)

```bash
docker-compose up --build

# Frontend: http://localhost:8080
# Backend:  http://localhost:3000
```

### Local Development

```bash
# Backend (Terminal 1)
cd backend
yarn install
yarn dev

# Frontend (Terminal 2)
cd frontend
yarn install
yarn dev

# Frontend: http://localhost:5173
# Backend:  http://localhost:3000
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend                           │
│  React + globe.gl + SSE client                         │
│  - 3D globe visualization                              │
│  - Real-time event points                              │
│  - Day/night mode                                      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                      Backend                            │
│  Express + TypeScript                                  │
│  - Data aggregation from multiple sources              │
│  - SSE streaming                                       │
│  - Hash-based deduplication                            │
└─────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
      ┌───────┐      ┌────────┐      ┌────────┐
      │ GDELT │      │  USGS  │      │ EONET  │
      │ News  │      │ Quakes │      │Disaster│
      └───────┘      └────────┘      └────────┘
```

## Data Sources

| Source | Description | Refresh | Env Variable |
|--------|-------------|---------|--------------|
| GDELT | Global news events | 2 min | `USE_GDELT=true` |
| USGS | Earthquakes worldwide | 5 min | `USE_USGS=true` |
| EONET | NASA natural disasters | 10 min | `USE_EONET=true` |
| RSS | Popular news feeds | 5 min | `USE_RSS=true` |
| Demo | Random test data | 30 sec | `USE_DEMO=true` |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/data` | All events (`?sort=desc&limit=100`) |
| GET | `/api/stream` | SSE real-time updates |
| GET | `/api/sources` | Source statistics |
| POST | `/api/data/refresh` | Force refresh |

## Deploy to Fly.io

```bash
# Deploy backend (internal service)
cd backend
fly deploy

# Deploy frontend (public)
cd frontend
fly deploy
```

The frontend proxies `/api/*` requests to the internal backend via nginx.

## Testing

```bash
# Backend
cd backend && yarn test

# Frontend
cd frontend && yarn test
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, globe.gl, TypeScript |
| Backend | Node.js 20, Express, TypeScript, Pino |
| Infrastructure | Docker, Fly.io, Nginx |
| Testing | Vitest |
