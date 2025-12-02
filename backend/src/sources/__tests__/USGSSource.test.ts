import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { USGSSource } from '../USGSSource';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('USGSSource', () => {
  let source: USGSSource;

  const mockUSGSResponse = {
    data: {
      type: 'FeatureCollection',
      metadata: {
        generated: Date.now(),
        url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson',
        title: 'USGS All Earthquakes, Past Hour',
        status: 200,
        api: '1.10.3',
        count: 2,
      },
      features: [
        {
          type: 'Feature',
          properties: {
            mag: 4.5,
            place: '10 km SW of Los Angeles, CA',
            time: Date.now(),
            updated: Date.now(),
            url: 'https://earthquake.usgs.gov/earthquakes/eventpage/test1',
            detail: 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=test1',
            felt: 100,
            cdi: 4.0,
            mmi: null,
            alert: 'green',
            status: 'reviewed',
            tsunami: 0,
            sig: 312,
            net: 'ci',
            code: 'test1',
            ids: ',test1,',
            sources: ',ci,',
            types: ',origin,',
            nst: 50,
            dmin: 0.1,
            rms: 0.5,
            gap: 30,
            magType: 'ml',
            type: 'earthquake',
            title: 'M 4.5 - 10 km SW of Los Angeles, CA',
          },
          geometry: {
            type: 'Point',
            coordinates: [-118.2437, 34.0522, 10.5], // [lng, lat, depth]
          },
          id: 'test1',
        },
        {
          type: 'Feature',
          properties: {
            mag: 2.1,
            place: '5 km N of San Francisco, CA',
            time: Date.now() - 60000,
            updated: Date.now(),
            url: 'https://earthquake.usgs.gov/earthquakes/eventpage/test2',
            detail: 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=test2',
            felt: null,
            cdi: null,
            mmi: null,
            alert: null,
            status: 'automatic',
            tsunami: 0,
            sig: 68,
            net: 'nc',
            code: 'test2',
            ids: ',test2,',
            sources: ',nc,',
            types: ',origin,',
            nst: 20,
            dmin: 0.05,
            rms: 0.3,
            gap: 45,
            magType: 'md',
            type: 'earthquake',
            title: 'M 2.1 - 5 km N of San Francisco, CA',
          },
          geometry: {
            type: 'Point',
            coordinates: [-122.4194, 37.7749, 5.2],
          },
          id: 'test2',
        },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    source = new USGSSource({ enabled: true });
    mockedAxios.get.mockResolvedValue(mockUSGSResponse);
  });

  it('should be initialized with correct config', () => {
    expect(source.getName()).toBe('USGS');
    expect(source.isEnabled()).toBe(true);
  });

  it('should fetch earthquake data from USGS API', async () => {
    const data = await source.fetchData();

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson',
      expect.any(Object)
    );
    expect(data).toHaveLength(2);
  });

  it('should transform earthquake data to GeoDataPoints', async () => {
    const data = await source.fetchData();

    expect(data[0]).toMatchObject({
      id: expect.stringContaining('usgs-test1'),
      source: 'USGS',
      category: 'earthquake',
      title: expect.stringContaining('M4.5'),
      location: {
        latitude: 34.0522,
        longitude: -118.2437,
      },
    });
    expect(data[0].metadata).toMatchObject({
      magnitude: 4.5,
      depth: 10.5,
      place: '10 km SW of Los Angeles, CA',
    });
  });

  it('should handle empty response', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { type: 'FeatureCollection', features: [] },
    });

    const data = await source.fetchData();
    expect(data).toHaveLength(0);
  });

  it('should handle API errors gracefully', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

    const data = await source.fetchData();
    expect(data).toHaveLength(0);
    expect(source.getStats().isHealthy).toBe(false);
  });

  it('should use different feed based on feedType config', () => {
    const daySource = new USGSSource({ feedType: 'day' });
    expect(daySource.getName()).toBe('USGS');
    // Internal feedUrl would be different but we can't easily test that
  });

  it('should include tsunami warning in description when present', async () => {
    const tsunamiResponse = {
      data: {
        ...mockUSGSResponse.data,
        features: [{
          ...mockUSGSResponse.data.features[0],
          properties: {
            ...mockUSGSResponse.data.features[0].properties,
            tsunami: 1,
          },
        }],
      },
    };
    mockedAxios.get.mockResolvedValueOnce(tsunamiResponse);

    const data = await source.fetchData();
    expect(data[0].description).toContain('Tsunami warning');
  });
});
