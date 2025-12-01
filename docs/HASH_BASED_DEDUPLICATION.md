# Hash-Based Deduplication

## Overview

The system uses **content-based hashing** to ensure only truly new data points are added to the cache. This prevents duplicates even when sources report the same event multiple times or with slightly different IDs.

## How It Works

### 1. Hash Generation

Each `GeoDataPoint` gets a SHA-256 hash based on its content:

```typescript
{
  source: "GDELT",
  title: "Breaking News Event",
  url: "https://example.com/article",
  lat: "40.7128",  // Rounded to 4 decimal places
  lon: "-74.0060"
}
→ Hash: "a3f2e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0"
```

**Key Properties Used:**
- `source` - Which data source (GDELT, Demo, etc.)
- `title` - Event title/headline
- `url` - Original article URL (if available)
- `location` - Latitude and longitude (rounded)

**Not Used:**
- `timestamp` - Same event can be reported at different times
- `id` - Source-specific ID format
- `description` - Can vary between reports
- `metadata` - Additional info that may change

### 2. Deduplication Process

```
New data arrives from source
   ↓
Generate hash for each data point
   ↓
Check if hash exists in seenHashes Set
   ↓
   ├─ Hash EXISTS → Skip (duplicate)
   │
   └─ Hash NEW → Add to cache
      └─ Add hash to seenHashes Set
```

### 3. Cache Management

The `DataAggregator` maintains:

```typescript
{
  sourceData: Map<string, GeoDataPoint[]>,  // Data per source
  seenHashes: Set<string>,                  // All seen hashes
  cache: GeoDataPoint[]                     // Combined cache
}
```

**Benefits:**
- O(1) duplicate detection (hash lookup)
- Memory efficient (only store hashes, not full objects)
- Works across all sources
- Survives source refreshes

## Example Scenarios

### Scenario 1: Same Event, Different Times

**First Report (t=0s):**
```json
{
  "title": "Earthquake in Chile",
  "url": "https://news.com/quake-123",
  "timestamp": "2025-12-01T10:00:00Z"
}
→ Hash: "abc123..."
→ Added to cache ✓
```

**Second Report (t=30s):**
```json
{
  "title": "Earthquake in Chile",
  "url": "https://news.com/quake-123",
  "timestamp": "2025-12-01T10:00:30Z"  // Different!
}
→ Hash: "abc123..." (same!)
→ Filtered out (duplicate) ✗
```

### Scenario 2: Same Event, Different Sources

**GDELT Report:**
```json
{
  "source": "GDELT",
  "title": "Summit in Paris",
  "url": "https://reuters.com/summit"
}
→ Hash: "def456..."
→ Added to cache ✓
```

**Demo Report (different source, same event):**
```json
{
  "source": "Demo",
  "title": "Summit in Paris",
  "url": "https://reuters.com/summit"
}
→ Hash: "xyz789..." (different source = different hash)
→ Added to cache ✓ (intentionally kept)
```

**Why?** Different sources may have different perspectives on the same event.

### Scenario 3: Similar Events, Different Locations

**Event in New York:**
```json
{
  "title": "Breaking News",
  "location": { "lat": 40.7128, "lon": -74.0060 }
}
→ Hash: "aaa111..."
→ Added ✓
```

**Event in Los Angeles:**
```json
{
  "title": "Breaking News",
  "location": { "lat": 34.0522, "lon": -118.2437 }
}
→ Hash: "bbb222..." (different location = different hash)
→ Added ✓
```

## API Endpoints

### Get Cache Statistics

```bash
curl http://localhost:3000/api/cache/stats
```

Response:
```json
{
  "success": true,
  "totalPoints": 250,
  "uniqueHashes": 250,
  "sourceCount": 2,
  "lastUpdate": "2025-12-01T22:15:00.000Z"
}
```

