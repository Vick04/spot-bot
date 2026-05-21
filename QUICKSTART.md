# SPOT-BOT Refactored Architecture — Quick Start

## Overview

Spot-bot is a **unified cryptocurrency trading bot** with:
- ✅ **Live trading** via Binance WebSocket (1-minute candles)
- ✅ **Backtesting** from historical database (identical logic)
- ✅ **REST API + WebSocket** for real-time monitoring
- ✅ **Hot-reloadable config** from database

**Key Insight:** The same `TradingManager` code runs in both live and simulator modes. Only the data source changes.

---

## Prerequisites

- **Node.js** 18+ (with npm)
- **PostgreSQL** 14+ running locally
- **Binance API keys** (optional; not needed for development/backtesting)

---

## 1. Database Setup

```bash
# Create spotbot database
createdb spotbot

# Or via psql:
# psql -U postgres
# CREATE DATABASE spotbot;
```

---

## 2. Environment Configuration

Create `.env` file in project root:

```env
# Database
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/spotbot"

# API server
API_PORT=3131

# Binance (optional, for live trading)
BINANCE_API_KEY=your_api_key_here
BINANCE_API_SECRET=your_api_secret_here
```

Replace:
- `YOUR_PASSWORD` — your PostgreSQL password
- Binance keys — optional; leave blank for testing

---

## 3. Initial Setup

```bash
# Install dependencies
npm install

# Sync Prisma schema to database
npx prisma db push

# Seed watchlist (optional but recommended)
npx ts-node -e "
const { prisma } = require('./src/db/prismaClient');
(async () => {
  await prisma.watchlist.deleteMany({});
  const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
  for (const sym of symbols) {
    await prisma.watchlist.create({
      data: {
        symbol: sym,
        params: {},
        active: true,
      },
    });
  }
  await prisma.\$disconnect();
  console.log('✅ Watchlist seeded');
})();
"
```

---

## 4. Run Live Engine + API (Terminal 1) — RECOMMENDED

```bash
npm run live:api
```

**What this does:**
1. Loads config from database
2. Connects to Binance WebSocket (1m candles)
3. Initializes TradingManager with 3 symbols
4. Starts REST API server (port 3131)
5. Broadcasts real-time updates via WebSocket

**Sample Output:**
```
[LiveEngine] Config loaded: { UP_MAX_STREAK: 1, DAILY_MAX_TRADES: 2, ... }
[LiveEngine] Symbols: BTCUSDT, ETHUSDT, BNBUSDT
[LiveEngine] Loading warmup candles...
[TradingManager] BTCUSDT: warmed up with 500 candles
[TradingManager] ETHUSDT: warmed up with 500 candles
[TradingManager] BNBUSDT: warmed up with 500 candles
[BinanceWebSocket] ✅ Connected to Binance
[LiveEngine] ✅ Running
```

---

## 5. Run Frontend (Terminal 2)

```bash
# Install client dependencies
npm install --prefix client

# Start Vite dev server
npm run --prefix client dev
```

**Frontend URL:** http://localhost:5173

---

## 6. API Endpoints

All endpoints at `http://localhost:3131/api/`:

### Read Endpoints

```bash
# List active symbols
curl http://localhost:3131/api/watchlist

# Current bot status + active trade
curl http://localhost:3131/api/status

# Closed trade history (paginated)
curl http://localhost:3131/api/trades?page=1&limit=20

# Bot configuration
curl http://localhost:3131/api/config

# Health check
curl http://localhost:3131/api/health
```

### Write Endpoints

```bash
# Update config (hot-reload)
curl -X PUT http://localhost:3131/api/config \
  -H "Content-Type: application/json" \
  -d '{"DAILY_MAX_TRADES": 3, "UP_MAX_STREAK": 2}'

# Update watchlist
curl -X POST http://localhost:3131/api/watchlist \
  -H "Content-Type: application/json" \
  -d '{"symbols": ["BTCUSDT", "ETHUSDT", "BNBUSDT"]}'
```

### WebSocket Connection

```bash
# Real-time price updates, trades, config changes
wscat -c ws://localhost:3131

# In browser:
const ws = new WebSocket("ws://localhost:3131");
ws.onmessage = (msg) => console.log(JSON.parse(msg.data));
```

---

## 7. Run Simulator (Offline Backtesting)

Instead of live trading, backtest using historical database:

```bash
# Load historical candles, run backtest, print results
npm run simulate
```

**Output:**
```
[DatabaseBacktest] Loading 190044 candles...
[DatabaseBacktest] Processed 190044 candles
[Simulator] SIMULATION RESULTS
────────────────────────────────
Total trades:     42
Winning trades:   28
Losing trades:    14
Win rate:         66.67%
Final balance:    $10,567.89
Total P&L:        +$567.89 (+5.68%)
```

---

## 8. Database Inspection

