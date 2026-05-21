# Spot-Bot Architecture (Refactored v2)

## Overview

This document describes the unified architecture of spot-bot, a cryptocurrency trading bot that supports both live trading via Binance WebSocket and backtesting via database-stored historical candles.

**Key Achievement:** The same `TradingManager` code runs identically in both live and simulator modes. Only the data source changes.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      DATA SOURCES                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Binance WebSocket (Live)         Database (Backtest)      │
│       ↓                                  ↓                   │
│  BinanceWebSocketProvider        DatabaseBacktestProvider   │
│       ↓                                  ↓                   │
└─────────────────────────────────────────────────────────────┘
              ↓                          ↓
┌─────────────────────────────────────────────────────────────┐
│            UNIFIED TRADING MANAGER                          │
│                                                             │
│  • Loads warmup candles (500 initial)                       │
│  • Evaluates buy/sell signals per symbol                   │
│  • Manages daily limits (GMT-3 timezone)                    │
│  • Emits events (price, buy, sell, error)                  │
│  • Maintains session state                                 │
│                                                             │
│         ↓                                                   │
│  TradingManager (src/core/manager.ts)                      │
│         ↑                                                   │
│         ├→ SymbolObserver[] (one per symbol)               │
│         ├→ CandleBuffer[] (rolling 600-candle window)      │
│         └→ ActiveTrade tracking                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────┐
│        EXECUTION & PERSISTENCE LAYER                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  executor.ts:                                              │
│  • Session management (start_session, end_session)         │
│  • Order execution (liveExecuteBuy, liveExecuteSell)       │
│  • Database writes (trades, positions)                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────┐
│         APPLICATION LAYER (Entry Points)                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. npm run live:api (WebSocket + API Server)             │
│     - Starts BinanceWebSocketProvider                      │
│     - Initializes TradingManager                           │
│     - Runs REST API + WebSocket server                     │
│     - Broadcasts real-time updates                         │
│                                                             │
│  2. npm run simulate (Database-driven backtest)           │
│     - Loads historical candles from database               │
│     - Feeds to TradingManager sequentially                 │
│     - Collects results in memory                           │
│     - Prints summary statistics                            │
│                                                             │
│  3. npm run api (REST/WS server only, no live trading)    │
│     - Starts API server                                    │
│     - No WebSocket provider (API-only mode)                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
src/
│
├── core/                          # Shared trading logic
│   ├── candle.ts                  # RawCandle & ProcessedCandle types
│   ├── manager.ts                 # TradingManager (main logic)
│   ├── observer.ts                # SymbolObserver (signal detection)
│   └── types.ts                   # Centralized type definitions
│
├── data/                          # Data source abstraction
│   ├── dataProvider.ts            # Abstract DataProvider interface
│   └── sources/
│       ├── live.ts                # BinanceWebSocketProvider
│       └── backtest.ts            # DatabaseBacktestProvider
│
├── execution/                     # Order execution & persistence
│   └── executor.ts                # Session & order management
│
├── utils/                         # Shared utilities
│   ├── timeUtils.ts               # GMT-3 timezone helpers
│   ├── formatters.ts              # Number/currency formatting
│   └── validators.ts              # Input validation
│
├── config/                        # Configuration
│   └── constants.ts               # Centralized constants & settings
│
├── entries/                       # Unified entry points
│   ├── live.ts                    # WebSocket + TradingManager
│   ├── api.ts                     # REST API + WebSocket server
│   └── simulate.ts                # Backtest from database
│
├── processors/                    # Candle processing
│   └── candleProcessor.ts         # Calculate technical indicators
│
├── indicators/                    # Technical indicator calculations
│   ├── movingAverages.ts
│   ├── bollingerBands.ts
│   ├── trix.ts
│   ├── superTrend.ts
│   └── ...
│
├── api/                           # (Legacy, minimal)
│   └── wsEventBus.ts              # WebSocket broadcasting helper
│
├── db/                            # Database & ORM
│   ├── prismaClient.ts
│   └── schema.prisma
│
├── fetch/                         # Binance API client
│   └── binanceFetcher.ts
│
├── live/                          # (Legacy, minimal)
│   └── liveConditions.ts          # Buy/sell condition definitions
│
└── loaders/, writers/, etc.       # Supporting modules
```

---

## Key Components

### 1. **TradingManager** (`src/core/manager.ts`)

The heart of the system. Manages trading logic independently of data source.

```typescript
class TradingManager extends EventEmitter {
  // Public API
  initialize(symbols, config)
  start() / stop()
  setSession(sessionId, wallet)
  async onCandleClose(symbol, candle)
  
  // Events emitted
  emit("price", { symbol, price, timestamp })
  emit("buy", { symbol, price, usdtSpent, ... })
  emit("sell", { symbol, price, pnl, pnlPct, ... })
  emit("error", { error })
  
