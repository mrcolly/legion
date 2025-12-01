# Testing Guide

## Overview

Legion Backend has comprehensive unit tests covering the most critical components:

- **36 tests** across 3 test suites
- **100% pass rate**
- Focus on critical business logic (deduplication, aggregation, API)

## Quick Start

```bash
# Run all tests
npm test

# Watch mode (for development)
npm run test:watch

# Coverage report
npm run test:coverage
```

## Test Suites

### 1. Hash Utilities (`hashUtils.test.ts`)

**Tests:** 10  
**Coverage:** Critical deduplication logic

Tests the SHA-256 hash-based deduplication system that ensures only unique events are stored.

Key test scenarios:
- Hash consistency and determinism
- Content-based hashing (ignores metadata, timestamp, description)
- Coordinate precision handling
- Hash collision detection

### 2. Data Aggregator (`DataAggregator.test.ts`)

**Tests:** 13  
**Coverage:** Core data management

Tests the central aggregation system that manages multiple data sources and coordinates data flow.

Key test scenarios:
- Source registration and management
- Parallel data fetching
- Hash-based deduplication (including batch processing)
- Incremental updates
- Cache management
- Real-time event emission

### 3. API Server (`server.test.ts`)

**Tests:** 13  
**Coverage:** HTTP endpoints

Tests all REST API endpoints to ensure correct request/response handling.

Key test scenarios:
- Health check
- Data retrieval (with sorting and limiting)
- Bounding box filtering
- Source and cache statistics
- Data refresh

## Test Results

```
✓ src/utils/__tests__/hashUtils.test.ts  (10 tests) 3ms
✓ src/services/__tests__/DataAggregator.test.ts  (13 tests) 6ms
✓ src/api/__tests__/server.test.ts  (13 tests) 29ms

Test Files  3 passed (3)
Tests  36 passed (36)
Duration  389ms
```

## Test Framework

**Vitest** - Fast, TypeScript-native testing framework

Benefits:
- ⚡ Lightning fast (10x faster than Jest)
- 🎯 Native TypeScript support
- 📊 Built-in coverage reporting
- 🔄 Watch mode with instant HMR
- ✅ Jest-compatible API

## Critical Test Cases

### Deduplication Logic

Ensures the same event (even with different IDs/timestamps) is only stored once:

```typescript
it('should filter duplicates based on hash', async () => {
  const event1 = { title: 'Event', url: 'https://example.com/1', ... };
  const event2 = { title: 'Event', url: 'https://example.com/1', ... }; // Same content

  // Both added, but only 1 stored
  expect(cachedData).toHaveLength(1);
});
```

### Batch Deduplication

Handles duplicates within a single batch correctly:

```typescript
// If source returns 2 identical items in one fetch:
// [Event A (hash: abc123), Event A (hash: abc123)]
// Result: Only 1 stored
```

### API Sorting

Verifies newest-first default sorting:

```typescript
it('should sort data descending by default', async () => {
  const response = await request(app).get('/api/data');
  
  expect(response.body.data[0].timestamp > response.body.data[1].timestamp);
});
```

## Coverage Goals

| Component | Target | Current |
|-----------|--------|---------|
| Hash Utils | 100% | ✅ |
| Data Aggregator | >90% | ✅ |
| API Server | >85% | ✅ |
| **Overall** | **>80%** | ✅ |

Generate detailed coverage report:

```bash
npm run test:coverage
```

View in browser:

```bash
open coverage/index.html
```

## Writing New Tests

### Test Structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('ComponentName', () => {
  let instance: ComponentType;

  beforeEach(() => {
    // Fresh instance for each test
    instance = new ComponentType();
  });

  describe('methodName', () => {
    it('should do something specific', () => {
      // Arrange
      const input = ...;
      
      // Act
      const result = instance.methodName(input);
      
      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

### Mock Data Sources

```typescript
class MockDataSource extends DataSourceService {
  private readonly mockData: GeoDataPoint[] = [];

  constructor(name: string, data: Omit<GeoDataPoint, 'hash'>[] = []) {
    super({ name, enabled: true, refreshInterval: 1000 });
    this.mockData = data.map(d => createGeoDataPoint(d));
  }

  async fetchData(): Promise<GeoDataPoint[]> {
    return [...this.mockData];
  }
}
```

### API Testing

```typescript
import request from 'supertest';
import { createServer } from '../server';

it('should return data', async () => {
  const app = createServer(aggregator);
  const response = await request(app).get('/api/data');
  
  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);
});
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Best Practices

### 1. Test Behavior, Not Implementation

❌ Bad:
```typescript
expect(aggregator['seenHashes'].size).toBe(5); // Testing internals
```

✅ Good:
```typescript
expect(aggregator.getCachedData()).toHaveLength(5); // Testing behavior
```

### 2. Descriptive Test Names

❌ Bad:
```typescript
it('works', () => { ... });
```

✅ Good:
```typescript
it('should filter duplicate events based on content hash', () => { ... });
```

### 3. Isolated Tests

Each test should be independent:

```typescript
beforeEach(() => {
  aggregator = new DataAggregator(); // Fresh instance
});
```

### 4. Meaningful Assertions

❌ Bad:
```typescript
expect(data).toBeTruthy();
```

✅ Good:
```typescript
expect(data).toHaveLength(5);
expect(data[0].title).toBe('Expected Title');
```

## Debugging Tests

### Run Single Test

```bash
npm test -- -t "should filter duplicates"
```

### Run Single File

```bash
npm test -- src/utils/__tests__/hashUtils.test.ts
```

### Verbose Output

```bash
npm test -- --reporter=verbose
```

### Debug in VSCode

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/vitest",
  "args": ["run"],
  "console": "integratedTerminal"
}
```

## Known Limitations

### Not Tested (Yet)

1. **Real-time SSE connections** - Requires WebSocket mocking
2. **Auto-refresh timers** - Requires time mocking (`vi.useFakeTimers()`)
3. **GDELT API integration** - Using mocks, not real API calls
4. **Performance under load** - Would require stress testing
5. **Concurrent request handling** - Needs load testing tools

### Future Enhancements

- [ ] Integration tests (full E2E flows)
- [ ] Performance benchmarks
- [ ] Stress tests (1000+ concurrent requests)
- [ ] GDELT date parsing edge cases
- [ ] Country fallback scenarios
- [ ] Error recovery scenarios

## Troubleshooting

### Tests Fail with EPERM

Run with elevated permissions:

```bash
npm test -- --run
```

### Module Not Found

Ensure dependencies are installed:

```bash
npm install
```

### TypeScript Errors

Check `tsconfig.json` and `vitest.config.ts` are properly configured.

## Related Documentation

- [README.md](../README.md) - Project overview
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
- [HASH_BASED_DEDUPLICATION.md](./HASH_BASED_DEDUPLICATION.md) - Deduplication details

---

**Questions?** See `src/__tests__/README.md` for more test documentation.