**Metrics:**
- `totalPoints` - Total data points in cache
- `uniqueHashes` - Number of unique hashes (should equal totalPoints)
- `sourceCount` - Number of active data sources
- `lastUpdate` - Last cache update time

### Clear Cache (Debug)

```bash
curl -X POST http://localhost:3000/api/cache/clear
```

Response:
```json
{
  "success": true,
  "message": "Cache cleared successfully"
}
```

**Warning:** This clears ALL data and resets hash tracking. Use only for debugging/testing.

## Console Output

### New Data Added

```
✓ Demo updated - Added 19 new points - Cache now has 19 points
✓ GDELT updated - Added 187 new points - Cache now has 206 points
```

### Duplicates Filtered

```
○ Demo updated - No new data (15 duplicate points filtered)
○ GDELT updated - No new data (250 duplicate points filtered)
```

### Mixed Results

```
✓ GDELT updated - Added 23 new points - Cache now has 229 points
# (Means 227 duplicates were filtered out of 250 fetched)
```

## Performance Characteristics

### Memory Usage

**Hash Storage:**
```
1 hash = 64 characters (SHA-256 hex)
1000 hashes ≈ 64 KB
10,000 hashes ≈ 640 KB
100,000 hashes ≈ 6.4 MB
```

**Typical Usage:**
- Small deployment: 500-1,000 hashes (< 100 KB)
- Medium deployment: 10,000-50,000 hashes (1-5 MB)
- Large deployment: 100,000+ hashes (> 10 MB)

### CPU Usage

**Hash Generation:**
- SHA-256 computation: ~0.01ms per hash
- 1000 data points: ~10ms total

**Duplicate Detection:**
- Set lookup: O(1) - instant
- 1000 data points: < 1ms total

**Total Overhead:**
- Negligible for typical workloads
- <15ms per 1000 data points

## Configuration

### Custom Hash Function

If you need different hash behavior, modify `src/utils/hashUtils.ts`:

```typescript
export function generateHash(dataPoint: Omit<GeoDataPoint, 'hash'>): string {
  const hashContent = JSON.stringify({
    source: dataPoint.source,
    title: dataPoint.title,
    url: dataPoint.url,
    // Add or remove properties as needed
    category: dataPoint.category,  // Example: include category
  });

  return crypto.createHash('sha256').update(hashContent).digest('hex');
}
```

### Location Precision

Currently rounds to 4 decimal places (~11 meters):

```typescript
lat: dataPoint.location.latitude.toFixed(4),
lon: dataPoint.location.longitude.toFixed(4),
```

**Change precision:**
```typescript
// More precise (2 decimal places ~1.1 km)
lat: dataPoint.location.latitude.toFixed(2),

// Less precise (6 decimal places ~0.1 m)
lat: dataPoint.location.latitude.toFixed(6),
```

## Benefits

### 1. **True Duplicate Detection** ✓

**Without Hashing:**
```
Same event with different IDs = Both added
"gdelt-article-123" vs "gdelt-article-124" = 2 cache entries
```

**With Hashing:**
```
Same event with different IDs = One added
Hash matches = Duplicate filtered
```

### 2. **Cross-Refresh Deduplication** ✓

**Without Hashing:**
```
t=0:00  Fetch 100 articles → Cache: 100
t=2:00  Fetch 100 articles (95 same) → Cache: 195 (duplicates!)
```

**With Hashing:**
```
t=0:00  Fetch 100 articles → Cache: 100
t=2:00  Fetch 100 articles (95 same) → Cache: 105 (only 5 new added)
```

### 3. **Memory Efficiency** ✓

**Without Hashing:**
```
Cache grows unbounded with duplicates
1000 articles/refresh × 10 refreshes = 10,000 entries (mostly duplicates)
```

**With Hashing:**
```
Cache only grows with new content
1000 articles/refresh × 10 refreshes = ~1,500 entries (real unique data)
```

### 4. **Source Independence** ✓

Each source can refresh independently without creating duplicates:

