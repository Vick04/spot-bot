# SPOT-BOT Integration Guide

## Overview

The SPOT-BOT system now includes **OrderObserver** and **TradingManager** for automated trading on the top 10 gainers. This guide explains how all components work together.

---

## Architecture Flow

```
┌─────────────────┐
│ BinanceWebSocket│ ← Real-time 1m candles
└────────┬────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│ GainersManager                            │
│ • Maintains CryptoObserver for each symbol│
│ • Tracks 60 candles (1 hour window)       │
│ • Calculates gainer1h %                   │
│ • Computes MA20, MA99, BB Bands           │
└────────┬─────────────────────────────────┘
         │
         ├─────────────────────────────┐
         │                             │
         ▼                             ▼
   Top 10 Gainers          Technical Indicators
   (every 10 candles)      (every candle)
         │                             │
         └──────────┬──────────────────┘
                    │
                    ▼
        ┌───────────────────────────┐
        │ TradingManager            │
        │ • Maintains OrderObserver │
        │   for each top 10 symbol  │
        │ • Evaluates trading       │
        │   conditions              │
        │ • Executes buy/sell       │
        │ • Tracks P&L              │
        └───────────┬───────────────┘
                    │
                    ▼
        WebSocket & REST API
        Broadcasting events
```

---

## Component Details

### 1. GainersManager (Enhanced)

**File**: `src/GainersManager.js`

**New Methods**:
- `getIndicators()` - Returns MA20, MA99, BB Upper/Lower

**Existing Methods**:
- `getTop1hGainers(limit)` - Returns top gainers sorted by gainer1h %

### 2. CryptoObserver (Enhanced)

**File**: `src/CryptoObserver.js`

**New Getters**:
- `ma20` - 20-period simple moving average
- `ma99` - 99-period simple moving average
- `bbUpper` - Bollinger Bands upper band (20-period, 2σ)
- `bbLower` - Bollinger Bands lower band (20-period, 2σ)

**New Methods**:
- `getIndicators()` - Returns all indicators as object

### 3. OrderObserver (New)

**File**: `src/OrderObserver.js`

**Purpose**: Monitors a single symbol and evaluates trading conditions

**State Variables**:
- `estado` - WAITING, BOUGHT, or SOLD
- `buyPrice`, `buyStrategy`, `buyTime` - Buy details
- `currentPrice`, `gainer1h` - Current market data
- `upStreak` - Counter for consecutive UP trades (persists across trades)
- `ma20`, `ma99`, `bbUpper`, `bbLower` - Technical indicators
- `pnlPercent`, `timeInTrade` - P&L metrics

**Key Methods**:
```javascript
observer.updateWithCandle(candle)     // Update with new candle + indicators
observer.evaluateConditions()          // Calculate canBuyDOWN, canBuyUP, shouldSell
observer.executeBuy(strategy)          // Record BUY (DOWN or UP)
observer.executeSell()                 // Record SELL, calculate P&L
observer.getState()                    // Return visible state for TradingManager
```

**Conditions**:

**DOWN Strategy** (Short Recovery):
- Cond1: `ma20 < ma99 AND bbLower < ma99 AND bbUpper < ma99` (oversold)
- Cond2: `close < ma99 × 0.970` (price depressed)
- SELL: `close >= buyPrice × 1.008` (+0.8% take profit)

**UP Strategy** (Continuation):
- Cond1: `ma20 > ma99 AND bbLower > ma99 AND bbUpper > ma99 AND upStreak < 1` (overbought + not consecutive)
- Cond2: `close > ma99 × 1.015` (breakout)
- SELL: `close >= buyPrice × 1.070` (+7.0% take profit)

### 4. TradingManager (New)

**File**: `src/TradingManager.js`

**Purpose**: Manages the pool of OrderObservers for top 10 symbols

**Key Responsibilities**:
1. **Top 10 Pool Management**:
   - Creates OrderObserver when symbol enters top 10
   - Destroys OrderObserver when symbol leaves top 10
   - Maintains exactly 10 observers

