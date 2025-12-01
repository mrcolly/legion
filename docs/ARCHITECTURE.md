# Legion Backend - Architecture

## Design Principles

### 1. Non-Blocking Architecture

**Server Starts Immediately**
- The HTTP server starts and accepts requests BEFORE data is loaded
- Data fetching happens in the background
- APIs return empty datasets initially if called before first fetch completes
- No blocking operations during server startup

```typescript
// Server starts first
const server = app.listen(PORT);

// Then fetch data in background (non-blocking)
(async () => {
  await aggregator.fetchAll();
})();
```

**Why?**
- Fast startup times
- High availability - server is always ready to respond
- Better user experience - no waiting for slow data sources
- Graceful handling of external API failures

### 2. Parallel + Incremental Data Fetching

**All Sources Fetch Simultaneously with Streaming Updates**

The `DataAggregator` fetches from all sources in parallel AND updates the cache as soon as each source completes:

```typescript
// Start all fetches in parallel
const fetchPromises = enabledSources.map(async (source) => {
  const data = await source.fetchData();
  
  // Update cache IMMEDIATELY when this source completes
  sourceData.set(source.getName(), data);
  this.updateCacheFromSources(sourceData);
  
  return data;
});

await Promise.all(fetchPromises);
```

**Benefits:**
- ✅ **Fastest possible data availability** - Fast sources update cache immediately
- ✅ **Incremental updates** - Data appears as it arrives, not all at once
- ✅ **One slow source doesn't block others** - Cache updates even if one source is slow
- ✅ **Failed sources don't crash the system** - Try/catch per source
- ✅ **Maximum throughput** - All sources run concurrently

**Example Timeline:**

```
Sequential (BAD):
Source A: ████████ (2s)           Cache empty
Source B:         ████████ (2s)    Cache empty  
Source C:                 ████████ (2s) Cache empty
                                  └─ All data arrives at 6s
Total: 6 seconds

Parallel but waiting (OKAY):
Source A: ████████ (2s)           Cache empty
Source B: ████████ (2s)           Cache empty
Source C: ████████ (2s)           Cache empty
          └─────────────────────── All data arrives at 2s
Total: 2 seconds

Parallel + Incremental (BEST):
Source A: ██ (0.5s)               └─ Data available at 0.5s ✓
Source B: ████████ (2s)           └─ More data at 2s ✓
Source C: ████████████ (3s)       └─ Final data at 3s ✓
Total: 3s, but first data at 0.5s!
```

**Real-World Example:**
- Demo source: ~100ms → Cache has demo data immediately
- GDELT source: ~3000ms → Cache updates with real news data when ready
- Users see demo data in 100ms instead of waiting 3 seconds!

### 3. Data Source Independence with Individual Refresh Cycles

Each data source is completely independent with its own update schedule:

```
┌──────────────────────────────────────────────────────┐
│              DataAggregator                          │
│  ┌────────────────────────────────────────────────┐ │
│  │ Manages:                                       │ │
│  │ - Source registration                          │ │
│  │ - Data caching (receives updates from sources) │ │
│  │ - Deduplication                                │ │
│  │ - Incremental cache updates                    │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
         ↑            ↑            ↑            ↑
         │            │            │            │
    ┌────┴────┐  ┌───┴────┐  ┌───┴────┐  ┌───┴────┐
    │ Source  │  │ Source │  │ Source │  │ Source │
    │   1     │  │   2    │  │   3    │  │   N    │
    │ 30s ⟳   │  │ 2m ⟳   │  │ 5m ⟳   │  │ 10m ⟳  │
    └─────────┘  └────────┘  └────────┘  └────────┘
      Demo        GDELT       Twitter     Custom
      (fast)      (medium)    (slow)      (very slow)
```