```bash
# Interactive database explorer (web UI)
npx prisma studio

# Query trades
psql spotbot -c "SELECT symbol, buyPrice, sellPrice, pnlPct FROM live_trade ORDER BY id DESC LIMIT 5;"

# Query config
psql spotbot -c "SELECT key, value FROM bot_config;"

# Query watchlist
psql spotbot -c "SELECT symbol, active FROM watchlist;"
```

---

## 9. Common Workflows

### Workflow A: Test API Without Live Trading

```bash
# Terminal 1: Start API server only (no data)
npm run api

# Terminal 2: Frontend
npm run --prefix client dev

# Verify API endpoints work, config updates persist
curl http://localhost:3131/api/config
```

### Workflow B: Compare Live vs Backtest

```bash
# Terminal 1: Backtest offline (fast)
npm run simulate

# Note the results, then:
# Terminal 1: Live trading (slower, real money)
npm run live:api
```

### Workflow C: Monitor Live Engine

```bash
# Terminal 1: Live engine
npm run live:api

# Terminal 2: Watch active trade
watch -n 1 'curl -s http://localhost:3131/api/status | jq .activeTrade'

# Terminal 3: Frontend dashboard
npm run --prefix client dev
```

### Workflow D: Clean Database Reset

```bash
# Drop and recreate database
dropdb spotbot
createdb spotbot

# Re-sync schema
npx prisma db push

# Re-seed (from step 3 above)
npx ts-node -e "..."
```

---

## 10. npm Scripts Reference

| Command | Purpose |
|---------|---------|
| `npm run live:api` | **🔴 MAIN:** WebSocket + Trading Engine + API Server |
| `npm run live` | Live engine only (no API) |
| `npm run api` | API server only (no live data) |
| `npm run simulate` | Offline backtest from database |
| `npm run db:push` | Sync schema to database |
| `npm run clean:candles` | Erase all candles from DB |

---

## 11. Troubleshooting

### "Cannot connect to PostgreSQL"

```bash
# Verify PostgreSQL is running
psql -U postgres -c "SELECT 1;"

# Start PostgreSQL if needed:
# macOS: brew services start postgresql
# Linux: sudo systemctl start postgresql  
# Windows: Check Services > PostgreSQL is running
```

### "Module not found: src/entries/live"

```bash
# Ensure TypeScript is compiled
npx tsc --noEmit --skipLibCheck
```

### "Binance WebSocket connection failed"

- Check network connectivity
- Verify Binance status at https://status.binance.com
- Note: WS connection retries auto with exponential backoff

### "Database already has an active session"

```bash
# Check for orphaned positions
psql spotbot -c "SELECT * FROM live_trade WHERE sellTime IS NULL;"

# Close manually if needed:
# UPDATE live_trade SET sellTime = NOW() WHERE id = X;
```

### "Warmup candles failed to load"

```bash
# Seed historical data first
npm run fetch  # (if available)

# Or populate via API call to Binance (may take time)
```

---

## 12. Architecture at a Glance

```
                    ┌─── Binance WebSocket ──────┐
                    │   (1m candles, live)       │
                    └────────────┬────────────────┘
                                 │
                    ┌────────────┴───────────────┐
                    │ BinanceWebSocketProvider   │
                    └────────────┬───────────────┘
                                 │
                    ┌────────────▼───────────────┐
                    │   TradingManager           │
                    │  (unified logic)           │
                    │  - Buy/Sell decisions      │
                    │  - Observer management     │
                    │  - Daily limits (GMT-3)    │
                    └────────────┬───────────────┘
                                 │
                    ┌────────────┴───────────────┐
                    │  Executor (Persistence)    │
                    │  - Sessions                │
                    │  - Order execution         │
                    │  - Database writes         │
                    └────────────┬───────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
        ▼                        ▼                        ▼
    REST API              WebSocket Server          PostgreSQL
  /api/status          (real-time updates)        (trades, config)
  /api/config                                   
  /api/watchlist
  /api/trades
        │
        └──→ Frontend (React + Vite)
             http://localhost:5173
```

For **detailed architecture documentation**, see `docs/ARCHITECTURE.md`.

---

## 13. Next Steps

1. ✅ `createdb spotbot` — Create database
2. ✅ Create `.env` — Configure credentials
3. ✅ `npx prisma db push` — Sync schema
4. ✅ `npx ts-node -e "..."` — Seed watchlist
5. ✅ `npm run live:api` — Start live engine
6. ✅ `npm run --prefix client dev` — Start frontend
7. 🎯 Monitor dashboard at http://localhost:5173

---

## 14. More Information

- **Architecture Details:** `docs/ARCHITECTURE.md`
- **Refactoring Summary:** `REFACTORING_COMPLETE.md`
- **Database Schema:** `src/db/schema.prisma`
- **Configuration:** `src/config/constants.ts`

---

**Happy trading! 🚀**
