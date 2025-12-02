import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock import.meta.env before importing the logger
const mockEnv = {
  DEV: true,
  PROD: false,
  VITE_LOG_LEVEL: 'debug',
};

// Mock import.meta.env
vi.stubGlobal('import.meta', { env: mockEnv });

describe('Logger Utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export logger instance', async () => {
    const { logger } = await import('../logger');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });

  it('should export createLogger function', async () => {
    const { createLogger } = await import('../logger');
    expect(typeof createLogger).toBe('function');
  });

  it('should create child logger with context', async () => {
    const { createLogger } = await import('../logger');
    const childLogger = createLogger({ component: 'TestComponent' });

    expect(childLogger).toBeDefined();
    expect(typeof childLogger.info).toBe('function');
  });

  it('should export pre-configured loggers', async () => {
    const { apiLogger, globeLogger, sseLogger } = await import('../logger');

    expect(apiLogger).toBeDefined();
    expect(globeLogger).toBeDefined();
    expect(sseLogger).toBeDefined();
  });

  it('should have correct log methods', async () => {
    const { logger } = await import('../logger');

    // Check that all standard log methods exist
    expect(typeof logger.trace).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.fatal).toBe('function');
  });

  it('should allow logging with message only', async () => {
    const { logger } = await import('../logger');

    // Should not throw
    expect(() => logger.info('Test message')).not.toThrow();
  });

  it('should allow logging with context object', async () => {
    const { logger } = await import('../logger');

    // Should not throw
    expect(() => logger.info({ key: 'value' }, 'Test message')).not.toThrow();
  });

  it('should create independent child loggers', async () => {
    const { createLogger } = await import('../logger');

    const logger1 = createLogger({ component: 'Component1' });
    const logger2 = createLogger({ component: 'Component2' });

    // Both should be functional and independent
    expect(logger1).not.toBe(logger2);
    expect(() => logger1.info('From logger 1')).not.toThrow();
    expect(() => logger2.info('From logger 2')).not.toThrow();
  });
});