**Key Features:**
- ✅ Sources don't know about each other
- ✅ Add/remove sources without affecting others
- ✅ **Each source has its own independent refresh interval**
- ✅ **Sources auto-refresh on their own schedule**
- ✅ **Fast sources update cache more frequently**
- ✅ **Slow sources don't block fast sources**
- ✅ Failures are isolated
- ✅ Aggregator receives updates via callback

### 4. Error Resilience

**Multi-Layer Error Handling:**

1. **Source Level**
   ```typescript
   try {
     const data = await fetchFromAPI();
     this.updateStats(true, data.length);
   } catch (error) {
     console.error('Error:', error);
     this.updateStats(false);
     return []; // Return empty, don't crash
   }
   ```

2. **Aggregator Level**
   ```typescript
   const results = await Promise.allSettled([...]);
   // Some can fail, others succeed
   ```

3. **Application Level**
   ```typescript
   aggregator.fetchAll().catch(error => {
     console.error('Background fetch failed:', error);
     // Server keeps running
   });
   ```

**Result:**
- ✅ One failing source doesn't crash the system
- ✅ Partial data is better than no data
- ✅ Health monitoring tracks each source's status
- ✅ Auto-retry on next refresh cycle

### 5. Geographic Data Fallback

**Two-Tier Geolocation Strategy:**

```
┌──────────────────────────────────┐
│  Article has precise coords?     │
│  (lat/lon from article)          │
└────────┬─────────────────────────┘
         │
    ┌────▼────┐
    │   YES   │
    └────┬────┘
         │
    ┌────▼─────────────────────┐
    │ Use precise coordinates  │
    │ geoType: "precise"       │
    └──────────────────────────┘

    ┌────▼────┐
    │   NO    │
    └────┬────┘
         │
    ┌────▼─────────────────────┐
    │ Has source country code? │
    └────┬─────────────────────┘
         │
    ┌────▼────┐
    │   YES   │
    └────┬────┘
         │
    ┌────▼──────────────────────┐
    │ Use country capital coords│
    │ geoType: "country-fallback"│
    │ accuracy: 50000           │
    └───────────────────────────┘
```

**Impact:**
- 🚀 **Dramatically increases data availability**
- 📍 Most articles have country → most get displayed
- 🎯 Metadata indicates precision level
- 🎨 Frontend can render differently based on accuracy

### 6. Modern JavaScript (ES Modules)

**Top-Level Await**

```typescript
// Old way (CommonJS)
async function main() {
  await setup();
}
main().catch(handleError);

// New way (ES Modules)
await setup(); // Top-level await
```

**Configuration:**
- `package.json`: `"type": "module"`
- `tsconfig.json`: `"module": "ES2022"`
- Cleaner, more modern code

## Data Flow

### Startup Sequence

```
1. Load environment variables
   ↓
2. Create DataAggregator
   ↓
3. Register data sources (Demo, GDELT, etc.)
   ↓
4. Initialize sources (setup, auth, etc.)
   ↓
5. START HTTP SERVER ⚡ (non-blocking)
   ↓
6. Fetch initial data in background
   ↓
7. Set up auto-refresh interval
```

### Request Flow

```
Client Request
   ↓
Express Middleware (CORS, JSON)
   ↓
Route Handler
   ↓
DataAggregator.getCachedData()
   ↓
Transform/Filter (if needed)
   ↓
JSON Response
```

### Refresh Flow (Independent Source Cycles)

**Each source has its own timer:**

```
┌─────────────────────────────────────────────────────┐
│ Source 1 (Demo) - 30 second cycle                   │
│                                                      │
│ t=0s    → Fetch → Update cache                      │
│ t=30s   → Fetch → Update cache                      │
│ t=60s   → Fetch → Update cache                      │
│ t=90s   → Fetch → Update cache                      │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Source 2 (GDELT) - 2 minute cycle                   │
│                                                      │
│ t=0s    → Fetch → Update cache                      │
│ t=120s  → Fetch → Update cache                      │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Source 3 (Twitter) - 5 minute cycle                 │
│                                                      │
│ t=0s    → Fetch → Update cache                      │
│ t=300s  → Fetch → Update cache                      │
└─────────────────────────────────────────────────────┘

All sources update the SAME cache independently:

Source fires timer
   ↓
Fetch data from API
   ↓
Call callback: aggregator.handleSourceUpdate(name, data)
   ↓
Aggregator stores source data
   ↓
Rebuild cache from all sources
   ↓
Deduplicate by ID
   ↓
Update cache
   ↓
Available IMMEDIATELY for API requests
```

