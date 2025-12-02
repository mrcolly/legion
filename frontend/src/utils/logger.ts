import pino from 'pino';

/**
 * Frontend logger using Pino
 * 
 * Configured for browser environment with:
 * - Pretty console output in development
 * - Structured JSON in production
 * - Log levels based on environment
 */

const isDevelopment = import.meta.env.DEV;
const logLevel = import.meta.env.VITE_LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

export const logger = pino({
  level: logLevel,
  browser: {
    // Use console methods for browser output
    asObject: !isDevelopment, // JSON objects in production, pretty in dev
    
    // Custom transmit for production (could send to backend)
    transmit: isDevelopment ? undefined : {
      level: 'warn',
      send: (level, logEvent) => {
        // In production, you could send logs to a backend service
        // For now, just output to console
        const { messages, bindings } = logEvent;
        const output = {
          level,
          time: new Date().toISOString(),
          ...bindings[0],
          msg: messages.join(' '),
        };
        console.log(JSON.stringify(output));
      },
    },
  },
});

/**
 * Create a child logger with context
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

// Pre-configured loggers for different components
export const apiLogger = createLogger({ component: 'api' });
export const globeLogger = createLogger({ component: 'globe' });
export const sseLogger = createLogger({ component: 'sse' });

