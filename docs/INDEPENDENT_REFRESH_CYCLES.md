# Independent Refresh Cycles

## Overview

Each data source manages its own refresh cycle independently. This means:
- Fast-updating sources (e.g., Twitter) can refresh every 30 seconds
- Slow-updating sources (e.g., news archives) can refresh every 10 minutes
- No unnecessary API calls to slow-changing data sources
- Optimal balance between freshness and API rate limits

## How It Works

### Architecture

```
┌────────────────────────────────────┐
│       DataAggregator               │
│  (Central cache manager)           │
│                                    │
│  handleSourceUpdate(name, data) {  │
│    sourceData.set(name, data);    │
│    rebuildCache();                │
│  }                                 │
└─────▲─────▲─────▲─────▲───────────┘
      │     │     │     │
      │     │     │     │
   callback callback callback callback
      │     │     │     │
┌─────┴─────┴─────┴─────┴───────────┐
│                                    │
│  ┌──────────┐  ┌──────────┐       │
│  │ Source 1 │  │ Source 2 │  ...  │
│  │          │  │          │       │
│  │ Timer:   │  │ Timer:   │       │
│  │ 30s ⟳    │  │ 2m ⟳     │       │
│  └──────────┘  └──────────┘       │
│                                    │
└────────────────────────────────────┘
```

### Source Lifecycle

1. **Registration**
   ```typescript
   aggregator.registerSource(new DemoSource());
   // Sets up callback for this source
   ```

2. **Initial Fetch**
   ```typescript
   await aggregator.fetchAll();
   // Fetches initial data from all sources
   ```

3. **Start Auto-Refresh**
   ```typescript
   aggregator.startAutoRefresh();
   // Each source starts its own timer
   ```

4. **Independent Updates**
   ```typescript
   // Demo source: every 30s
   setInterval(() => {
     const data = await fetchData();
     callback('Demo', data);  // → Updates cache
   }, 30000);
   
   // GDELT source: every 2m
   setInterval(() => {
     const data = await fetchData();
     callback('GDELT', data);  // → Updates cache
   }, 120000);
   ```

## Configuration

### Per-Source Configuration

Each source defines its own refresh interval:

```typescript
// Fast-updating source (30 seconds)
export class TwitterSource extends DataSourceService {
  constructor() {
    super({
      name: 'Twitter',
      enabled: true,
      refreshInterval: 30000,  // 30 seconds
    });
  }
}

// Medium-updating source (2 minutes)
export class GDELTSource extends DataSourceService {
  constructor() {
    super({
      name: 'GDELT',
      enabled: true,
      refreshInterval: 120000,  // 2 minutes
    });
  }
}

// Slow-updating source (10 minutes)
export class ArchiveSource extends DataSourceService {
  constructor() {
    super({
      name: 'Archive',
      enabled: true,
      refreshInterval: 600000,  // 10 minutes
    });
  }
}

// No auto-refresh (manual only)
export class ManualSource extends DataSourceService {
  constructor() {
    super({
      name: 'Manual',
      enabled: true,
      refreshInterval: undefined,  // No auto-refresh
    });
  }
}
```

## Example Timeline

**Sources:**
- Demo: 30s refresh
- GDELT: 2m refresh  
- Twitter: 1m refresh

```
Time    Demo    GDELT   Twitter  Cache Updates
─────────────────────────────────────────────────
0:00    Fetch   Fetch   Fetch    Initial (all 3)
0:30    Fetch   -       -        +Demo
1:00    Fetch   -       Fetch    +Demo +Twitter
1:30    Fetch   -       -        +Demo
2:00    Fetch   Fetch   Fetch    +Demo +GDELT +Twitter
2:30    Fetch   -       -        +Demo
3:00    Fetch   -       Fetch    +Demo +Twitter
3:30    Fetch   -       -        +Demo
4:00    Fetch   Fetch   Fetch    +Demo +GDELT +Twitter
```

Cache is updated 12 times in 4 minutes, not just once!

## Benefits

### 1. **Optimal API Usage** 📊