2. **Trading Decisions**:
   - Updates observers with candle data + indicators
   - Evaluates trading conditions
   - Executes buy/sell respecting limits:
     - Max 2 trades per symbol per day
     - Max 10% daily P&L, then stop
     - Max 1 consecutive UP trade (via `upStreak`)

3. **Event Broadcasting**:
   - Emits `order-buy` and `order-sell` events
   - Server broadcasts to WebSocket clients

**Key Methods**:
```javascript
tradingManager.updateTopGainers(gainers)              // Update top 10 pool
tradingManager.onCandleUpdate(symbol, candle)        // Process new candle
tradingManager.getStatus()                             // Return all observer states
tradingManager.resetDailyCounters()                   // Reset at midnight
```

---

## Trading Configuration

**File**: `src/config.js`

```javascript
TRADING_CONFIG: {
  downCond2: 0.970,     // % bajo ma99 para activar DOWN
  upCond2: 1.015,       // % sobre ma99 para activar UP
  downSell: 1.008,      // Take profit DOWN: +0.8%
  upSell: 1.070,        // Take profit UP: +7.0%
},

DAILY_MAX_TRADES_PER_SYMBOL: 2,    // Max trades per day
DAILY_MAX_PNL_PCT: 10,              // Max PnL % before stopping
UP_MAX_STREAK: 1,                   // Max consecutive UP trades
```

**Environment Variables**:
```bash
TRADING_DOWN_COND2=0.970     # Override in .env
TRADING_UP_COND2=1.015
TRADING_DOWN_SELL=1.008
TRADING_UP_SELL=1.070
```

---

## Data Flow - Minute by Minute

```
00:00 - New minute starts
  ↓
BinanceWebSocket receives candle (k.x=true = closed)
  ↓
server.js receives "candle" event
  ↓
GainersManager.updateCandle()
  • CryptoObserver receives candle
  • Adds to FIFO buffer (60 candles max)
  • Recalculates gainer1h %
  ↓
Every 10 candles:
  • Get top 10 gainers
  • Broadcast via WebSocket
  • Pass to TradingManager.updateTopGainers()
  ↓
For each candle:
  • Extract technical indicators (ma20, ma99, bb)
  • Pass to TradingManager.onCandleUpdate()
  ↓
TradingManager processes each top 10 symbol:
  • OrderObserver.updateWithCandle()
  • OrderObserver.evaluateConditions()
  • Check: shouldSell? → executeSell()
  • Check: canBuyDOWN? → executeBuy('DOWN')
  • Check: canBuyUP? → executeBuy('UP')
  ↓
OrderObserver events (buy/sell)
  ↓
Broadcast to WebSocket clients
```

---

## REST API Endpoints

### New Endpoints

```
GET /api/trading/status
  Returns TradingManager status with all observer states

GET /api/trading/observers
  Returns array of all active OrderObserver states

GET /api/trading/observer/:symbol
  Returns state of specific OrderObserver
  Example: /api/trading/observer/BTCUSDT
```

### Existing Endpoints

```
GET /api/gainers?limit=10
  Top 10 gainers (unchanged)

GET /api/gainers/all?limit=50
  All gainers (unchanged)
```

---

## WebSocket Events

### New Events

```json
{
  "type": "trading-order",
  "action": "buy",
  "data": {
    "symbol": "BTCUSDT",
    "strategy": "DOWN",
    "buyPrice": 45230.50,
    "buyTime": "2026-05-22T10:35:00Z"
  },
  "timestamp": "2026-05-22T10:35:00Z"
}
```

```json
{
  "type": "trading-order",
  "action": "sell",
  "data": {
    "symbol": "BTCUSDT",
    "strategy": "DOWN",
    "buyPrice": 45230.50,
    "sellPrice": 45600.25,
    "pnl": 369.75,
    "pnlPercent": 0.82,
    "timeInTrade": 45,
    "buyTime": "2026-05-22T10:35:00Z",
    "sellTime": "2026-05-22T10:36:00Z"
  },
  "timestamp": "2026-05-22T10:36:00Z"
}
```

---

## State Persistence

### What Persists