```
Demo refreshes every 30s → Only NEW events added
GDELT refreshes every 2m → Only NEW news added
No cross-contamination
```

## Limitations

### 1. **Similar But Different Events**

If two legitimately different events have the same title, URL, and location, they'll be treated as duplicates:

```json
{
  "title": "Press Conference",
  "location": "White House",
  "date": "2025-12-01"
}
vs
{
  "title": "Press Conference",
  "location": "White House",
  "date": "2025-12-02"  // Different day, same hash
}
```

**Solution:** Include timestamp in hash if this is an issue.

### 2. **Memory Growth**

The `seenHashes` Set grows indefinitely:

```
Day 1: 1,000 hashes
Day 7: 7,000 hashes
Day 30: 30,000 hashes
```

**Solutions:**
- Implement hash expiry (remove old hashes after N days)
- Limit cache size (FIFO or LRU eviction)
- Periodic cache clearing

### 3. **No Semantic Understanding**

Hash is purely content-based:

```
"Summit in Paris" ≠ "Paris Summit"
→ Different hashes, both added
```

**Solution:** Normalize titles before hashing (lowercase, sort words, etc.)

## Testing

### Verify Hash Generation

```typescript
import { generateHash } from './utils/hashUtils';

const point1 = {
  source: 'Test',
  title: 'Event A',
  url: 'https://example.com',
  location: { latitude: 40.7128, longitude: -74.0060 }
};

const point2 = {
  ...point1,
  timestamp: new Date()  // Different timestamp
};

const hash1 = generateHash(point1);
const hash2 = generateHash(point2);

console.log(hash1 === hash2);  // Should be true
```

### Monitor Duplicate Rate

```bash
# Watch logs for duplicate filtering
tail -f logs/app.log | grep "duplicate points filtered"

# Check cache efficiency
curl http://localhost:3000/api/cache/stats
```

### Stress Test

```bash
# Rapidly refresh sources
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/data/refresh
  sleep 5
done

# Check cache didn't explode with duplicates
curl http://localhost:3000/api/cache/stats
```

## Migration Guide

### From ID-Based to Hash-Based

**Before:**
```typescript
{
  id: "gdelt-123",
  title: "Event",
  // ... other fields
}
```

**After:**
```typescript
{
  id: "gdelt-123",
  hash: "a3f2e9d8...",  // Auto-generated
  title: "Event",
  // ... other fields
}
```

**No code changes needed!** The `createGeoDataPoint()` helper automatically adds hashes.

### For Custom Sources

Update your source to use `createGeoDataPoint()`:

```typescript
import { createGeoDataPoint } from '../utils/hashUtils';

// Before
return [{
  id: 'custom-123',
  title: 'Event',
  // ...
}];

// After
return [createGeoDataPoint({
  id: 'custom-123',
  title: 'Event',
  // ...
})];
```

## Future Enhancements

### 1. **Smart Hash Expiry**

```typescript
// Remove hashes older than 7 days
const MAX_HASH_AGE = 7 * 24 * 60 * 60 * 1000;

setInterval(() => {
  const cutoff = Date.now() - MAX_HASH_AGE;
  // Remove old hashes...
}, 24 * 60 * 60 * 1000);
```

### 2. **Bloom Filters**

For very large deployments, use Bloom filters for memory efficiency:

```typescript
import { BloomFilter } from 'bloomfilter';

const filter = new BloomFilter(32 * 256, 16);
// 10x less memory than Set
```

### 3. **Fuzzy Matching**

Detect similar (not identical) events:

```typescript
import { levenshtein } from 'string-similarity';

if (similarity(title1, title2) > 0.9) {
  // Likely duplicate
}
```

### 4. **Distributed Hash Tracking**

For multi-instance deployments, share hashes via Redis:

```typescript
await redis.sismember('seen_hashes', hash);
```

---

**Result:** Robust, efficient duplicate detection that prevents cache bloat and ensures data quality! 🎯
