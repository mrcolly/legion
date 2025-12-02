import express, { Request, Response } from 'express';
import cors from 'cors';
import { DataAggregator } from '../services/DataAggregator';
import { logger } from '../utils/logger';

// SSE client management
interface SSEClient {
  id: string;
  response: Response;
}

const sseClients: SSEClient[] = [];

export function createServer(aggregator: DataAggregator) {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Listen for data updates and broadcast to SSE clients
  aggregator.on('data-updated', (updateInfo) => {
    broadcastToSSEClients({
      type: 'data-updated',
      ...updateInfo,
    });
  });

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // Get all data points
  app.get('/api/data', async (req: Request, res: Response) => {
    try {
      let data = aggregator.getCachedData();
      
      // Optional sorting by timestamp
      const sortOrder = (req.query.sort as string) || 'desc'; // Default: newest first
      
      if (sortOrder === 'desc') {
        // Newest first (default)
        data = data.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      } else if (sortOrder === 'asc') {
        // Oldest first
        data = data.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      }
      
      // Optional limit
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      if (limit && limit > 0) {
        data = data.slice(0, limit);
      }
      
      res.json({
        success: true,
        count: data.length,
        total: aggregator.getCachedData().length,
        lastUpdate: aggregator.getLastUpdateTime(),
        data,
      });
    } catch (error) {
      logger.error({ error }, 'Error getting data');
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve data',
      });
    }
  });

  // Fetch fresh data from all sources
  app.post('/api/data/refresh', async (_req: Request, res: Response) => {
    try {
      const data = await aggregator.fetchAll();
      res.json({
        success: true,
        count: data.length,
        lastUpdate: aggregator.getLastUpdateTime(),
        data,
      });
    } catch (error) {
      logger.error({ error }, 'Error refreshing data');
      res.status(500).json({
        success: false,
        error: 'Failed to refresh data',
      });
    }
  });

  // Get data source statistics
  app.get('/api/sources', (_req: Request, res: Response) => {
    try {
      const stats = aggregator.getSourceStats();
      res.json({
        success: true,
        sources: stats,
      });
    } catch (error) {
      logger.error({ error }, 'Error getting source stats');
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve source statistics',
      });
    }
  });

  // Filter data by bounding box
  app.get('/api/data/bbox', (req: Request, res: Response) => {
    try {
      const { minLat, maxLat, minLon, maxLon, sort, limit } = req.query;

      if (!minLat || !maxLat || !minLon || !maxLon) {
        return res.status(400).json({
          success: false,
          error: 'Missing bounding box parameters (minLat, maxLat, minLon, maxLon)',
        });
      }

      let data = aggregator.getCachedData().filter((point) => {
        const lat = point.location.latitude;
        const lon = point.location.longitude;
        return (
          lat >= parseFloat(minLat as string) &&
          lat <= parseFloat(maxLat as string) &&
          lon >= parseFloat(minLon as string) &&
          lon <= parseFloat(maxLon as string)
        );
      });

      // Optional sorting by timestamp
      const sortOrder = (sort as string) || 'desc'; // Default: newest first
      
      if (sortOrder === 'desc') {
        data = data.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      } else if (sortOrder === 'asc') {
        data = data.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      }
      
      // Optional limit
      const limitNum = limit ? parseInt(limit as string, 10) : undefined;
      if (limitNum && limitNum > 0) {
        data = data.slice(0, limitNum);
      }

      res.json({
        success: true,
        count: data.length,
        data,
      });
    } catch (error) {
      logger.error({ error }, 'Error filtering data');
      res.status(500).json({
        success: false,
        error: 'Failed to filter data',
      });
    }
  });

  // Get cache statistics
  app.get('/api/cache/stats', (_req: Request, res: Response) => {
    try {
      const stats = aggregator.getCacheStats();
      res.json({
        success: true,
        ...stats,
      });
    } catch (error) {
      logger.error({ error }, 'Error getting cache stats');
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve cache statistics',
      });
    }
  });

  // Clear cache (useful for testing/debugging)
  app.post('/api/cache/clear', (_req: Request, res: Response) => {
    try {
      aggregator.clearCache();
      res.json({
        success: true,
        message: 'Cache cleared successfully',
      });
    } catch (error) {
      logger.error({ error }, 'Error clearing cache');
      res.status(500).json({
        success: false,
        error: 'Failed to clear cache',
      });
    }
  });

  // Server-Sent Events (SSE) endpoint for real-time updates
  app.get('/api/stream', (req: Request, res: Response) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in nginx

    const clientId = `client-${Date.now()}-${Math.random()}`;
    const client: SSEClient = { id: clientId, response: res };

    // Add client to list
    sseClients.push(client);
    logger.info({ clientId, totalClients: sseClients.length }, '📡 SSE client connected');

    // Send initial connection message
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      clientId,
      timestamp: new Date(),
      totalDataPoints: aggregator.getCachedData().length,
    })}\n\n`);

    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date() })}\n\n`);
    }, 30000);

    // Handle client disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      const index = sseClients.findIndex((c) => c.id === clientId);
      if (index > -1) {
        sseClients.splice(index, 1);
      }
      logger.info({ clientId, remainingClients: sseClients.length }, '📡 SSE client disconnected');
    });
  });

  // Serve static frontend files in production (unified deployment)
  const frontendPath = path.resolve(process.cwd(), '../frontend/dist');
  if (existsSync(frontendPath)) {
    logger.info({ path: frontendPath }, '📁 Serving static frontend files');
    
    // Serve static assets
    app.use(express.static(frontendPath));
    
    // SPA fallback - serve index.html for all non-API routes
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }

  return app;
}

/**
 * Broadcast message to all connected SSE clients
 */
function broadcastToSSEClients(data: any): void {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  
  sseClients.forEach((client) => {
    try {
      client.response.write(message);
    } catch (error) {
      logger.error({ clientId: client.id, error }, 'Error sending to SSE client');
    }
  });
  
  if (sseClients.length > 0) {
    logger.debug({ clientCount: sseClients.length }, '📡 Broadcasted to SSE clients');
  }
}