**Without Independent Cycles:**
```
Every 2 minutes, ALL sources fetch:
- Demo (changes every 10s) → 2m refresh (too slow!)
- GDELT (changes every 5m) → 2m refresh (wasteful)
- Twitter (changes every 30s) → 2m refresh (too slow!)
```

**With Independent Cycles:**
```
- Demo (changes every 10s) → 30s refresh ✓
- GDELT (changes every 5m) → 5m refresh ✓
- Twitter (changes every 30s) → 30s refresh ✓
```

### 2. **Rate Limit Compliance** 🚦

Different APIs have different rate limits:
- Twitter: 900 requests/15min → Can refresh every 1s
- GDELT: No strict limit → Can refresh every 2m
- Custom API: 10 requests/hour → Can refresh every 6m

Configure each source appropriately!

### 3. **Resource Efficiency** 💰

**Cost savings:**
- Don't fetch slow-changing data frequently
- Reduce bandwidth usage
- Lower API costs for paid sources

**Example:**
- News updates every 5 minutes
- Fetching every 30s = 10 unnecessary API calls per 5 minutes
- With 5m refresh = 0 unnecessary calls
- **Savings: 90% reduction in API calls**

### 4. **Faster Data Availability** ⚡

Fast sources don't wait for slow sources:

```
Old way (global 2m refresh):
t=0:00  All sources fetch
t=2:00  All sources fetch again
        → Fast data is 2 minutes stale

New way (independent cycles):
t=0:00  All sources fetch
t=0:30  Fast source refreshes ✓
t=1:00  Fast source refreshes ✓
t=1:30  Fast source refreshes ✓
t=2:00  Slow source refreshes ✓
        → Fast data is never more than 30s stale
```

### 5. **Flexible Scheduling** 📅

Different times of day might need different frequencies:

```typescript
class NewsSource extends DataSourceService {
  getRefreshInterval(): number {
    const hour = new Date().getHours();
    
    // News breaks frequently during business hours
    if (hour >= 9 && hour <= 17) {
      return 60000;  // 1 minute
    }
    
    // Slower at night
    return 300000;  // 5 minutes
  }
}
```

## Implementation Details

### DataSourceService Methods

Each source implements:

```typescript
class MySource extends DataSourceService {
  // Called when source is registered
  setDataUpdateCallback(callback) {
    this.onDataUpdate = callback;
  }
  
  // Start the auto-refresh timer
  startAutoRefresh() {
    this.timer = setInterval(async () => {
      const data = await this.fetchData();
      this.onDataUpdate(this.getName(), data);
    }, this.config.refreshInterval);
  }
  
  // Stop the timer
  stopAutoRefresh() {
    clearInterval(this.timer);
  }
  
  // Cleanup on shutdown
  async cleanup() {
    this.stopAutoRefresh();
  }
}
```

### DataAggregator Methods

The aggregator manages updates:

```typescript
class DataAggregator {
  // Store data per source
  private sourceData = new Map<string, GeoDataPoint[]>();
  
  // Handle update from any source
  private handleSourceUpdate(name, data) {
    this.sourceData.set(name, data);
    this.rebuildCache();
  }
  
  // Rebuild cache from all sources
  private rebuildCache() {
    const allData = [];
    for (const data of this.sourceData.values()) {
      allData.push(...data);
    }
    this.cache = this.deduplicateData(allData);
  }
  
  // Start all source timers
  startAutoRefresh() {
    for (const source of this.sources.values()) {
      source.startAutoRefresh();
    }
  }
  
  // Stop all source timers
  stopAutoRefresh() {
    for (const source of this.sources.values()) {
      source.stopAutoRefresh();
    }
  }
}
```

## Monitoring

### Console Output

You'll see individual source updates:

```
🚀 Starting Legion Backend...
📊 Enabling Demo data source (for testing)
Registered data source: Demo
📰 Enabling GDELT news data source
Registered data source: GDELT
✅ Server running on http://localhost:3000

📡 Initial fetch from 2 sources...
✓ [1/2] Demo initial fetch completed
✓ Demo updated - Cache now has 19 points (from 1 sources)
✓ [2/2] GDELT initial fetch completed
✓ GDELT updated - Cache now has 206 points (from 2 sources)
✓ Initial fetch complete - Cache: 206 total data points

🔄 Starting auto-refresh for 2 sources
[Demo] Starting auto-refresh every 30000ms
[GDELT] Starting auto-refresh every 120000ms

// 30 seconds later...
[Demo] Auto-refreshing...
[Demo] Generated 15 demo events
✓ Demo updated - Cache now has 201 points (from 2 sources)

// 2 minutes later...
[GDELT] Auto-refreshing...
[GDELT] Fetched 193 geo-located data points
✓ GDELT updated - Cache now has 208 points (from 2 sources)
```

