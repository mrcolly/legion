# Logging with Pino

## Overview

Legion Backend uses **Pino** - one of the fastest Node.js loggers with excellent performance and structured logging capabilities.

## Features

- ✅ **Fast & Low Overhead** - Minimal performance impact
- ✅ **Structured JSON Logging** - Easy to parse and analyze
- ✅ **Pretty Printing** - Human-readable output in development
- ✅ **Multiple Log Levels** - trace, debug, info, warn, error, fatal
- ✅ **Contextual Logging** - Add metadata to logs
- ✅ **Production Ready** - JSON output for log aggregators

## Log Levels

```typescript
logger.trace('Very detailed debugging');    // Level 10
logger.debug('Debug information');          // Level 20
logger.info('General information');         // Level 30 (default)
logger.warn('Warning messages');            // Level 40
logger.error('Error messages');             // Level 50
logger.fatal('Fatal errors');               // Level 60
```

## Configuration

### Environment Variables

```bash
# Set log level (default: info)
LOG_LEVEL=debug

# Environment (affects formatting)
NODE_ENV=development  # Pretty printing
NODE_ENV=production   # JSON output
```

### Log Levels by Environment

**Development:**
```bash
# Show all logs including debug
LOG_LEVEL=debug npm run dev
```

**Production:**
```bash
# Show only important logs
LOG_LEVEL=info npm start
```

**Debugging:**
```bash
# Show everything
LOG_LEVEL=trace npm run dev
```

## Usage

### Basic Logging

```typescript
import { logger } from '../utils/logger';

logger.info('Server started');
logger.warn('Rate limit approaching');
logger.error('Failed to connect');
```

### Structured Logging (with Context)

```typescript
// Add metadata as first parameter
logger.info({ port: 3000, env: 'dev' }, 'Server started');

// Output (JSON in production):
{
  "level": 30,
  "time": 1701456789123,
  "port": 3000,
  "env": "dev",
  "msg": "Server started"
}

// Output (pretty in development):
[22:15:00] INFO: Server started
    port: 3000
    env: "dev"
```

### Logging Errors

```typescript
try {
  await riskyOperation();
} catch (error) {
  logger.error({ error, userId: 123 }, 'Operation failed');
}

// Output:
{
  "level": 50,
  "error": {
    "message": "Connection timeout",
    "stack": "Error: Connection timeout\n    at ..."
  },
  "userId": 123,
  "msg": "Operation failed"
}
```

### Child Loggers

Create child loggers with persistent context:

```typescript
import { createLogger } from '../utils/logger';

// Component-specific logger
const logger = createLogger({ component: 'DataSource', source: 'GDELT' });

logger.info('Fetching data');
// Every log will include: component: 'DataSource', source: 'GDELT'
```

## Current Implementation

### Component Loggers

Each major component has its own logger:

```typescript
// DataAggregator
logger = createLogger({ component: 'DataAggregator' });

// DataSourceService (per source)
logger = createLogger({ component: 'DataSource', source: 'GDELT' });
logger = createLogger({ component: 'DataSource', source: 'Demo' });
```

### Log Examples

**Development Output (Pretty):**
```
[22:15:00] INFO (DataAggregator): Registered data source
    source: "GDELT"
[22:15:01] DEBUG (DataSource/GDELT): Fetching data...
[22:15:03] INFO (DataSource/GDELT): Successfully fetched geo-located data points
    count: 187
[22:15:03] INFO (DataAggregator): ✓ GDELT updated - Added 187 new points
    source: "GDELT"
    newPoints: 187
    totalCache: 206
```

**Production Output (JSON):**
```json
{"level":30,"time":1701456900000,"component":"DataAggregator","source":"GDELT","msg":"Registered data source"}
{"level":20,"time":1701456901000,"component":"DataSource","source":"GDELT","msg":"Fetching data..."}
{"level":30,"time":1701456903000,"component":"DataSource","source":"GDELT","count":187,"msg":"Successfully fetched geo-located data points"}
{"level":30,"time":1701456903000,"component":"DataAggregator","source":"GDELT","newPoints":187,"totalCache":206,"msg":"✓ GDELT updated - Added 187 new points"}
```

## Log Aggregation

### With ELK Stack

Production JSON logs can be sent to Elasticsearch:

```bash
# Ship logs to Elasticsearch
node dist/index.js | pino-elasticsearch
```

### With DataDog

```bash
# Forward to DataDog
node dist/index.js | pino-datadog
```

### With CloudWatch

```bash
# AWS CloudWatch
node dist/index.js | pino-cloudwatch
```

### File Logging

```bash
# Log to file
node dist/index.js > logs/app.log 2>&1
```

## Advanced Configuration

### Custom Logger Configuration

Edit `src/utils/logger.ts`:

```typescript
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  
  // Add custom serializers
  serializers: {
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  
  // Redact sensitive data
  redact: ['password', 'apiKey', 'token'],
  
  // Custom formatting
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  
  transport: isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
      singleLine: false,
    },
  } : undefined,
});
```

### HTTP Request Logging

Add `pino-http` for Express middleware:

```bash
npm install pino-http
```

```typescript
import pinoHttp from 'pino-http';

app.use(pinoHttp({ logger }));

// Logs all HTTP requests automatically
```

