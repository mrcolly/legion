/**
 * Hook for managing data source filters with localStorage persistence
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchAvailableSources } from '../services/api';
import type { SourceInfo } from '../services/api';
import { createLogger } from '../utils/logger';

const logger = createLogger({ hook: 'useSourceFilter' });

const STORAGE_KEY = 'legion-source-filters';

// =============================================================================
// Types
// =============================================================================

interface UseSourceFilterReturn {
  availableSources: SourceInfo[];
  activeSources: string[];
  isLoading: boolean;
  toggleSource: (sourceName: string) => void;
  enableAll: () => void;
  disableAll: () => void;
  isSourceActive: (sourceName: string) => boolean;
}

// =============================================================================
// Hook
// =============================================================================

export function useSourceFilter(): UseSourceFilterReturn {
  const [availableSources, setAvailableSources] = useState<SourceInfo[]>([]);
  const [activeSources, setActiveSources] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // ---------------------------------------------------------------------------
  // Load available sources from backend
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const loadSources = async () => {
      try {
        setIsLoading(true);
        const sources = await fetchAvailableSources();
        setAvailableSources(sources);
        
        // Load saved preferences or default to all active
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as string[];
            // Filter to only include sources that actually exist
            const validSources = parsed.filter(s => 
              sources.some(src => src.name.toLowerCase() === s.toLowerCase())
            );
            setActiveSources(validSources.length > 0 ? validSources : sources.map(s => s.name));
          } catch {
            // Invalid JSON, default to all sources
            setActiveSources(sources.map(s => s.name));
          }
        } else {
          // No saved preferences, enable all sources
          setActiveSources(sources.map(s => s.name));
        }
        
        setInitialized(true);
        logger.info({ count: sources.length }, 'Available sources loaded');
      } catch (error) {
        logger.error({ error }, 'Failed to load available sources');
        // On error, still set initialized so the app can function
        setInitialized(true);
      } finally {
        setIsLoading(false);
      }
    };

    loadSources();
  }, []);

  // ---------------------------------------------------------------------------
  // Persist to localStorage when active sources change
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (initialized && activeSources.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeSources));
      logger.debug({ activeSources }, 'Source filters saved');
    }
  }, [activeSources, initialized]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const toggleSource = useCallback((sourceName: string) => {
    setActiveSources(prev => {
      const isActive = prev.some(s => s.toLowerCase() === sourceName.toLowerCase());
      if (isActive) {
        // Don't allow disabling all sources
        if (prev.length <= 1) {
          logger.warn('Cannot disable all sources');
          return prev;
        }
        return prev.filter(s => s.toLowerCase() !== sourceName.toLowerCase());
      } else {
        return [...prev, sourceName];
      }
    });
  }, []);

  const enableAll = useCallback(() => {
    setActiveSources(availableSources.map(s => s.name));
  }, [availableSources]);

  const disableAll = useCallback(() => {
    // Keep at least the first source active
    if (availableSources.length > 0) {
      setActiveSources([availableSources[0].name]);
    }
  }, [availableSources]);

  const isSourceActive = useCallback((sourceName: string) => {
    return activeSources.some(s => s.toLowerCase() === sourceName.toLowerCase());
  }, [activeSources]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------
  return {
    availableSources,
    activeSources,
    isLoading,
    toggleSource,
    enableAll,
    disableAll,
    isSourceActive,
  };
}