### Health Monitoring

Track each source's refresh status:

```bash
curl http://localhost:3000/api/sources | jq '.sources[] | {
  name,
  enabled,
  lastUpdate: .stats.lastFetchTime,
  health: .stats.isHealthy
}'
```

Output:
```json
{
  "name": "Demo",
  "enabled": true,
  "lastUpdate": "2025-12-01T22:30:15.123Z",
  "health": true
}
{
  "name": "GDELT",
  "enabled": true,
  "lastUpdate": "2025-12-01T22:28:45.456Z",
  "health": true
}
```

## Best Practices

### 1. **Match Source Update Frequency to Data Change Rate**

```typescript
// Real-time data (Twitter, live feeds)
refreshInterval: 30000,  // 30 seconds

// Frequently updated (news)
refreshInterval: 120000,  // 2 minutes

// Hourly updates (weather)
refreshInterval: 3600000,  // 60 minutes

// Daily updates (historical data)
refreshInterval: 86400000,  // 24 hours
```

### 2. **Respect API Rate Limits**

```typescript
// Twitter: 900 requests / 15 minutes
// = 1 request per second allowed
// Use 30s refresh for safety margin
refreshInterval: 30000,

// GDELT: No strict limit
// Be reasonable, use 2 minutes
refreshInterval: 120000,
```

### 3. **Consider API Costs**

```typescript
// Free tier: 1000 requests/day
// = 1 request every 86.4 seconds
// Use 2 minute refresh to stay well under limit
refreshInterval: 120000,

// Paid API: $0.01 per request
// Balance cost vs freshness
refreshInterval: 600000,  // 10 minutes = $1.44/day
```

### 4. **Optimize for User Experience**

```typescript
// Demo data for development
// Refresh frequently to see changes quickly
refreshInterval: 10000,  // 10 seconds

// Production data
// Balance freshness with API limits
refreshInterval: 60000,  // 1 minute
```

### 5. **Handle Timezone Differences**

```typescript
class GlobalNewsSource extends DataSourceService {
  getRefreshInterval(): number {
    // Check if it's business hours in major markets
    const nyHour = new Date().getUTCHours() - 5;
    const londonHour = new Date().getUTCHours();
    const tokyoHour = new Date().getUTCHours() + 9;
    
    // Fast refresh during any business hours
    const isBusinessHours = (
      (nyHour >= 9 && nyHour <= 17) ||
      (londonHour >= 9 && londonHour <= 17) ||
      (tokyoHour >= 9 && tokyoHour <= 17)
    );
    
    return isBusinessHours ? 60000 : 300000;
  }
}
```

## Troubleshooting

### Source Not Auto-Refreshing

**Check 1: Refresh interval configured?**
```typescript
// Bad
super({ name: 'MySource', enabled: true });

// Good
super({
  name: 'MySource',
  enabled: true,
  refreshInterval: 60000,  // Must be set!
});
```

**Check 2: Auto-refresh started?**
```typescript
// Make sure this is called
aggregator.startAutoRefresh();
```

**Check 3: Source enabled?**
```typescript
super({
  name: 'MySource',
  enabled: true,  // Must be true
  refreshInterval: 60000,
});
```

### Cache Not Updating

**Check callback set:**
```typescript
// DataAggregator should set this automatically
source.setDataUpdateCallback((name, data) => {
  this.handleSourceUpdate(name, data);
});
```

### Memory Leaks

**Always cleanup:**
```typescript
// On shutdown
await aggregator.cleanup();  // Stops all timers

// Or manually
aggregator.stopAutoRefresh();
```

---

**Result:** Optimized, efficient, and flexible data refresh system! 🚀