## Performance

### Benchmarks

Pino is one of the fastest loggers:

| Logger | Ops/sec |
|--------|---------|
| pino | 32,000 |
| winston | 12,000 |
| bunyan | 9,000 |
| console.log | 8,000 |

### Overhead

- **Development (pretty):** ~2-5% CPU overhead
- **Production (JSON):** <1% CPU overhead
- **Memory:** Minimal (streaming logs)

## Best Practices

### 1. Use Appropriate Log Levels

```typescript
// DEBUG: Detailed diagnostic info (development only)
logger.debug({ query: params }, 'Executing query');

// INFO: Important business events
logger.info({ userId: 123 }, 'User logged in');

// WARN: Potentially harmful situations
logger.warn({ remaining: 10 }, 'API rate limit approaching');

// ERROR: Error events that might still allow the app to continue
logger.error({ error }, 'Failed to fetch data');

// FATAL: Very severe errors that cause application termination
logger.fatal({ error }, 'Cannot start server');
process.exit(1);
```

### 2. Include Context

```typescript
// Bad
logger.info('Data updated');

// Good
logger.info({ 
  source: 'GDELT', 
  newCount: 23, 
  totalCount: 250 
}, 'Data updated');
```

### 3. Don't Log Sensitive Data

```typescript
// Bad
logger.info({ password: 'secret123' }, 'User login');

// Good
logger.info({ userId: 123, success: true }, 'User login');
```

### 4. Use Child Loggers for Context

```typescript
// Create once
const logger = createLogger({ userId: 123, requestId: 'abc' });

// All logs include this context
logger.info('Started processing');  // Includes userId and requestId
logger.info('Processing complete'); // Includes userId and requestId
```

## Monitoring & Alerts

### Filter by Log Level

```bash
# Show only errors
LOG_LEVEL=error npm start

# Show warnings and above
LOG_LEVEL=warn npm start
```

### Query Logs

Production JSON logs are easy to query:

```bash
# Find all GDELT errors
cat logs/app.log | grep '"source":"GDELT"' | grep '"level":50'

# Count errors per source
cat logs/app.log | jq -r 'select(.level==50) | .source' | sort | uniq -c

# Find slow operations
cat logs/app.log | jq 'select(.duration > 1000)'
```

### Set Up Alerts

```typescript
// Alert on errors
logger.on('error', (log) => {
  sendSlackAlert(`Error: ${log.msg}`);
});
```

## Comparison with console.log

### Before (console.log)

```typescript
console.log('[GDELT] Fetching data...');
console.error('[GDELT] Error:', error);
```

**Issues:**
- ❌ Not structured
- ❌ Hard to parse
- ❌ No log levels
- ❌ No timestamps (by default)
- ❌ Mixed stdout/stderr

### After (Pino)

```typescript
logger.debug('Fetching data...');
logger.error({ error }, 'Error fetching');
```

**Benefits:**
- ✅ Structured JSON
- ✅ Easy to parse
- ✅ Multiple log levels
- ✅ Automatic timestamps
- ✅ Consistent format
- ✅ Fast performance
- ✅ Production ready

## Example Output

### Development Mode (Pretty)

```
[22:15:00] INFO (DataAggregator): 🚀 Starting Legion Backend...
[22:15:00] INFO (DataAggregator): Registered data source
    source: "GDELT"
[22:15:01] DEBUG (DataSource/GDELT): Fetching data...
    query: "(conflict OR summit OR election)"
[22:15:03] INFO (DataSource/GDELT): Successfully fetched geo-located data points
    count: 187
[22:15:03] INFO (DataAggregator): ✓ GDELT updated - Added 187 new points
    source: "GDELT"
    newPoints: 187
    totalCache: 206
[22:15:03] DEBUG: 📡 Broadcasted to SSE clients
    clientCount: 3
```

### Production Mode (JSON)

```json
{"level":30,"time":1701456900000,"env":"production","component":"DataAggregator","msg":"🚀 Starting Legion Backend..."}
{"level":30,"time":1701456900123,"env":"production","component":"DataAggregator","source":"GDELT","msg":"Registered data source"}
{"level":20,"time":1701456901000,"env":"production","component":"DataSource","source":"GDELT","query":"(conflict OR summit OR election)","msg":"Fetching data..."}
{"level":30,"time":1701456903456,"env":"production","component":"DataSource","source":"GDELT","count":187,"msg":"Successfully fetched geo-located data points"}
{"level":30,"time":1701456903457,"env":"production","component":"DataAggregator","source":"GDELT","newPoints":187,"totalCache":206,"msg":"✓ GDELT updated - Added 187 new points"}
{"level":20,"time":1701456903458,"env":"production","clientCount":3,"msg":"📡 Broadcasted to SSE clients"}
```

## Debugging

### Enable Debug Logs

```bash
LOG_LEVEL=debug npm run dev
```

### Trace Mode (Maximum Detail)

```bash
LOG_LEVEL=trace npm run dev
```

### Silent Mode (Errors Only)

```bash
LOG_LEVEL=error npm start
```

---

**Result:** Production-grade logging with structured data, performance, and flexibility! 📝