**Benefits:**
- Fast-changing data (Twitter) refreshes frequently
- Slow-changing data (news) refreshes less often
- Reduces unnecessary API calls
- Each source optimized for its own update pattern

## Performance Characteristics

### Startup Time
- **Target:** < 1 second
- **Actual:** ~100-300ms (without waiting for data)
- **Bottleneck:** None (non-blocking)

### Data Fetch Time
- **Sequential:** Would be 4-8 seconds
- **Parallel:** 2-4 seconds (depends on slowest source)
- **Impact on Server:** None (background operation)

### Memory Usage
- **Base:** ~50 MB (Node + Express)
- **Per 1000 data points:** ~2 MB
- **Typical:** ~60-70 MB total

### API Response Time
- **Cached data:** < 10ms
- **Refresh trigger:** < 50ms (returns immediately)
- **Bounding box filter:** < 20ms

## Scalability

### Horizontal Scaling
- ✅ Stateless design (no shared state between instances)
- ✅ Each instance fetches independently
- ✅ Can use load balancer
- ❌ No coordination (each fetches same data)

**Future Enhancement:** Add Redis for shared caching

### Vertical Scaling
- 📈 Memory grows linearly with data points
- 📈 CPU usage minimal (mostly I/O bound)
- 📈 Can handle 10,000+ data points easily

### Data Source Scaling
- ✅ Add unlimited sources
- ✅ Parallel fetching prevents slowdown
- ⚠️ Each source adds ~2-4 seconds to fetch cycle
- 💡 Consider grouping similar sources

## Security Considerations

### Current Implementation
- ✅ CORS enabled (configurable)
- ✅ No authentication (public API)
- ✅ Rate limiting: via data source refresh intervals
- ✅ Error messages don't expose internals

### Production Recommendations
1. **Add API Authentication** (JWT, API keys)
2. **Implement Rate Limiting** (express-rate-limit)
3. **Add Request Validation** (joi, zod)
4. **Enable HTTPS** (SSL/TLS)
5. **Add Monitoring** (Prometheus, DataDog)

## Future Enhancements

### 1. WebSocket Support
Push updates to clients in real-time instead of polling

### 2. Database Integration
Store historical data for playback and analysis

### 3. Caching Layer
Redis for shared cache across multiple instances

### 4. Message Queue
RabbitMQ/Kafka for better data flow management

### 5. Data Transformation Pipeline
Process, enrich, and filter data before caching

### 6. Geographic Clustering
Group nearby points automatically

### 7. Advanced Filtering
Time ranges, keywords, sentiment, categories

## Testing Strategy

### Unit Tests
- Test each data source independently
- Mock external APIs
- Test error handling

### Integration Tests
- Test DataAggregator with multiple sources
- Test parallel fetching
- Test deduplication

### E2E Tests
- Test full API flow
- Test server startup sequence
- Test graceful shutdown

### Load Tests
- Simulate high request volume
- Test with large datasets
- Measure response times

## Monitoring & Observability

### Metrics to Track
- Source health (success/failure rate)
- Fetch duration per source
- Total data points cached
- API response times
- Error rates
- Memory usage

### Logging Strategy
- Structured logging (JSON format)
- Log levels: error, warn, info, debug
- Source-specific prefixes
- Timestamp all logs

### Health Checks
- `/health` endpoint (basic)
- `/api/sources` endpoint (detailed source stats)

---

**Built with performance, scalability, and reliability in mind.**
