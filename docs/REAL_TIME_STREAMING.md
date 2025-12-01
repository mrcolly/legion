# Real-Time Streaming with Server-Sent Events (SSE)

## Overview

The backend provides **Server-Sent Events (SSE)** streaming for real-time updates when new data arrives. Web clients can connect to the stream and receive instant notifications whenever the cache is updated with new geo-located events.

## How It Works

### Architecture

```
Data Source → DataAggregator → EventEmitter → SSE Broadcast → Web Clients
```

1. **Data Source** fetches new data
2. **DataAggregator** filters duplicates and adds new points
3. **EventEmitter** emits `data-updated` event
4. **SSE Server** broadcasts to all connected clients
5. **Web Clients** receive real-time updates

### Event Flow

```
t=0:00  Client connects to /api/stream
        → Receives 'connected' event

t=0:30  Demo source finds 5 new events
        → DataAggregator emits 'data-updated'
        → All clients receive update instantly

t=2:00  GDELT source finds 23 new events
        → DataAggregator emits 'data-updated'
        → All clients receive update instantly
```

## API Endpoint

### GET /api/stream

Connect to the real-time event stream.

**Response:** `text/event-stream`

**Events:**

1. **connected** - Initial connection confirmation
2. **data-updated** - New data has been added to cache
3. **heartbeat** - Keep-alive ping (every 30 seconds)

## Client Implementation

### Vanilla JavaScript

```javascript
// Connect to SSE stream
const eventSource = new EventSource('http://localhost:3000/api/stream');

// Connection opened
eventSource.onopen = () => {
  console.log('✓ Connected to real-time stream');
};

// Listen for all messages
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'connected':
      console.log('Connection established');
      console.log('Total data points:', data.totalDataPoints);
      break;
      
    case 'data-updated':
      console.log(`New data from ${data.source}`);
      console.log(`Added ${data.newDataCount} new points`);
      console.log(`Total: ${data.totalCount} points`);
      
      // Add new data to your map/visualization
      data.newData.forEach(point => {
        addMarkerToMap(point);
      });
      break;
      
    case 'heartbeat':
      console.log('Heartbeat received');
      break;
  }
};

// Handle errors
eventSource.onerror = (error) => {
  console.error('Stream error:', error);
};

// Close connection
function disconnect() {
  eventSource.close();
}
```

### React Example

```typescript
import { useEffect, useState } from 'react';

function useRealTimeData() {
  const [data, setData] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource('http://localhost:3000/api/stream');

    eventSource.onopen = () => {
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'data-updated') {
        // Add new data to existing data
        setData(prev => [...prev, ...message.newData]);
        
        // Show notification
        showNotification(`${message.newDataCount} new events`);
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return { data, connected };
}

// Use in component
function Map() {
  const { data, connected } = useRealTimeData();
  
  return (
    <div>
      <div>Status: {connected ? '🟢 Connected' : '🔴 Disconnected'}</div>
      <MapVisualization data={data} />
    </div>
  );
}
```

### Vue Example

```vue
<template>
  <div>
    <div class="status">
      <span v-if="connected">🟢 Connected</span>
      <span v-else>🔴 Disconnected</span>
    </div>
    <div>New events: {{ newDataCount }}</div>
    <MapComponent :data="data" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const data = ref([]);
const connected = ref(false);
const newDataCount = ref(0);
let eventSource = null;

onMounted(() => {
  eventSource = new EventSource('http://localhost:3000/api/stream');

  eventSource.onopen = () => {
    connected.value = true;
  };

  eventSource.onmessage = (event) => {
    const message = JSON.parse(event.data);
    
    if (message.type === 'data-updated') {
      data.value.push(...message.newData);
      newDataCount.value += message.newDataCount;
    }
  };

  eventSource.onerror = () => {
    connected.value = false;
  };
});

onUnmounted(() => {
  if (eventSource) {
    eventSource.close();
  }
});
</script>
```

## Event Payloads

### connected

Sent immediately after connection is established.

```json
{
  "type": "connected",
  "clientId": "client-1701456789123-0.456",
  "timestamp": "2025-12-01T22:15:00.000Z",
  "totalDataPoints": 250
}
```

### data-updated

Sent whenever new data is added to the cache.

```json
{
  "type": "data-updated",
  "source": "GDELT",
  "newDataCount": 23,
  "totalCount": 273,
  "timestamp": "2025-12-01T22:16:30.000Z",
  "newData": [
    {
      "id": "gdelt-...",
      "hash": "a3f2e9d8...",
      "timestamp": "2025-12-01T22:16:25.000Z",
      "location": {
        "latitude": 40.7128,
        "longitude": -74.0060
      },
      "title": "Breaking News Event",
      "source": "GDELT",
      "category": "news"
    }
    // ... more data points
  ]
}
```

### heartbeat

Sent every 30 seconds to keep the connection alive.

```json
{
  "type": "heartbeat",
  "timestamp": "2025-12-01T22:17:00.000Z"
}
```

## Use Cases

### 1. Real-Time 3D Globe

```javascript
const eventSource = new EventSource('/api/stream');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'data-updated') {
    data.newData.forEach(point => {
      // Animate new marker appearing on globe
      animateNewMarker({
        lat: point.location.latitude,
        lon: point.location.longitude,
        title: point.title,
        source: point.source
      });
    });
  }
};
```

### 2. Live News Feed

