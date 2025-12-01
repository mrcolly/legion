# GDELT Data Source Guide

## What is GDELT?

The GDELT Project monitors worldwide news media in over 100 languages, providing a real-time database of global events with geographic coordinates. It's perfect for visualizing breaking news on a 3D world map.

## Enabling GDELT

### Method 1: Environment Variable

Create or edit `.env`:

```bash
USE_GDELT=true
USE_DEMO=false  # Optional: disable demo data
```

Restart the server:
```bash
npm run dev
```

### Method 2: Code Configuration

Edit `src/index.ts`:

```typescript
const ENABLE_GDELT = true;  // Change to true
```

## How GDELT Integration Works

### What Gets Fetched

The system queries GDELT for recent articles about:
- **Conflicts** and protests
- **Political summits** and elections
- **Natural disasters**
- **Weather events**
- **Sports championships**
- Other major events likely to have specific locations

### Query Parameters

```typescript
{
  query: '(conflict OR summit OR election OR protest OR disaster OR weather OR sports)',
  timespan: '1h',       // Last hour only (fresh, real-time news)
  maxrecords: 250,      // Up to 250 articles
  sort: 'DateDesc'      // Most recent first
}
```

### Geographic Filtering

The system uses a **two-tier geolocation strategy**:

1. **Primary: Precise Coordinates**
   - Uses article's exact latitude/longitude when available
   - Validated within ranges (-90 to 90 lat, -180 to 180 lon)
   - Marked with `geoType: 'precise'` in metadata

2. **Fallback: Country-Level Coordinates**
   - When precise coords unavailable, uses source country's capital
   - Supports 50+ major countries worldwide
   - Marked with `geoType: 'country-fallback'` in metadata
   - Includes `accuracy: 50000` (≈50km radius) to indicate lower precision
   - Description includes capital city name

This approach **significantly increases data availability** while maintaining transparency about precision level.

## Expected Behavior

### Normal Operation

- ✅ GDELT may return 0-50 geo-located articles per fetch
- ✅ Some queries return no geo data (this is normal!)
- ✅ More results during major news events
- ✅ Fewer results during quiet news periods
- ✅ Auto-refreshes every 2 minutes

### Sample Console Output

```
[GDELT] Fetching data...
[GDELT] Query: (conflict OR summit OR election OR protest OR disaster OR weather OR sports)
[GDELT] API Response status: 200
[GDELT] Total articles received: 250
[GDELT] Articles with geo data (precise or country fallback): 187
[GDELT] - Precise coordinates: 12
[GDELT] - Country fallback: 175
[GDELT] Successfully fetched 187 geo-located data points
```

As you can see, the country fallback dramatically increases available data points!

## Troubleshooting

### Getting Few Data Points

**Good News:** With country fallback enabled, you should get significantly more data points!

The system now uses a two-tier approach:
- **Tier 1:** Precise coordinates (when available)
- **Tier 2:** Country capital coordinates (fallback)

Most articles have a source country, so you'll typically get 100-200+ data points even when precise geo data is sparse.

### Distinguishing Precise vs Fallback Data

Check the `geoType` field in metadata:
- `"precise"` - Exact coordinates from the article
- `"country-fallback"` - Using capital city coordinates

Fallback data also includes:
- `accuracy: 50000` in the location object
- Capital city name in the description
- `fallbackCity` in metadata

**In your 3D visualization:**
- You might want to render fallback points differently (e.g., lower opacity, different icon)
- Use the `accuracy` field to show uncertainty radius
- Group nearby country-fallback points to avoid clutter

### API Rate Limits

GDELT's public API is generally permissive, but:
- Avoid fetching more frequently than every 60 seconds
- Current setting: 2 minute intervals (safe)
- No API key required
- Free for non-commercial use

## Customizing GDELT Queries

Edit `src/sources/GDELTSource.ts`:

### Broader Query (More Results, Less Geo)
```typescript
const params = {
  query: 'sourcelang:english',  // All English articles
  timespan: '6h',                // Longer time window (6 hours)
  // ...
};
```

### Focused Query (Current - Fresh Real-Time)
```typescript
const params = {
  query: '(conflict OR summit OR election OR protest OR disaster OR weather OR sports)',
  timespan: '1h',                // Last hour only - very fresh!
  // ...
};
```

### Ultra-Focused (Very Specific Events)
```typescript
const params = {
  query: '(earthquake OR hurricane OR summit)',  // Specific events only
  timespan: '30m',               // Last 30 minutes
  // ...
};
```

