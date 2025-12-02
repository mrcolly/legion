# Legion Frontend

Real-time global events visualization on a 3D globe.

Built with:
- ⚡ **Vite** - Fast development and build
- ⚛️ **React 18** - UI framework
- 🌍 **globe.gl / react-globe.gl** - 3D globe visualization
- 📡 **Server-Sent Events** - Real-time data updates
- 🎨 **Custom CSS** - Modern dark theme

## Quick Start

### Prerequisites

Make sure the backend is running:

```bash
cd ../  # Go to root
npm run dev  # Starts on http://localhost:3000
```

### Run Frontend

```bash
npm install
npm run dev  # Starts on http://localhost:5173
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Features

- 🌐 **3D Globe Visualization** - Interactive WebGL globe with ThreeJS
- 📍 **Real-time Points** - Events appear as colored points on the globe
- 📡 **Live Updates** - SSE connection for instant data streaming
- 🔍 **Point Details** - Click on points to see event information
- 🎨 **Color-coded Sources** - GDELT (red), Demo (teal)
- 🌙 **Night Mode** - Beautiful dark earth texture with city lights
- 🔄 **Auto-rotation** - Globe rotates until user interaction

## Configuration

Create a `.env` file:

```bash
# Backend API URL
VITE_API_URL=http://localhost:3000
```

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── Globe.tsx       # 3D globe component
│   │   ├── InfoPanel.tsx   # Stats and details panel
│   │   └── InfoPanel.css   # Panel styling
│   ├── hooks/
│   │   └── useGeoData.ts   # Data fetching hook with SSE
│   ├── services/
│   │   └── api.ts          # Backend API client
│   ├── types/
│   │   └── GeoData.ts      # TypeScript interfaces
│   ├── App.tsx             # Main app component
│   ├── App.css             # App styling
│   └── main.tsx            # Entry point
├── .env                    # Environment config
└── package.json
```

## Globe Controls

- **Scroll** - Zoom in/out
- **Drag** - Rotate the globe
- **Click point** - View event details & fly to location
- **Click anywhere** - Stops auto-rotation

## API Integration

The frontend connects to the Legion Backend:

| Endpoint | Description |
|----------|-------------|
| `GET /api/data` | Fetch all events |
| `GET /api/stream` | SSE real-time updates |
| `GET /health` | Health check |

## Customization

### Point Colors

Edit `src/components/Globe.tsx`:

```typescript
const SOURCE_COLORS: Record<string, string> = {
  GDELT: '#ff6b6b',   // Red for news
  Demo: '#4ecdc4',    // Teal for demo
  default: '#ffe66d', // Yellow fallback
};
```

### Globe Textures

Change the earth texture in `Globe.tsx`:

```typescript
globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
// Or try:
// earth-day.jpg
// earth-blue-marble.jpg
// earth-water.png
```

## Building for Production

```bash
npm run build
```

Output is in `dist/` folder, ready to deploy to any static host.

## Tech Stack

- **react-globe.gl** - React wrapper for globe.gl
- **three.js** - 3D rendering (via globe.gl)
- **WebGL** - Hardware-accelerated graphics
- **EventSource API** - Server-Sent Events for live data

## Related

- [globe.gl](https://github.com/vasturiano/globe.gl) - 3D globe library
- [Legion Backend](../) - Data source and API
