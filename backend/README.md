# Legion Backend

Data aggregation API server for real-time geolocation events.

## Quick Start

```bash
npm install
npm run dev
```

Server runs on http://localhost:3000

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development with hot reload |
| `npm run build` | Build for production |
| `npm start` | Run production build |
| `npm test` | Run tests |
| `npm run test:coverage` | Coverage report |

## Environment Variables

```bash
PORT=3000
USE_DEMO=true
USE_GDELT=true
LOG_LEVEL=info
NODE_ENV=development
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/data` | All events |
| GET | `/api/stream` | SSE stream |
| POST | `/api/data/refresh` | Refresh data |

## Docker

```bash
docker build -t legion-backend .
docker run -p 3000:3000 legion-backend
```

See root [README](../README.md) for full documentation.
