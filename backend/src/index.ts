import dotenv from 'dotenv';
import { DataAggregator } from './services/DataAggregator';
import { GDELTSource } from './sources/GDELTSource';
import { DemoSource } from './sources/DemoSource';
import { RSSSource } from './sources/RSSSource';
import { USGSSource } from './sources/USGSSource';
import { EONETSource } from './sources/EONETSource';
import { MastodonSource } from './sources/MastodonSource';
import { createServer } from './api/server';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;

// Configuration: Choose which data sources to enable
const ENABLE_DEMO = process.env.USE_DEMO !== 'false'; // Default: enabled
const ENABLE_GDELT = process.env.USE_GDELT === 'true'; // Default: disabled
const ENABLE_RSS = process.env.USE_RSS === 'true'; // Default: disabled
const ENABLE_USGS = process.env.USE_USGS === 'true'; // Default: disabled (earthquakes)
const ENABLE_EONET = process.env.USE_EONET === 'true'; // Default: disabled (natural disasters)
const ENABLE_MASTODON = process.env.USE_MASTODON === 'true'; // Default: disabled (social)

// Top-level code execution
logger.info('🚀 Starting Legion Backend...');

// Create data aggregator
const aggregator = new DataAggregator();

// Register data sources
// You can enable multiple sources simultaneously - they'll all be aggregated!

if (ENABLE_DEMO) {
  logger.info('📊 Enabling Demo data source (for testing)');
  aggregator.registerSource(new DemoSource());
}

if (ENABLE_GDELT) {
  logger.info('📰 Enabling GDELT news data source (with geoparsing)');
  aggregator.registerSource(new GDELTSource({ enableGeoparsing: true }));
}

if (ENABLE_RSS) {
  logger.info('📡 Enabling RSS feeds data source (with geoparsing)');
  aggregator.registerSource(new RSSSource({ enableGeoparsing: true }));
}

if (ENABLE_USGS) {
  logger.info('🌋 Enabling USGS earthquake data source');
  aggregator.registerSource(new USGSSource());
}

if (ENABLE_EONET) {
  logger.info('🔥 Enabling EONET natural disasters data source');
  aggregator.registerSource(new EONETSource());
}

if (ENABLE_MASTODON) {
  logger.info('🦣 Enabling Mastodon social data source (with geoparsing)');
  aggregator.registerSource(new MastodonSource());
}

if (!ENABLE_DEMO && !ENABLE_GDELT && !ENABLE_RSS && !ENABLE_USGS && !ENABLE_EONET && !ENABLE_MASTODON) {
  logger.warn('⚠️  No data sources enabled!');
  logger.warn('⚠️  Set USE_DEMO, USE_GDELT, USE_RSS, USE_USGS, USE_EONET, or USE_MASTODON=true');
  logger.warn('⚠️  Defaulting to Demo source...');
  aggregator.registerSource(new DemoSource());
}

// Initialize all sources
await aggregator.initialize();

// Create and start server IMMEDIATELY (don't wait for data)
const app = createServer(aggregator);

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, `✅ Server running on http://localhost:${PORT}`);
  logger.info('📊 API endpoints:');
  logger.info('   GET  /health              - Health check');
  logger.info('   GET  /api/data            - Get all data (supports ?sort=desc&limit=100)');
  logger.info('   POST /api/data/refresh    - Refresh data from sources');
  logger.info('   GET  /api/sources         - Get source statistics');
  logger.info('   GET  /api/data/bbox       - Filter by bounding box (supports ?sort&limit)');
  logger.info('   GET  /api/cache/stats     - Get cache statistics');
  logger.info('   POST /api/cache/clear     - Clear cache (debug only)');
  logger.info('   GET  /api/stream          - Real-time SSE stream of new data 📡');
});

// Fetch initial data in background (non-blocking)
// Using async IIFE intentionally to start server immediately without waiting for data
logger.info('📡 Fetching initial data in background...');
// eslint-disable-next-line unicorn/prefer-top-level-await
(async () => {
  try {
    await aggregator.fetchAll();
    
    // Start independent auto-refresh cycles for each source
    aggregator.startAutoRefresh();
  } catch (error) {
    logger.error({ error }, '❌ Error during initial data fetch');
  }
})();

// Graceful shutdown
const shutdown = async () => {
  logger.info('\n🛑 Shutting down gracefully...');
  await aggregator.cleanup();
  server.close(() => {
    logger.info('✅ Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
