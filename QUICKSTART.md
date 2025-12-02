# Legion Quick Start Guide 🚀

Get the Legion project running in under 5 minutes.

## Option 1: Docker (Recommended) 🐳

The fastest way to run Legion:

```bash
# Clone and run
git clone <your-repo>
cd legion

# Build and start all services
docker-compose up --build

# Access the app
open http://localhost:8080
```

**That's it!** The frontend is at `localhost:8080` and backend at `localhost:3000`.

### Docker Commands

```bash
# Start in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild after changes
docker-compose up --build
```

---

## Option 2: Local Development 💻

### Prerequisites

- Node.js 20+
- npm 10+

### Step 1: Backend

```bash
cd backend
npm install
npm run dev
```

Backend runs on http://localhost:3000

### Step 2: Frontend

```bash
# New terminal
cd frontend
npm install
npm run dev
```

Frontend runs on http://localhost:5173

### Step 3: Open Browser

Navigate to http://localhost:5173 to see the globe!

---

## Configuration

### Enable GDELT News Data

Edit `backend/.env`:

```bash
USE_DEMO=true
USE_GDELT=true   # Enable real news data
```

Or with Docker:

```bash
docker-compose up -d
docker-compose exec backend sh -c "export USE_GDELT=true"
```

---

## Quick Tests

### Backend Health

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"..."}
```

### Get Events

```bash
curl http://localhost:3000/api/data?limit=5
```

### Real-time Stream

```bash
curl http://localhost:3000/api/stream
# SSE events will appear here
```

---

## Project Structure

```
legion/
├── backend/          # Express.js API
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── frontend/         # React + globe.gl
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── docs/             # Documentation
├── docker-compose.yml
└── README.md
```

---

## Common Issues

### Port Already in Use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Kill process on port 5173
lsof -ti:5173 | xargs kill -9
```

### Docker Build Fails

```bash
# Clean rebuild
docker-compose down
docker system prune -f
docker-compose up --build
```

### Frontend Can't Connect to Backend

1. Make sure backend is running first
2. Check CORS is enabled (it is by default)
3. Verify `VITE_API_URL` in `frontend/.env`

---

## Next Steps

1. 📖 Read the [full README](README.md)
2. 🔧 Check [backend docs](docs/ARCHITECTURE.md)
3. 🌍 Try adding a [new data source](docs/ARCHITECTURE.md#adding-data-sources)
4. 🎨 Customize [globe appearance](frontend/README.md#customization)

---

**Happy coding! 🎉**
