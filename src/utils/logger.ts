import pino from 'pino';

/**
 * Application logger using Pino
 * 
 * Features:
 * - Fast and low overhead
 * - Structured JSON logging
 * - Pretty printing in development
 * - Multiple log levels
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  
  // Pretty print in development, JSON in production
  transport: isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
      singleLine: false,
    },
  } : undefined,
  
  // Base context for all logs
  base: {
    env: process.env.NODE_ENV || 'development',
  },
});

/**
 * Create a child logger with specific context
 * Useful for adding consistent metadata to logs
 */
export function createLogger(context: Record<string, any>) {
  return logger.child(context);
}