| Variable | Scope | Lifetime |
|----------|-------|----------|
| `upStreak` | Per OrderObserver | Across multiple trades, until DOWN or destruction |
| `ma20, ma99, bbUpper, bbLower` | Per CryptoObserver | Continuously updated, 60-candle window |
| `currentPrice, gainer1h` | Per CryptoObserver | Real-time |

### What Resets

| Variable | When | Why |
|----------|------|-----|
| `estado` | After executeSell() | Prepare for next trade |
| `buyPrice, buyStrategy` | After executeSell() | Clear trade details |
| `upStreak` | When DOWN executes | Prevent consecutive UPs after recovery |
| `pnlPercent, timeInTrade` | After executeSell() | Clean state for next trade |

### Pool Lifecycle

```
Symbol enters top 10:
  → new OrderObserver(symbol) created
  → upStreak = 0
  → estado = WAITING

Symbol leaves top 10:
  → observer.destroy()
  → All state lost (including upStreak)

Symbol re-enters top 10:
  → new OrderObserver(symbol) created (fresh instance)
  → upStreak = 0 (doesn't recover previous state)
```

---

## Testing Endpoints

### Check Current Trading Status

```bash
curl http://localhost:4445/api/trading/status | jq
```

**Response**:
```json
{
  "activeObservers": 10,
  "observers": {
    "BTCUSDT": {
      "symbol": "BTCUSDT",
      "estado": "WAITING",
      "currentPrice": 45230.50,
      "canBuyDOWN": false,
      "canBuyUP": false,
      "upStreak": 0,
      ...
    },
    ...
  },
  "dailyTrades": { "BTCUSDT": 1, ... },
  "dailyPnL": { "BTCUSDT": 0.82, ... }
}
```

### Watch Specific Symbol

```bash
curl http://localhost:4445/api/trading/observer/ETHUSDT | jq
```

### Monitor with WebSocket

```javascript
const ws = new WebSocket('ws://localhost:4445');
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'trading-order') {
    console.log(`${msg.action.toUpperCase()}: ${msg.data.symbol} ${msg.data.strategy}`);
  }
});
```

---

## Debugging

### Enable Detailed Logging

Check `debug.log` for all candle events:
```bash
tail -f debug.log | grep "BTCUSDT"
```

### Monitor TradingManager Operations

Console output will show:
```
[TradingManager] Symbol BTCUSDT entered top 10 - creating observer
[TradingManager] BUY BTCUSDT DOWN @ 45230.50000000
[TradingManager] SELL BTCUSDT: 0.82%
[TradingManager] Symbol DOGE exited top 10 - destroying observer
```

### Check Observer State

```bash
curl http://localhost:4445/api/trading/observer/BTCUSDT | jq '.pnlPercent'
```

---

## Configuration Adjustment

To change trading parameters at runtime:

**Via Environment Variables**:
```bash
export TRADING_DOWN_COND2=0.965      # More aggressive DOWN
export TRADING_UP_SELL=1.050          # Tighter UP profit
npm start
```

**Via config.js** (after changes, restart server):
```javascript
TRADING_CONFIG: {
  downCond2: 0.965,      // Changed from 0.970
  upSell: 1.050,         // Changed from 1.070
}
```

---

## Future Enhancements

1. **Historical P&L Tracking**: Store daily/monthly P&L
2. **Advanced Indicators**: Add RSI, MACD, Volume analysis
3. **Risk Management**: Position sizing based on volatility
4. **Backtesting**: Replay historical data to validate strategies
5. **Machine Learning**: Adaptive parameter tuning
6. **Order Automation**: Real market order execution (Binance API)

---

## Files Modified/Created

| File | Action | Purpose |
|------|--------|---------|
| `src/OrderObserver.js` | CREATE | Single symbol trading logic |
| `src/TradingManager.js` | CREATE | Pool management + trading decisions |
| `src/CryptoObserver.js` | MODIFY | Add technical indicators |
| `src/config.js` | MODIFY | Add TRADING_CONFIG |
| `src/server.js` | MODIFY | Integrate TradingManager |

---

**Last Updated**: 2026-05-22