### Geographic Region Filter
```typescript
const params = {
  query: 'sourcecountry:US',  // US sources only
  // ...
};
```

## Combining Multiple Sources

**Recommended approach for production:**

```bash
# .env
USE_DEMO=true   # Provides baseline data
USE_GDELT=true  # Adds real news events
```

The DataAggregator will:
- Fetch from both sources in parallel
- Merge results
- Deduplicate by ID
- Return combined dataset

## Data Structure

GDELT articles are transformed to:

### Precise Coordinates Example
```typescript
{
  id: "gdelt-<url>-<date>",
  timestamp: Date,
  location: {
    latitude: 40.7128,
    longitude: -74.0060
  },
  title: "Article headline",
  description: "Source: domain.com | Country: US",
  url: "https://original-article.com",
  source: "GDELT",
  category: "news",
  metadata: {
    domain: "example.com",
    language: "english",
    sourceCountry: "US",
    socialImage: "https://...",
    seenDate: "20231201T120000Z",
    geoType: "precise"
  }
}
```

### Country Fallback Example
```typescript
{
  id: "gdelt-<url>-<date>",
  timestamp: Date,
  location: {
    latitude: 38.9072,
    longitude: -77.0369,
    accuracy: 50000  // ≈50km radius
  },
  title: "Article headline",
  description: "Source: domain.com | Country: US (Washington DC)",
  url: "https://original-article.com",
  source: "GDELT",
  category: "news",
  metadata: {
    domain: "example.com",
    language: "english",
    sourceCountry: "US",
    socialImage: "https://...",
    seenDate: "20231201T120000Z",
    geoType: "country-fallback",
    fallbackCity: "Washington DC"
  }
}
```

### Supported Countries (50+)

The system supports both ISO country codes and full country names (as used by GDELT):

**Full Names:** United States, United Kingdom, Canada, Australia, Germany, France, Italy, Spain, Japan, China, India, Brazil, Mexico, Argentina, Russia, South Korea, Indonesia, Turkey, Saudi Arabia, South Africa, Egypt, Nigeria, Kenya, Poland, Netherlands, Belgium, Sweden, Norway, Denmark, Finland, Switzerland, Austria, Greece, Portugal, Ireland, New Zealand, Singapore, Malaysia, Thailand, Vietnam, Philippines, Pakistan, Bangladesh, Israel, United Arab Emirates, Chile, Colombia, Peru, Venezuela, Ukraine, Romania, Czech Republic, Hungary, and more...

**ISO Codes:** US, GB, CA, AU, DE, FR, IT, ES, JP, CN, IN, BR, MX, AR, RU, KR, ID, TR, SA, ZA, EG, NG, KE, PL, NL, BE, SE, NO, DK, FI, CH, AT, GR, PT, IE, NZ, SG, MY, TH, VN, PH, PK, BD, IL, AE, CL, CO, PE, VE, UA, RO, CZ, HU

**Note:** GDELT uses full country names (e.g., "Chile", "United States"), which are automatically mapped to coordinates.

## API Testing with GDELT

```bash
# Check GDELT source status
curl http://localhost:3000/api/sources | jq '.sources[] | select(.name=="GDELT")'

# Force refresh GDELT data
curl -X POST http://localhost:3000/api/data/refresh

# Get only GDELT data points
curl http://localhost:3000/api/data | jq '.data[] | select(.source=="GDELT")'
```

## Performance Considerations

- **Fetch Time:** 2-5 seconds per request
- **Data Volume:** 0-50 points typical, 0-250 max
- **Refresh Rate:** Every 2 minutes
- **Memory:** ~50KB per fetch response
- **Network:** ~200KB per API call

## Future Enhancements

Potential improvements to GDELT integration:

1. **Multiple Queries:** Run several themed queries simultaneously
2. **Caching:** Store recent articles to avoid duplicates
3. **Sentiment Analysis:** Use GDELT's tone fields
4. **Event Clustering:** Group nearby events
5. **Historical Playback:** Fetch past events for timeline visualization
6. **Filtering:** Add category, region, or language filters via API

## Resources

- [GDELT Documentation](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)
- [GDELT Query Guide](https://blog.gdeltproject.org/new-doc-2-0-api-query-guide/)
- [GDELT Project Homepage](https://www.gdeltproject.org/)

---

**Remember:** GDELT is best for production visualization of real global events. For development and testing, use the Demo source for consistent, predictable data.
