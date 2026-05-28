# SPOT-BOT Frontend

Modern React + TailwindCSS frontend for the SPOT-BOT crypto gainers tracker.

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file in the root of the client directory:

```bash
cp .env.example .env
```

Then update the values:

```
VITE_API_BASE_URL=http://localhost:4444
VITE_WS_URL=ws://localhost:4444
```

- `VITE_API_BASE_URL` - Backend API URL for REST calls
- `VITE_WS_URL` - Backend WebSocket URL for real-time updates

## Development

```bash
npm run dev
```

The app will start on `http://localhost:5173` by default.

## Build

```bash
npm run build
```

Creates an optimized production build in the `dist` folder.

## Features

- ✅ Real-time WebSocket connection to backend
- ✅ Live updates of top 10 gainers every minute
- ✅ Responsive design with TailwindCSS
- ✅ Connection status indicator
- ✅ Symbol count tracking
- ✅ Last update timestamp
- ✅ Automatic reconnection on disconnect

## Architecture

### Components

- **Header** - Status bar with connection status, symbol count, last update time
- **GainerTable** - Table displaying top 10 gainers with rank, symbol, 1h gain %, and price
- **Footer** - Real-time clock and API information

### Hooks

- **useWebSocket** - Custom hook managing WebSocket connection, data fetching, and state

### Environment Variables

All configuration is done via environment variables in `.env` file.

## Styling

- **TailwindCSS** - Utility-first CSS framework
- **Custom animations** - Pulse effect for status indicator, fade-in and slide-up animations
- **Dark theme** - Modern dark gradient background with cyan/blue accent colors

## API Integration

The frontend connects to the following backend endpoints:

- **WebSocket** - `ws://localhost:4444` - Real-time gainers updates
- **REST** - `GET /api/gainers?limit=10` - Fetch top gainers
- **REST** - `GET /api/status` - Get system status and symbol count
