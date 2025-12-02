import '@testing-library/jest-dom';

// Mock import.meta.env
Object.defineProperty(import.meta, 'env', {
  value: {
    DEV: true,
    PROD: false,
    VITE_API_URL: 'http://localhost:3000',
    VITE_LOG_LEVEL: 'debug',
  },
});

// Mock fetch globally
global.fetch = vi.fn();

// Mock EventSource for SSE tests
class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  
  constructor(public url: string) {}
  
  close() {}
}

global.EventSource = MockEventSource as unknown as typeof EventSource;

