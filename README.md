# Legion Backend

Real-time geolocation data visualization backend - A data-agnostic service for collecting and serving geo-located data from multiple sources.

## Features

- 🌍 **Data Source Agnostic**: Easily add new data sources by implementing a simple interface
- 📡 **Real-time Updates**: Auto-refresh data at configurable intervals
- 🔌 **Pluggable Architecture**: Add/remove data sources without changing core code
- 📊 **RESTful API**: Clean API for accessing geo-located data
- 🎯 **Geographic Filtering**: Filter data by bounding box
- 📈 **Statistics**: Monitor data source health and performance

## Current Data Sources

- **Demo Source**: Generates realistic sample news events around major world cities (default for testing)
- **GDELT Project**: Real-time global news events from the last hour with geolocation (can be enabled)

## Architecture

```
┌─────────────────────────────────────────┐
│         DataAggregator                  │
│  (Manages multiple data sources)        │
└────────────┬────────────────────────────┘
             │
     ┌───────┴────────┬──────────────┐
     │                │              │
┌────▼─────┐   ┌─────▼────┐   ┌────▼─────┐
│  GDELT   │   │ Source 2 │   │ Source 3 │
│  Source  │   │ (Future) │   │ (Future) │
└──────────┘   └──────────┘   └──────────┘
```

## Getting Started

### Installation

```bash
npm install
```

### Run Tests

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode for development
npm run test:coverage # Generate coverage report
```

### Configuration

Create a `.env` file (optional):

```bash
PORT=3000
USE_DEMO=true         # Demo data for testing (enabled by default)
USE_GDELT=true        # Real news data from GDELT Project (disabled by default)
LOG_LEVEL=info        # Log level: trace, debug, info, warn, error (default: info)
NODE_ENV=development  # development (pretty logs) or production (JSON logs)
```

You can enable multiple sources simultaneously - they'll be aggregated automatically!

**Note on GDELT:** Geo-located news data can be sparse. The system fetches articles about events likely to have specific locations (conflicts, summits, disasters, weather, sports, etc.) and filters for those with valid coordinates. During quiet news periods, GDELT may return few or no geo-located articles. For reliable testing, use the Demo source.

### Running

Development mode with hot reload:
```bash
npm run dev
```

Build and run:
```bash
npm run build
npm start
```

## API Endpoints

### GET /health
Health check endpoint

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2023-12-01T12:00:00.000Z"
}
```

### GET /api/data
Get all cached data points

**Query Parameters:**
- `sort` (optional): Sort order - `desc` (newest first, default) or `asc` (oldest first)
- `limit` (optional): Limit number of results (e.g., `100`)

**Examples:**
```bash
# Get all data (newest first by default)
GET /api/data

# Get oldest first
GET /api/data?sort=asc

# Get 100 newest items
GET /api/data?limit=100

# Get 50 oldest items
GET /api/data?sort=asc&limit=50
```

**Response:**
```json
{
  "success": true,
  "count": 150,
  "total": 150,
  "lastUpdate": "2023-12-01T12:00:00.000Z",
  "data": [
    {
      "id": "gdelt-...",
      "hash": "a3f2e9d8...",
      "timestamp": "2023-12-01T11:59:00.000Z",
      "location": {
        "latitude": 40.7128,
        "longitude": -74.0060
      },
      "title": "News Event Title",
      "description": "Event description",
      "url": "https://...",
      "source": "GDELT",
      "category": "news",
      "metadata": {}
    }
  ]
}
```

### POST /api/data/refresh
Force refresh data from all sources

**Response:**
```json
{
  "success": true,
  "count": 150,
  "lastUpdate": "2023-12-01T12:00:00.000Z",
  "data": [...]
}
```

### GET /api/sources
Get statistics about all data sources

**Response:**
```json
{
  "success": true,
  "sources": [
    {
      "name": "GDELT",
      "enabled": true,
      "stats": {
        "totalFetched": 1500,
        "lastFetchTime": "2023-12-01T12:00:00.000Z",
        "errors": 0,
        "isHealthy": true
      }
    }
  ]
}
```