  // Accessors
  get isRunning()
  get balance()
  get activeTrade()
  get lastPrices()
  get dailyStats()
}
```

**Key Methods:**
- `initialize()`: Set up symbols, parameters, and initial wallet state
- `onCandleClose()`: Process incoming candles (main trading logic)
- `warmupObserver()`: Load initial candles for indicator calculation
- `updateConfig()`: Hot-reload configuration from database

---

### 2. **DataProvider Interface** (`src/data/dataProvider.ts`)

Abstract base class for data sources. Implementations feed candles to the manager.

```typescript
abstract class BaseDataProvider {
  abstract loadWarmupCandles(symbol): Promise<RawCandle[]>
  abstract start(): Promise<void>
  abstract stop(): Promise<void>
  
  onCandle(callback): void  // Register listener
  protected emitCandle(symbol, candle): void
}
```

**Implementations:**

1. **BinanceWebSocketProvider** (`src/data/sources/live.ts`)
   - Connects to Binance WebSocket stream
   - Emits ProcessedCandles in real-time
   - Auto-reconnects on disconnect
   - Indicators pre-calculated from rolling window

2. **DatabaseBacktestProvider** (`src/data/sources/backtest.ts`)
   - Loads historical candles from Postgres
   - Processes them sequentially (in-order)
   - Stops after final candle
   - Allows repeated backtest runs with same data

---

### 3. **SymbolObserver** (`src/core/observer.ts`)

Per-symbol signal detector. Evaluates buy/sell conditions based on technical indicators.

```typescript
class SymbolObserver {
  tick(candle: ProcessedCandle): void
  get match(): boolean  // Buy signal detected?
  get strategy(): "up" | "down" | null
  get matchCandle(): ProcessedCandle | null
}
```

**Signal Detection:**
- Evaluates `buyConditions` and `sellConditions`
- Conditions reference technical indicators (MA20, MA99, Bollinger Bands, TRIX, SuperTrend, etc.)
- Emits `match = true` when conditions are met

---

### 4. **Unified Entry Points**

#### **Live Trading** (`npm run live:api`)

```bash
npm run live:api
```

Starts all three components:
1. **BinanceWebSocketProvider**: Real-time market data
2. **TradingManager**: Identical trading logic
3. **REST API + WebSocket**: Control and monitoring

```typescript
// src/entries/live.ts
const manager = new TradingManager(symbols)
const provider = new BinanceWebSocketProvider(symbols)

manager.initialize(symbols, { ...config })
await manager.warmupObserver(symbol, processedCandles)
provider.onCandle(async (symbol, candle) => {
  await manager.onCandleClose(symbol, candle)
})

manager.start()
await provider.start()
// → Ready for trading
```

#### **Backtesting** (`npm run simulate`)

```bash
npm run simulate
```

Same manager, different data source:

```typescript
// src/entries/simulate.ts
const manager = new TradingManager(symbols)
const provider = new DatabaseBacktestProvider(symbols)

// Same initialization
manager.initialize(symbols, { ...config })

// Same warmup
await manager.warmupObserver(symbol, processedCandles)

// Process all historical candles
provider.onCandle(async (symbol, candle) => {
  await manager.onCandleClose(symbol, candle)
})

manager.start()
await provider.start()  // Runs backtest to completion
// → Prints summary statistics
```

#### **API Server Only** (`npm run api`)

```bash
npm run api
```

Starts REST API without live trading (useful for UI testing):

```typescript
// src/entries/api.ts
// Same setup, but manager starts only on first WebSocket connection
// Good for testing endpoints without live data
```

---

## Data Flow

### Live Trading Flow

```
Binance WebSocket Stream (1 candle/minute)
    ↓ (BinanceWebSocketProvider._handleKline)
RawCandle: { openTime, open, high, low, close, volume, closeTime }
    ↓
ProcessedCandle: RawCandle + indicators (ma20, ma99, bb, trix, superTrend, volAvg, volRatio)
    ↓ (provider.onCandle callback)
TradingManager.onCandleClose(symbol, candle)
    ├→ Update CandleBuffer
    ├→ Update SymbolObserver
    ├→ Check sell conditions
    ├→ Check buy conditions
    ├→ Emit events (price, buy, sell)
    └→ Save to database (via executor)
```

### Backtest Flow

```
Historical Candles from Database
    ↓ (DatabaseBacktestProvider.start)
RawCandle: { openTime, open, high, low, close, volume, closeTime }
    ↓
ProcessCandles() function
    ↓
ProcessedCandle: RawCandle + indicators (calculated from 600-candle rolling window)
    ↓ (provider.onCandle callback)
TradingManager.onCandleClose(symbol, candle) [IDENTICAL CODE]
    ├→ Update CandleBuffer
    ├→ Update SymbolObserver
    ├→ Check sell conditions
    ├→ Check buy conditions
    ├→ Collect results in memory
    └→ (no database writes)
    
After all candles processed:
    ↓
Compute summary statistics
    ↓
Print report to console
```

---

## Configuration Management

### Live Mode (Database-backed)

```typescript
// src/entries/live.ts
const config = await loadConfigFromDatabase()
// Reads from botConfig table

