import '@testing-library/jest-dom';
import { vi } from 'vitest';

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
globalThis.fetch = vi.fn();

// Mock EventSource for SSE tests
class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  url: string;
  
  constructor(url: string) {
    this.url = url;
  }
  
  close(): void {
    // Cleanup mock - intentionally empty for testing
  }
}

// @ts-expect-error - MockEventSource is a simplified mock for testing
globalThis.EventSource = MockEventSource;