```javascript
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'data-updated') {
    // Show toast notification
    showToast(`${data.newDataCount} new events from ${data.source}`);
    
    // Add to news feed
    data.newData.forEach(point => {
      prependToNewsFeed({
        title: point.title,
        time: point.timestamp,
        location: `${point.location.latitude}, ${point.location.longitude}`
      });
    });
  }
};
```

### 3. Event Counter

```javascript
let eventCount = 0;

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'data-updated') {
    eventCount += data.newDataCount;
    updateCounterDisplay(eventCount);
  }
};
```

### 4. Source-Specific Monitoring

```javascript
const sourceCounters = {};

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'data-updated') {
    sourceCounters[data.source] = 
      (sourceCounters[data.source] || 0) + data.newDataCount;
    
    updateSourceDashboard(sourceCounters);
  }
};
```

## Features

### Connection Management

- **Auto-Reconnect**: Browser automatically reconnects if connection drops
- **Heartbeat**: Server sends pings every 30s to keep connection alive
- **Multiple Clients**: Supports unlimited concurrent connections
- **CORS Enabled**: Works from any origin (for development)

### Performance

- **Efficient**: Only sends data when cache actually updates
- **Minimal Payload**: Only new data points sent, not entire cache
- **No Polling**: Push-based, no need for client polling
- **Low Latency**: Typically <100ms from data arrival to client notification

### Reliability

- **Duplicate Prevention**: Hash-based deduplication before broadcast
- **Error Handling**: Graceful handling of client disconnections
- **Logging**: Server logs connection/disconnection events

## Server-Side Details

### Client Tracking

```typescript
interface SSEClient {
  id: string;
  response: Response;
}

const sseClients: SSEClient[] = [];
```

### Broadcasting

```typescript
function broadcastToSSEClients(data: any): void {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  
  sseClients.forEach((client) => {
    client.response.write(message);
  });
  
  console.log(`📡 Broadcasted to ${sseClients.length} clients`);
}
```

### Event Emission

```typescript
// DataAggregator emits event when new data added
aggregator.emit('data-updated', {
  source: sourceName,
  newDataCount: newData.length,
  totalCount: this.cache.length,
  newData,
  timestamp: new Date(),
});
```

## Testing

### Test with curl

```bash
# Connect to stream
curl -N http://localhost:3000/api/stream

# You'll see:
# data: {"type":"connected","clientId":"...","totalDataPoints":250}
# 
# data: {"type":"data-updated","source":"Demo","newDataCount":5,...}
#
# data: {"type":"heartbeat","timestamp":"..."}
```

### Test with JavaScript Console

```javascript
const es = new EventSource('http://localhost:3000/api/stream');
es.onmessage = (e) => console.log(JSON.parse(e.data));
```

### Monitor Connected Clients

Watch server logs for:
```
📡 SSE client connected: client-1701456789123-0.456 (1 total clients)
📡 SSE client disconnected: client-1701456789123-0.456 (0 remaining)
📡 Broadcasted to 3 clients
```

## Best Practices

### 1. Handle Connection Errors

```javascript
let eventSource;
let reconnectInterval;

function connect() {
  eventSource = new EventSource('/api/stream');
  
  eventSource.onerror = () => {
    console.error('Connection lost, reconnecting...');
    reconnectInterval = setTimeout(connect, 5000);
  };
}

// Cleanup
function disconnect() {
  if (reconnectInterval) clearTimeout(reconnectInterval);
  if (eventSource) eventSource.close();
}
```

### 2. Debounce Updates

```javascript
let updateQueue = [];
let updateTimer;

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'data-updated') {
    updateQueue.push(...data.newData);
    
    // Debounce: update UI every 500ms
    clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      updateMap(updateQueue);
      updateQueue = [];
    }, 500);
  }
};
```

### 3. Show Connection Status

```javascript
let statusIndicator = document.getElementById('status');

eventSource.onopen = () => {
  statusIndicator.textContent = '🟢 Live';
  statusIndicator.className = 'connected';
};

eventSource.onerror = () => {
  statusIndicator.textContent = '🔴 Offline';
  statusIndicator.className = 'disconnected';
};
```

## Advantages over WebSockets

- ✅ **Simpler**: Built into browsers, no additional libraries
- ✅ **Auto-Reconnect**: Browser handles reconnection automatically
- ✅ **HTTP/2 Friendly**: Works great with HTTP/2 multiplexing
- ✅ **Unidirectional**: Perfect for server → client notifications
- ✅ **Lightweight**: Less overhead than WebSocket handshake
- ✅ **Firewall Friendly**: Uses standard HTTP, no protocol upgrade

## Limitations

- ❌ **One-Way**: Server → Client only (use REST API for client → server)
- ❌ **Text Only**: Binary data must be base64 encoded
- ❌ **Browser Limits**: Max 6 connections per domain (HTTP/1.1)

## Future Enhancements

### 1. Event Filtering

Allow clients to subscribe to specific sources:

```
GET /api/stream?sources=GDELT,Demo
```

### 2. Geographic Filtering

Stream only events in specific regions:

```
GET /api/stream?bbox=40,50,-80,10
```

### 3. Event Types

Add more event types:
- `cache-cleared`
- `source-added`
- `source-removed`
- `error-occurred`

### 4. Compression

Compress large payloads for bandwidth efficiency.

### 5. Authentication

Add token-based auth for production:

```
GET /api/stream?token=YOUR_AUTH_TOKEN
```

---

**Result:** Real-time, push-based updates with minimal code and maximum efficiency! 📡