### GET /api/data/bbox
Filter data by geographic bounding box

**Query Parameters:**
- `minLat`: Minimum latitude (required)
- `maxLat`: Maximum latitude (required)
- `minLon`: Minimum longitude (required)
- `maxLon`: Maximum longitude (required)
- `sort` (optional): Sort order - `desc` (newest first, default) or `asc` (oldest first)
- `limit` (optional): Limit number of results

**Examples:**
```bash
# Get all data in bounding box (newest first)
GET /api/data/bbox?minLat=40&maxLat=41&minLon=-75&maxLon=-73

# Get 50 newest in bounding box
GET /api/data/bbox?minLat=40&maxLat=41&minLon=-75&maxLon=-73&limit=50

# Get oldest first
GET /api/data/bbox?minLat=40&maxLat=41&minLon=-75&maxLon=-73&sort=asc
```

**Response:**
```json
{
  "success": true,
  "count": 25,
  "data": [...]
}
```

### GET /api/cache/stats
Get cache statistics including deduplication metrics

**Response:**
```json
{
  "success": true,
  "totalPoints": 250,
  "uniqueHashes": 250,
  "sourceCount": 2,
  "lastUpdate": "2025-12-01T22:15:00.000Z"
}
```

### POST /api/cache/clear
Clear all cached data (debug/testing only)

**Response:**
```json
{
  "success": true,
  "message": "Cache cleared successfully"
}
```

### GET /api/stream
Real-time Server-Sent Events (SSE) stream

**Response:** `text/event-stream`

Connect to receive real-time notifications when new data arrives.

**Example:**
```javascript
const eventSource = new EventSource('http://localhost:3000/api/stream');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'data-updated') {
    console.log(`${data.newDataCount} new events from ${data.source}`);
    // Add data.newData to your visualization
  }
};
```

See [REAL_TIME_STREAMING.md](docs/REAL_TIME_STREAMING.md) for complete documentation.

## Adding New Data Sources

To add a new data source, create a class that extends `DataSourceService`:

```typescript
import { DataSourceService } from '../services/DataSourceService';
import { GeoDataPoint, DataSourceConfig } from '../types/GeoData';

export class MyNewSource extends DataSourceService {
  constructor(config?: Partial<DataSourceConfig>) {
    super({
      name: 'MySource',
      enabled: true,
      refreshInterval: 60000,
      ...config,
    });
  }

  async fetchData(): Promise<GeoDataPoint[]> {
    // Implement your data fetching logic here
    const data = await fetchFromAPI();
    
    // Transform to GeoDataPoint format
    return data.map(item => ({
      id: `mysource-${item.id}`,
      timestamp: new Date(item.date),
      location: {
        latitude: item.lat,
        longitude: item.lon,
      },
      title: item.title,
      description: item.description,
      url: item.url,
      source: this.getName(),
      category: item.category,
      metadata: item.extra,
    }));
  }
}
```

Then register it in `src/index.ts`:

```typescript
aggregator.registerSource(new MyNewSource());
```

### Switching Data Sources

In `src/index.ts`, you can easily enable/disable sources:

```typescript
// Use demo data for testing
aggregator.registerSource(new DemoSource());

// Use GDELT for real news data
aggregator.registerSource(new GDELTSource());

// Use multiple sources simultaneously!
aggregator.registerSource(new DemoSource());
aggregator.registerSource(new GDELTSource());
aggregator.registerSource(new MyCustomSource());
```

## Data Format

All data sources must return data in the `GeoDataPoint` format:

```typescript
interface GeoDataPoint {
  id: string;              // Unique identifier
  timestamp: Date;         // When the event occurred
  location: {
    latitude: number;
    longitude: number;
    altitude?: number;
    accuracy?: number;
  };
  title: string;           // Main title/headline
  description?: string;    // Additional details
  url?: string;           // Link to original content
  source: string;          // Data source name
  category?: string;       // Event category
  metadata?: any;          // Source-specific data
}
```

## License

MIT
