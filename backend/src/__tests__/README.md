# Legion Backend Tests

Comprehensive unit tests for the most critical components of the Legion Backend.

## Test Coverage

### 1. Hash-Based Deduplication (`utils/__tests__/hashUtils.test.ts`)

Tests the core deduplication system that prevents duplicate events from being stored.

**What's tested:**
- ✅ Hash consistency (same content = same hash)
- ✅ Hash uniqueness (different content = different hash)
- ✅ Content-based hashing (ignores timestamp, description, metadata)
- ✅ Coordinate precision rounding (handles floating-point differences)
- ✅ `createGeoDataPoint` helper function

**Why it's critical:** The entire system relies on hash-based deduplication to prevent duplicate events from cluttering the cache.

### 2. Data Aggregation (`services/__tests__/DataAggregator.test.ts`)

Tests the central data management system that coordinates multiple data sources.

**What's tested:**
- ✅ Source registration and management
- ✅ Data fetching from single and multiple sources
- ✅ Hash-based deduplication (including batch deduplication)
- ✅ Incremental data updates
- ✅ Cache management (stats, clearing)
- ✅ Event emission for real-time updates

**Why it's critical:** The DataAggregator is the heart of the system, managing all data flow and ensuring consistency.

### 3. API Endpoints (`api/__tests__/server.test.ts`)

Tests all HTTP API endpoints to ensure correct responses and data handling.

**What's tested:**
- ✅ Health check endpoint
- ✅ Get all data (with sorting and limiting)
- ✅ Bounding box filtering
- ✅ Source statistics
- ✅ Cache statistics
- ✅ Cache clearing
- ✅ Data refresh

**Why it's critical:** The API is the interface between the backend and frontend, ensuring data is delivered correctly.

## Running Tests

### Run All Tests

```bash
npm test
```

### Watch Mode (for development)

```bash
npm run test:watch
```

### Coverage Report

```bash
npm run test:coverage
```

Coverage reports will be generated in `./coverage/` directory.

### Run Specific Test File

```bash
npm test -- src/utils/__tests__/hashUtils.test.ts
```

### Run Tests Matching a Pattern

```bash
npm test -- -t "deduplication"
```

## Test Framework

We use **Vitest** for testing:
- Fast execution
- Great TypeScript support
- Compatible with Jest API
- Built-in coverage reporting

## Writing New Tests

### Test Structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('ComponentName', () => {
  beforeEach(() => {
    // Setup before each test
  });

  describe('method or feature', () => {
    it('should do something specific', () => {
      // Arrange
      const input = ...;

      // Act
      const result = ...;

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

### Best Practices

1. **Test behavior, not implementation** - Focus on what the code does, not how
2. **Use descriptive test names** - Should read like specifications
3. **One assertion per test** - Keep tests focused
4. **Arrange-Act-Assert** - Clear test structure
5. **Mock external dependencies** - Isolate what you're testing

### Example Mock

```typescript
class MockDataSource extends DataSourceService {
  private mockData: GeoDataPoint[] = [];

  constructor(name: string, data: Omit<GeoDataPoint, 'hash'>[] = []) {
    super({ name, enabled: true, refreshInterval: 1000 });
    this.mockData = data.map(d => createGeoDataPoint(d));
  }

  async fetchData(): Promise<GeoDataPoint[]> {
    return [...this.mockData];
  }
}
```

## Continuous Integration

Tests should be run as part of your CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Run tests
  run: npm test

- name: Generate coverage
  run: npm run test:coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
```

## Current Coverage

Run `npm run test:coverage` to see current coverage statistics.

Target coverage goals:
- **Hash utilities**: 100%
- **Data aggregation**: > 90%
- **API endpoints**: > 85%
- **Overall**: > 80%

## Debugging Tests

### Debug a Single Test

```bash
# Add debugger; statement in your test
npm test -- -t "test name"
```

### Verbose Output

```bash
npm test -- --reporter=verbose
```

### See All Console Logs

```bash
npm test -- --reporter=verbose --silent=false
```

## Known Issues & Limitations

1. **SSE Testing**: Server-Sent Events are not fully tested (requires WebSocket mocking)
2. **Auto-refresh**: Timer-based auto-refresh is not tested (requires time mocking)
3. **GDELT API**: Real API calls are not tested (using mocks instead)

## Future Test Additions

Consider adding:
- [ ] Integration tests (full end-to-end flows)
- [ ] Performance tests (large datasets)
- [ ] Stress tests (concurrent requests)
- [ ] GDELT date parsing edge cases
- [ ] Country coordinates fallback scenarios
- [ ] Error handling and recovery

## Related Documentation

- [PROJECT_SUMMARY.md](../../PROJECT_SUMMARY.md) - Overall project documentation
- [HASH_BASED_DEDUPLICATION.md](../../docs/HASH_BASED_DEDUPLICATION.md) - Deduplication details
- [ARCHITECTURE.md](../../docs/ARCHITECTURE.md) - System architecture

---

**Remember:** Good tests are documentation. They show how the system should behave.
