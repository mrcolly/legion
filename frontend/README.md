# Frontend

3D globe visualization built with React and globe.gl.

## Commands

```bash
yarn dev          # Development server
yarn build        # Production build
yarn preview      # Preview production build
yarn test         # Run tests
yarn test:watch   # Watch mode
```

## Environment Variables

```bash
VITE_API_URL=http://localhost:3000  # Backend URL (empty for production)
VITE_LOG_LEVEL=info                 # Logging level
```

## Project Structure

```
src/
├── components/
│   ├── Globe.tsx         # 3D globe with points
│   ├── InfoPanel.tsx     # Stats and event details
│   ├── EventToast.tsx    # Event notifications
│   └── SettingsMenu.tsx  # Settings panel
├── hooks/
│   ├── useGeoData.ts     # Data fetching + SSE
│   └── useEventQueue.ts  # Toast queue management
├── services/
│   └── api.ts            # Backend API client
├── types/
│   └── GeoData.ts        # TypeScript interfaces
└── constants/
    └── index.ts          # App configuration
```

## Globe Controls

| Action | Effect |
|--------|--------|
| Drag | Rotate globe |
| Scroll | Zoom in/out |
| Click point | View event details |
| Hover point | Show tooltip |

## Features

- 🌍 Interactive 3D globe (WebGL)
- 📍 Real-time event points with colors by source
- 🌓 Day/night Earth textures
- 🔄 Auto-rotation (pauses on interaction)
- 📱 Responsive design (mobile support)
- 📡 SSE for live updates

## Customization

### Point Colors

Edit `src/constants/index.ts`:

```typescript
export const SOURCE_COLORS: Record<string, string> = {
  GDELT: '#ff6b6b',   // Red
  USGS: '#ffd93d',    // Yellow
  EONET: '#6bcb77',   // Green
  RSS: '#4d96ff',     // Blue
  Demo: '#c9b1ff',    // Purple
};
```

## Docker

```bash
docker build -t legion-frontend .
docker run -p 80:80 legion-frontend
```
