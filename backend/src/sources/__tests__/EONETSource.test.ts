import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { EONETSource } from '../EONETSource';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('EONETSource', () => {
  let source: EONETSource;

  const mockEONETResponse = {
    data: {
      title: 'EONET Events',
      description: 'Natural events from EONET',
      link: 'https://eonet.gsfc.nasa.gov/api/v3/events',
      events: [
        {
          id: 'EONET_6001',
          title: 'Wildfire - California',
          description: 'Large wildfire in Northern California',
          link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_6001',
          closed: null,
          categories: [
            { id: 'wildfires', title: 'Wildfires' },
          ],
          sources: [
            { id: 'InciWeb', url: 'https://inciweb.nwcg.gov/' },
          ],
          geometry: [
            {
              magnitudeValue: 5000,
              magnitudeUnit: 'acres',
              date: '2024-01-15T12:00:00Z',
              type: 'Point',
              coordinates: [-122.4, 38.5],
            },
          ],
        },
        {
          id: 'EONET_6002',
          title: 'Severe Storm - Atlantic',
          description: null,
          link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_6002',
          closed: null,
          categories: [
            { id: 'severeStorms', title: 'Severe Storms' },
          ],
          sources: [
            { id: 'NOAA', url: 'https://www.noaa.gov/' },
          ],
          geometry: [
            {
              magnitudeValue: null,
              magnitudeUnit: null,
              date: '2024-01-14T08:00:00Z',
              type: 'Point',
              coordinates: [-65.0, 25.0],
            },
          ],
        },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    source = new EONETSource({ enabled: true });
    mockedAxios.get.mockResolvedValue(mockEONETResponse);
  });

  it('should be initialized with correct config', () => {
    expect(source.getName()).toBe('EONET');
    expect(source.isEnabled()).toBe(true);
  });

  it('should fetch natural disaster data from EONET API', async () => {
    const data = await source.fetchData();

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://eonet.gsfc.nasa.gov/api/v3/events',
      expect.any(Object)
    );
    expect(data).toHaveLength(2);
  });

  it('should transform EONET events to GeoDataPoints', async () => {
    const data = await source.fetchData();

    expect(data[0]).toMatchObject({
      id: expect.stringContaining('eonet-EONET_6001'),
      source: 'EONET',
      category: 'wildfires',
      title: expect.stringContaining('Wildfire'),
      location: {
        latitude: 38.5,
        longitude: -122.4,
      },
    });
    expect(data[0].metadata).toMatchObject({
      eventId: 'EONET_6001',
      categoryId: 'wildfires',
      magnitude: 5000,
      magnitudeUnit: 'acres',
    });
  });

  it('should add category-specific icons to titles', async () => {
    const data = await source.fetchData();

    expect(data[0].title).toContain('🔥'); // Wildfire icon
    expect(data[1].title).toContain('🌪️'); // Storm icon
  });

  it('should handle empty response', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { title: 'EONET', events: [] },
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

  it('should skip events without geometry', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        events: [
          {
            id: 'EONET_6003',
            title: 'Event without geometry',
            categories: [{ id: 'wildfires', title: 'Wildfires' }],
            sources: [],
            geometry: [],
          },
        ],
      },
    });

    const data = await source.fetchData();
    expect(data).toHaveLength(0);
  });

  it('should use most recent geometry for events with multiple positions', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        events: [
          {
            id: 'EONET_6004',
            title: 'Moving storm',
            categories: [{ id: 'severeStorms', title: 'Severe Storms' }],
            sources: [],
            geometry: [
              {
                date: '2024-01-14T00:00:00Z',
                type: 'Point',
                coordinates: [-60.0, 20.0],
              },
              {
                date: '2024-01-15T00:00:00Z', // More recent
                type: 'Point',
                coordinates: [-65.0, 25.0],
              },
            ],
          },
        ],
      },
    });

    const data = await source.fetchData();
    expect(data).toHaveLength(1);
    expect(data[0].location).toMatchObject({
      latitude: 25.0,
      longitude: -65.0,
    });
  });
});
