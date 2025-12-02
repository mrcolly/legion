# Backend

Express API server for geolocation event aggregation.

## Commands

```bash
yarn dev          # Development with hot reload
yarn build        # Build for production
yarn start        # Run production build
yarn test         # Run tests
yarn test:watch   # Watch mode
yarn test:coverage # Coverage report
```

## Environment Variables

```bash
PORT=3000           # Server port
LOG_LEVEL=info      # trace, debug, info, warn, error
NODE_ENV=development

# Data sources (all default to false in production)
USE_GDELT=true      # Global news events
USE_USGS=true       # Earthquake data
USE_EONET=true      # NASA natural disasters
USE_RSS=true        # RSS news feeds
USE_DEMO=false      # Demo/test data
```

## Project Structure

```
src/
├── api/
│   └── server.ts       # Express routes
├── services/
│   ├── DataAggregator.ts   # Source management
│   ├── DataSourceService.ts # Base class
│   └── GeoParser.ts        # NLP geocoding
├── sources/
│   ├── GDELTSource.ts
│   ├── USGSSource.ts
│   ├── EONETSource.ts
│   ├── RSSSource.ts
│   └── DemoSource.ts
├── types/
│   └── GeoData.ts      # TypeScript interfaces
└── index.ts            # Entry point
```

## Adding a New Data Source

```typescript
// src/sources/MySource.ts
import { DataSourceService } from '../services/DataSourceService.js';
import type { GeoDataPoint } from '../types/GeoData.js';

export class MySource extends DataSourceService {
  constructor() {
    super({
      name: 'MySource',
      enabled: true,
      refreshInterval: 60000, // 1 minute
    });
  }

  async fetchData(): Promise<GeoDataPoint[]> {
    const data = await fetch('https://api.example.com/events');
    return data.map(item => ({
      id: `mysource-${item.id}`,
      timestamp: new Date(item.date),
      location: { latitude: item.lat, longitude: item.lon },
      title: item.title,
      source: 'MySource',
    }));
  }
}
```

Then register in `src/index.ts`:

```typescript
aggregator.registerSource(new MySource());
```

## Docker

```bash
docker build -t legion-backend .
docker run -p 3000:3000 -e USE_GDELT=true legion-backend
```
