# SPOT-BOT Development Guide

## Quick Start

### Prerequisites
- Node.js v16+
- npm

### Setup

1. **Clone the repository** (if needed)
```bash
git clone <repo-url>
cd spot-bot
```

2. **Install backend dependencies**
```bash
npm install
```

3. **Install frontend dependencies**
```bash
cd client
npm install
cd ..
```

4. **Configure environment variables**

Backend (`.env`):
```
API_PORT=4444
NODE_ENV=development
GAINERS_SYMBOLS_LIMIT=0
GAINERS_MIN_VOLUME=1000000
GAINERS_BUFFER_SIZE=60
```

Frontend (`client/.env`):
```
VITE_API_BASE_URL=http://localhost:4444
VITE_WS_URL=ws://localhost:4444
```

## Running in Development

### Terminal 1 - Backend Server
```bash
npm run dev
```
Runs on: `http://localhost:4444`

### Terminal 2 - Frontend Server
```bash
cd client
npm run dev
```
Runs on: `http://localhost:5173`

## Architecture

```
┌─────────────────────────────────┐
│   React Frontend (Vite)         │
│   Port 5173                     │
│   ├─ Header (Status, Symbols)   │
│   ├─ GainerTable (Top 10)       │
│   └─ Footer (Clock, Info)       │
└──────────────┬──────────────────┘
               │ WebSocket + REST
┌──────────────▼──────────────────┐
│   Node.js Backend (Express)     │
│   Port 4444                     │
│   ├─ REST API (/api/gainers)    │
│   ├─ WebSocket Server           │
│   └─ Binance WebSocket Client   │
└─────────────────────────────────┘
```

## API Endpoints

### REST API

**Get Top 10 Gainers**
```
GET /api/gainers?limit=10
```

**Get System Status**
```
GET /api/status
```

**Get All Gainers**
```
GET /api/gainers/all
```

**Debug - Specific Observer**
```
GET /api/debug/observer/:symbol
```

**Debug - All Observers**
```
GET /api/debug/observers
```

### WebSocket Events

**Connection Welcome**
```json
{
  "type": "welcome",
  "message": "Connected to SPOT-BOT API",
  "status": { "totalSymbols": 200, "readyCount": 200 }
}
```

**Manager Status Update**
```json
{
  "type": "manager-status",
  "status": { "totalSymbols": 200, "readyCount": 200 }
}
```

**Gainers Update (Every minute)**
```json
{
  "type": "gainers-update",
  "gainers": [
    {
      "symbol": "BTCUSDT",
      "gainer1h": 2.5,
      "price": 77591.39,
      "bufferSize": 60
    }
  ],
  "timestamp": "2026-05-22T05:44:00Z"
}
```

## Backend Files

- `src/server.js` - Express + WebSocket server
- `src/GainersManager.js` - Manages crypto observers
- `src/CryptoObserver.js` - Per-symbol price tracking
- `src/BinanceWebSocket.js` - Real-time Binance connection
- `src/binanceAPI.js` - Binance REST API client
- `src/config.js` - Configuration from environment

## Frontend Files

- `src/App.jsx` - Main component
- `src/hooks/useWebSocket.js` - WebSocket connection hook
- `src/components/Header.jsx` - Status bar component
- `src/components/GainerTable.jsx` - Gainers table component
- `src/components/Footer.jsx` - Footer component
- `src/index.css` - TailwindCSS styles

## Building for Production

### Backend
```bash
npm run start
```

### Frontend
```bash
cd client
npm run build
```

Output in `client/dist/` directory.

## Troubleshooting

### WebSocket Connection Failed
- Ensure backend is running on port 4444
- Check `VITE_WS_URL` in `client/.env`
- Clear browser cache

### Backend Port Already in Use
```bash
# Kill process on port 4444
lsof -ti:4444 | xargs kill -9
```

### No Gainers Showing
- Wait 30 seconds for symbols to initialize
- Check `/api/status` endpoint
- Verify Binance API connectivity

### Frontend Not Loading
- Ensure frontend dev server is running
- Check that `http://localhost:5173` is accessible
- Clear browser cache and reload

## Environment Variables Reference

### Backend (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `API_PORT` | 3333 | Server port |
| `NODE_ENV` | development | Environment |
| `GAINERS_SYMBOLS_LIMIT` | 0 | 0 = all symbols, or number |
| `GAINERS_MIN_VOLUME` | 1000000 | Minimum 24h volume (USDT) |
| `GAINERS_BUFFER_SIZE` | 60 | Candles per symbol (1 min each) |

### Frontend (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | http://localhost:4444 | Backend API URL |
| `VITE_WS_URL` | ws://localhost:4444 | Backend WebSocket URL |

## Performance Notes

- Backend loads 200+ symbols in parallel (takes ~10-15 seconds)
- Each symbol maintains 60 1-minute candles (~1 hour of history)
- WebSocket broadcasts gainers update every minute
- Frontend automatically reconnects if connection drops

## Next Steps

1. ✅ Real-time WebSocket integration - DONE
2. ✅ React frontend with TailwindCSS - DONE
3. 📈 Add historical data tracking
4. 🔔 Add price alerts
5. 📊 Add charting library
6. 💰 Add trading signals integration
