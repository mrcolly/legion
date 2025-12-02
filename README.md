# Legion 🌍

Real-time global events visualization on a 3D globe.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)
![globe.gl](https://img.shields.io/badge/globe.gl-3D%20Globe-blue)

<p align="center">
  <img src="https://img.shields.io/badge/Backend-Express.js-green" alt="Backend"/>
  <img src="https://img.shields.io/badge/Frontend-Vite%20+%20React-purple" alt="Frontend"/>
  <img src="https://img.shields.io/badge/Data-GDELT%20News-red" alt="Data"/>
</p>

## 🎯 Overview

Legion is a full-stack application that visualizes real-time global events on an interactive 3D globe. Events from news sources appear as points on the globe, with live updates streamed via Server-Sent Events.

## 🏗️ Architecture

```
legion/
├── backend/           # Express.js API server
│   ├── src/
│   │   ├── api/       # REST endpoints
│   │   ├── services/  # Data aggregation
│   │   ├── sources/   # Data sources (GDELT, Demo)
│   │   └── utils/     # Hash, logging utilities
│   ├── Dockerfile
│   └── package.json
│
├── frontend/          # React + Vite SPA
│   ├── src/
│   │   ├── components/  # Globe, InfoPanel
│   │   ├── hooks/       # useGeoData
│   │   └── services/    # API client
│   ├── Dockerfile
│   └── package.json
│
├── docs/              # Documentation
├── docker-compose.yml # Container orchestration
└── README.md
```

## 🚀 Quick Start

### Option 1: Docker (Recommended)

```bash
# Build and run everything
docker-compose up --build

# Access:
# - Frontend: http://localhost:8080
# - Backend:  http://localhost:3000
```

### Option 2: Local Development

```bash
# Terminal 1 - Backend
cd backend
npm install
npm run dev

# Terminal 2 - Frontend
cd frontend
npm install
npm run dev

# Access:
# - Frontend: http://localhost:5173
# - Backend:  http://localhost:3000
```

## ✨ Features

### Backend
- 🔌 **Data-agnostic architecture** - Plugin system for multiple data sources
- 📰 **GDELT integration** - Real-time news events with geolocation
- 🔐 **Hash-based deduplication** - No duplicate events
- 📡 **Server-Sent Events** - Real-time data streaming
- 📝 **Structured logging** - Pino with JSON output
- 🧪 **36 unit tests** - Comprehensive test coverage

### Frontend
- 🌍 **3D Globe** - Interactive WebGL globe via globe.gl
- 🌙 **Night view** - Earth with city lights
- 📍 **Live points** - Color-coded by source
- 🔄 **Auto-rotation** - Stops on interaction
- 📊 **Stats panel** - Events count, connection status
- 📱 **Responsive** - Works on mobile

## 🔧 Configuration

### Environment Variables

**Backend** (`backend/.env`):
```bash
PORT=3000
USE_DEMO=true       # Enable demo data source
USE_GDELT=true      # Enable GDELT news source
LOG_LEVEL=info      # trace, debug, info, warn, error
NODE_ENV=development
```

**Frontend** (`frontend/.env`):
```bash
VITE_API_URL=http://localhost:3000
```

### Docker Compose

```bash
# Production mode
docker-compose up -d

# Development mode (with hot reload)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/data` | Get all events (`?sort=desc&limit=100`) |
| GET | `/api/data/bbox` | Filter by bounding box |
| POST | `/api/data/refresh` | Trigger data refresh |
| GET | `/api/sources` | Source statistics |
| GET | `/api/cache/stats` | Cache statistics |
| GET | `/api/stream` | SSE real-time updates |

## 🎨 Customization

### Globe Appearance

Edit `frontend/src/components/Globe.tsx`:

```typescript
// Change earth texture
globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"

// Point colors by source
const SOURCE_COLORS = {
  GDELT: '#ff6b6b',  // Red
  Demo: '#4ecdc4',   // Teal
};
```

### Add New Data Source

1. Create `backend/src/sources/MySource.ts`:
```typescript
export class MySource extends DataSourceService {
  async fetchData(): Promise<GeoDataPoint[]> {
    // Your data fetching logic
  }
}
```

2. Register in `backend/src/index.ts`:
```typescript
aggregator.registerSource(new MySource());
```

## 📦 Tech Stack

### Backend
- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Language**: TypeScript
- **Logging**: Pino
- **Testing**: Vitest

### Frontend
- **Build**: Vite
- **Framework**: React 18
- **3D**: globe.gl / three.js
- **Language**: TypeScript

### Infrastructure
- **Container**: Docker
- **Orchestration**: Docker Compose
- **Web Server**: Nginx (frontend)

## 📚 Documentation

- [Backend Architecture](docs/ARCHITECTURE.md)
- [GDELT Integration](docs/GDELT_GUIDE.md)
- [Hash Deduplication](docs/HASH_BASED_DEDUPLICATION.md)
- [Testing Guide](docs/TESTING.md)
- [Logging Guide](docs/LOGGING.md)

## 🧪 Testing

```bash
# Backend tests
cd backend
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report

# Frontend (TODO)
cd frontend
npm test
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -m 'Add my feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  Made with ❤️ and ☕
</p>
