import { DataSourceService } from '../services/DataSourceService';
import { GeoDataPoint, DataSourceConfig } from '../types/GeoData';
import { createGeoDataPoint } from '../utils/hashUtils';

/**
 * Demo data source for testing
 * Generates sample news events around major world cities
 */
export class DemoSource extends DataSourceService {
  private readonly cities = [
    { name: 'New York', lat: 40.7128, lon: -74.0060, country: 'USA' },
    { name: 'London', lat: 51.5074, lon: -0.1278, country: 'UK' },
    { name: 'Tokyo', lat: 35.6762, lon: 139.6503, country: 'Japan' },
    { name: 'Paris', lat: 48.8566, lon: 2.3522, country: 'France' },
    { name: 'Sydney', lat: -33.8688, lon: 151.2093, country: 'Australia' },
    { name: 'Dubai', lat: 25.2048, lon: 55.2708, country: 'UAE' },
    { name: 'Singapore', lat: 1.3521, lon: 103.8198, country: 'Singapore' },
    { name: 'Mumbai', lat: 19.0760, lon: 72.8777, country: 'India' },
    { name: 'São Paulo', lat: -23.5505, lon: -46.6333, country: 'Brazil' },
    { name: 'Cairo', lat: 30.0444, lon: 31.2357, country: 'Egypt' },
  ];

  private readonly eventTypes = [
    'Breaking News',
    'Political Summit',
    'Economic Report',
    'Cultural Event',
    'Technology Conference',
    'Sports Championship',
    'Environmental Initiative',
    'Healthcare Update',
  ];

  constructor(config?: Partial<DataSourceConfig>) {
    super({
      name: 'Demo',
      enabled: true,
      refreshInterval: 30000, // 30 seconds
      maxResults: 20,
      ...config,
    });
  }

  async fetchData(): Promise<GeoDataPoint[]> {
    try {
      this.logger.debug('Generating demo data...');

      const numEvents = Math.floor(Math.random() * 15) + 5; // 5-20 events
      const dataPoints: GeoDataPoint[] = [];

      for (let i = 0; i < numEvents; i++) {
        const city = this.cities[Math.floor(Math.random() * this.cities.length)];
        const eventType = this.eventTypes[Math.floor(Math.random() * this.eventTypes.length)];
        
        // Add some randomness to coordinates to spread events around the city
        const latOffset = (Math.random() - 0.5) * 0.5; // ±0.25 degrees
        const lonOffset = (Math.random() - 0.5) * 0.5;

        dataPoints.push(createGeoDataPoint({
          id: `demo-${Date.now()}-${i}`,
          timestamp: new Date(Date.now() - Math.random() * 3600000), // Within last hour
          location: {
            latitude: city.lat + latOffset,
            longitude: city.lon + lonOffset,
          },
          title: `${eventType} in ${city.name}`,
          description: `Live updates from ${city.name}, ${city.country}`,
          url: `https://example.com/news/${Date.now()}-${i}`,
          source: this.getName(),
          category: 'news',
          metadata: {
            city: city.name,
            country: city.country,
            eventType: eventType,
            demo: true,
          },
        }));
      }

      this.updateStats(true, dataPoints.length);
      this.logger.debug({ count: dataPoints.length }, 'Generated demo events');

      return dataPoints;
    } catch (error) {
      this.logger.error({ error }, 'Error generating data');
      this.updateStats(false);
      return [];
    }
  }
}
