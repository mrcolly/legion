# Legion Backend - Quick Start Guide

## 🚀 Get Started in 2 Minutes

### 1. Install Dependencies

```bash
npm install
```

### 2. Run the Server

```bash
npm run dev
```

The server starts on `http://localhost:3000` with demo data automatically!

**Optional:** Enable debug logging:
```bash
LOG_LEVEL=debug npm run dev
```

### 3. Test the API

#### Get all geo-located data points (newest first):
```bash
curl http://localhost:3000/api/data | jq '.'
```

#### Get 100 newest data points:
```bash
curl "http://localhost:3000/api/data?limit=100" | jq '.'
```

#### Get oldest data first:
```bash
curl "http://localhost:3000/api/data?sort=asc" | jq '.'
```

#### Check data source health:
```bash
curl http://localhost:3000/api/sources | jq '.'
```

#### Filter by geographic area (Europe & North America, 50 newest):
```bash
curl "http://localhost:3000/api/data/bbox?minLat=40&maxLat=50&minLon=-80&maxLon=10&limit=50" | jq '.'
```

#### Refresh data from sources:
```bash
curl -X POST http://localhost:3000/api/data/refresh | jq '.'
```

#### Get cache statistics:
```bash
curl http://localhost:3000/api/cache/stats | jq '.'
```

## 📊 Example Response

```json
{
  "success": true,
  "count": 10,
  "lastUpdate": "2025-12-01T22:15:19.177Z",
  "data": [
    {
      "id": "demo-1764627319177-0",
      "timestamp": "2025-12-01T21:36:53.133Z",
      "location": {
        "latitude": 40.7128,
        "longitude": -74.0060
      },
      "title": "Economic Report in New York",
      "description": "Live updates from New York, USA",
      "url": "https://example.com/news/1764627319177-0",
      "source": "Demo",
      "category": "news",
      "metadata": {
        "city": "New York",
        "country": "USA",
        "eventType": "Economic Report"
      }
    }
  ]
}
```

## 🔧 Switching to Real GDELT News Data

### Enable GDELT (Recommended for Production)

Create a `.env` file:

```bash
# Enable GDELT for real news events
USE_GDELT=true

# Optional: Keep demo data for testing
USE_DEMO=false
```

Or use both sources simultaneously:

```bash
USE_DEMO=true
USE_GDELT=true
```

The system will aggregate data from all enabled sources!

### About GDELT Data

**Note:** GDELT geo-located data can be sparse. Not all news articles have precise coordinates. The system:
- Fetches articles about topics likely to have locations (conflicts, summits, disasters, etc.)
- Filters for articles with valid latitude/longitude
- May return 0 results during quiet news periods
- Automatically retries every 2 minutes

**Tip:** For reliable testing, use the Demo source. For production visualization, enable GDELT.

### Creating Your Own Source

See `src/sources/DemoSource.ts` or `src/sources/GDELTSource.ts` as examples.

All you need:
1. Extend `DataSourceService`
2. Implement `fetchData()` method
3. Return array of `GeoDataPoint` objects
4. Register it in `src/index.ts`

## 🌍 Building Your 3D Visualization

Your frontend can:
- Poll `GET /api/data` every few seconds
- Use WebSocket (future enhancement) for real-time updates
- Filter by bounding box as users pan/zoom the 3D world
- Display data points at their latitude/longitude coordinates

## 📈 Next Steps

1. **Frontend**: Build a 3D globe visualization (Three.js, Cesium, deck.gl)
2. **Real Data**: Enable GDELT or add other sources (Reddit, Mastodon, etc.)
3. **WebSocket**: Add real-time push updates
4. **Database**: Store historical data for playback/analysis
5. **Filters**: Add time range, category, keyword filters

## 🎯 Architecture Benefits

- ✅ **Source-Agnostic**: Easy to add/swap data sources
- ✅ **Parallel Fetching**: Multiple sources don't block each other
- ✅ **Health Monitoring**: Track each source's status
- ✅ **Graceful Degradation**: One failing source doesn't break the system
- ✅ **Deduplication**: Automatic handling of duplicate data points
- ✅ **Geographic Filtering**: Built-in bounding box queries

Happy coding! 🚀