manager.initialize(symbols, {
  upMaxStreak: config.UP_MAX_STREAK,
  dailyMaxTrades: config.DAILY_MAX_TRADES,
  dailyMaxPnlPct: config.DAILY_MAX_PNL_PCT,
  feeRate: config.FEE_RATE,
  initialBalanceUsdt: config.INITIAL_BALANCE_USDT,
})

// Can be updated via API:
// PUT /api/config → updates database → manager.updateConfig()
```

### Simulator Mode (File-based)

```typescript
// src/entries/simulate.ts
const config = { ... }  // Hardcoded in script

manager.initialize(symbols, {
  upMaxStreak: 1,
  dailyMaxTrades: 2,
  dailyMaxPnlPct: 10,
  ...
})

// Fixed for backtest run (no changes during execution)
```

---

## Testing Scenarios

### Scenario 1: Single Candle (Unit Test)

```typescript
const candle = {
  openTime: 1234567890,
  open: 100, high: 102, low: 99, close: 101,
  volume: 1000, closeTime: 1234567950,
  ma20: 100.5, ma99: 100.8, bbUpper: 102, bbLower: 99,
  trix: 0.1, superTrend: 101, stDirection: 1,
  volAvg: 1200, volRatio: 0.83
}

manager.onCandleClose("BTCUSDT", candle)
// Evaluates buy/sell conditions
// May emit "buy" or "sell" event
```

### Scenario 2: Warmup Sequence

```typescript
// Load 500 candles
const warmupCandles = await provider.loadWarmupCandles("BTCUSDT")
await manager.warmupObserver("BTCUSDT", warmupCandles)

// Now ready for live trading (indicators calculated)
```

### Scenario 3: Multi-Symbol Parallel Processing

```typescript
// All symbols receive candles simultaneously
for (const symbol of ["BTCUSDT", "ETHUSDT", "BNBUSDT"]) {
  // Manager evaluates each independently
  manager.onCandleClose(symbol, candle)
}

// Each symbol has separate:
// - SymbolObserver (signal detection)
// - CandleBuffer (rolling window)
// - ActiveTrade (if position open)
```

---

## Key Design Principles

### 1. **Separation of Concerns**
- **Data layer** (DataProvider): How candles arrive
- **Logic layer** (TradingManager): What to do with them
- **Execution layer** (executor): Where to save results
- **API layer** (entries/api.ts): How to expose to users

### 2. **Data Source Agnosticism**
- Manager doesn't care if data comes from WebSocket or database
- Same buy/sell logic runs in both modes
- Enables perfect parity between backtest and live

### 3. **Event-Driven Architecture**
- Manager emits events instead of directly updating UI
- Decouples logic from presentation
- Supports multiple listeners (API server, logging, etc.)

### 4. **Type Safety**
- Unified `ProcessedCandle` type ensures consistency
- All indicators required (never undefined)
- Centralized type definitions prevent drift

### 5. **Configuration as Code**
- Constants centralized in `src/config/constants.ts`
- Live config hot-loadable from database
- Backtest config explicit in entry point

---

## Common Tasks

### Adding a New Buy Condition

1. Edit `src/live/liveConditions.ts` - add condition to `buyConditions[]`
2. Condition receives `ProcessedCandle` with all indicators
3. Test in simulator: `npm run simulate`
4. Deploy to live: `npm run live:api`

### Changing Daily Limits

1. **Live mode**: Update database via API
   ```bash
   curl -X PUT http://localhost:3131/api/config \
     -H "Content-Type: application/json" \
     -d '{"DAILY_MAX_TRADES": 3}'
   ```
   Manager reloads immediately

2. **Backtest**: Modify `src/entries/simulate.ts` constants and re-run

### Adding a New Data Source

1. Create `src/data/sources/yourSource.ts`
2. Extend `BaseDataProvider`
3. Implement `loadWarmupCandles()` and `start()`
4. Create entry point: `src/entries/your-mode.ts`
5. Register in npm scripts

---

## Performance Considerations

### Live Trading
- Warmup: ~500 candles × 3 symbols = 1500 indicators calculated once (startup)
- Per-candle: ~50ms per symbol (small calculation overhead)
- Memory: ~10MB for rolling buffers + active positions

### Backtesting
- 190K candles processed in ~30 seconds
- All in-memory (no database writes during backtest)
- Linear time complexity O(n candles × m symbols)

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Failed to load warmup candles" | No historical data in DB | Run seed script first |
| "Type not found: ProcessedCandle" | Mismatched imports | Verify src/core/candle.ts exports |
| "Webhook connection failed" | Network issue | Check Binance WebSocket status |
| "Session already exists" | Previous session didn't end | Check database for orphaned positions |
| "Price is null" | No data yet received | Wait for first WebSocket message |

---

## Related Documentation

- [REFACTORING_COMPLETE.md](../REFACTORING_COMPLETE.md) - Summary of refactoring phases
- [package.json](../package.json) - NPM scripts and dependencies
- [.env.example](../.env.example) - Required environment variables
