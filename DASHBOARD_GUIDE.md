# SPOT-BOT Dashboard Guide

**Status**: ✅ Complete  
**Date**: 2026-05-26  
**Purpose**: Real-time visualization of OrderObserver states without trade execution

---

## What is the Dashboard?

The SPOT-BOT Dashboard is a real-time web interface that displays the complete state of all 10 top gainers being monitored. It shows:

- **Real-time observer states** - Updates every candle (per minute)
- **All trading conditions** - canBuyDOWN, canBuyUP, shouldSell
- **Technical indicators** - MA20, MA99, Bollinger Bands
- **P&L tracking** - Current profit/loss for open positions
- **Event logging** - All system events with timestamps

**Important**: The dashboard is **observation-only**. TradingManager evaluates conditions but does NOT execute trades. This allows you to see what the bot would do without actual risk.

---

## Quick Start

### 1. Start the Bot

```bash
npm start
```

Wait for:
```
[Server] ✅ TradingManager initialized
[Server] ✅ Binance WebSocket connected
[Server] Listening on port 4445
```

### 2. Open Dashboard

Navigate to: **http://localhost:4445**

You'll see:
- Connection status (should show "Connected" in green)
- Stats panel with observer counts
- Table with all 10 observers
- Event log at the bottom

---

## Dashboard Sections

### Header

```
🤖 SPOT-BOT Dashboard
Real-time OrderObserver Monitoring
```

**Connection Status** (top right):
- 🟢 **Connected** - WebSocket is active and receiving updates
- 🔴 **Disconnected** - WebSocket is not connected (will auto-reconnect)

### Stats Panel

Shows real-time counts:
- **Total Observers**: Always 10 (top gainers)
- **WAITING**: Observers with no open position
- **BOUGHT**: Observers with open positions
- **SOLD**: Recently closed positions (brief state)
- **DOWN Signals**: Active canBuyDOWN conditions
- **UP Signals**: Active canBuyUP conditions

### Observers Table

Main table displaying all 10 observers with columns:

| Column | Meaning |
|--------|---------|
| Symbol | Trading pair (e.g., BTCUSDT) |
| Estado | Current state (WAITING/BOUGHT/SOLD) |
| Precio | Current market price |
| Gainer 1h | 1-hour price change % |
| MA20 | 20-period moving average |
| MA99 | 99-period moving average |
| DOWN | ✓ if canBuyDOWN is true |
| UP | ✓ if canBuyUP is true |
| Sell | ✓ if shouldSell is true |
| P&L % | Profit/loss % for open position (0% if WAITING) |
| Streak | UP strategy consecutive count (0 or 1) |
| Tiempo | Time in trade (hh:mm:ss) or dash if WAITING |

**Color Coding**:
- **Estado**: Gray (WAITING), Green (BOUGHT), Pink (SOLD)
- **Gainer**: Green (positive), Red (negative)
- **P&L**: Green (profit), Red (loss), Gray (neutral)
- **Conditions**: Green (true), Gray (false)

**Interaction**:
- Click any row to see detailed observer information

### Detailed Observer Panel (Optional)

Click "Show selected details" to reveal full observer information:

**Left Panel**:
- Current price and 1-hour gainer
- Buy price and strategy
- Current P&L %
- UP streak count
- Time in trade

**Right Panel**:
- All technical indicators (MA20, MA99, BB bands, StdDev)
- All trading conditions with true/false status

### Event Log

Timestamped log of all system events:
- ✅ Connection events
- 🟢 BUY signals (would execute if trading enabled)
- 🔴 SELL signals (would execute if trading enabled)
- 📊 Data update events
- ⚠️ Errors or warnings

---

## Trading Conditions Explained

### canBuyDOWN Condition

Observer enters DOWN strategy when:
- MA20 < MA99 (downtrend)
- Bollinger Lower < MA99 (lower band below moving average)
- Bollinger Upper < MA99 (upper band below moving average)
- Close < MA99 × 0.970 (price 3% below MA99 - oversold)

**Effect**: Observes for price recovery (buy oversold, sell at +0.8%)

### canBuyUP Condition

Observer enters UP strategy when:
- MA20 > MA99 (uptrend)
- Bollinger Lower > MA99 (lower band above moving average)
- Bollinger Upper > MA99 (upper band above moving average)
- Close > MA99 × 1.015 (price 1.5% above MA99 - overbought)
- upStreak < 1 (max 1 consecutive UP trade per 24h)

**Effect**: Observes for continuation (buy momentum, sell at +7.0%)

### shouldSell Condition

When a position is open (estado = BOUGHT):
- **DOWN strategy**: shouldSell when profit ≥ +0.8%
- **UP strategy**: shouldSell when profit ≥ +7.0%

---

## How to Read the Dashboard

### Scenario 1: Identify Oversold Opportunity

1. Look for observers with `canBuyDOWN = ✓`
2. Check their `Gainer 1h` is negative (e.g., -2.34%)
3. Verify `MA20 < MA99` (downtrend confirmed)
4. Check `Precio` relative to `MA99` (should be near -3%)

**Interpretation**: This observer meets DOWN strategy conditions and would automatically initiate if trading were enabled.

### Scenario 2: Track Open Position

1. Find observer with `Estado = BOUGHT` (green)
2. Check `P&L %` - shows current unrealized profit/loss
3. Monitor `shouldSell` column
   - When `shouldSell = ✓`, position would close
   - Dashboard logs the actual SELL event in Event Log

3. Observe the `Tiempo` column to see how long position has been open

### Scenario 3: Monitor All Signals

1. Check **Stats Panel**: How many DOWN/UP signals are active?
2. If multiple signals exist, bot would rotate through them
3. Watch **Event Log** for actual BUY/SELL events

---

## Real-World Example

```
Time: 14:23:45 UTC

Stats Panel shows:
  WAITING: 7
  BOUGHT: 2  
  DOWN Signals: 3
  UP Signals: 1

Table shows:
  BTCUSDT:  WAITING   | Gainer: -0.20% | DOWN: ✓ | UP: - | Sell: -
  ETHUSDT:  BOUGHT    | Gainer: -0.32% | DOWN: - | UP: - | Sell: - | P&L: +0.45%
  MEGAUSDT: BOUGHT    | Gainer: +2.12% | DOWN: - | UP: - | Sell: - | P&L: +7.15%
  SOLUSDT:  WAITING   | Gainer: -0.39% | DOWN: - | UP: ✓ | Sell: -

Event Log shows:
  [14:22:30] 🟢 BUY: MEGAUSDT UP @ 0.06832
  [14:21:15] 🔴 SELL: RIFUSDT DOWN | P&L: +0.82%
  [14:20:45] 🟢 BUY: ETHUSDT DOWN @ 2345.67
```

**Interpretation**:
- ETHUSDT: Bought at DOWN signal, up +0.45%, waiting for +0.8% target
- MEGAUSDT: Bought at UP signal, already hit +7.15% (would sell on next candle)
- BTCUSDT: Meets DOWN conditions, could be next buy if manager were executing
- SOLUSDT: Meets UP conditions despite not being BOUGHT yet

---

## Controls

### Auto-scroll to latest
- ✓ **Checked** (default): Table automatically scrolls to show newest updates
- ☐ **Unchecked**: Table stays at current scroll position

### Show selected details
- ☐ **Unchecked** (default): Only table view
- ✓ **Checked**: Shows detailed observer panel when you click a row

---

## Technical Details

### WebSocket Connection

The dashboard connects via WebSocket at `ws://localhost:4445`

**Messages received**:
```javascript
// Observer update (every candle/minute)
{
  type: "observer-update",
  data: {
    symbol: "BTCUSDT",
    state: {
      // Full observer state object
      ...
    },
    timestamp: "2026-05-26T14:23:45.123Z"
  }
}

// When a BUY signal fires (observation mode)
{
  type: "trading-order",
  action: "buy",
  data: {
    symbol: "BTCUSDT",
    strategy: "DOWN",
    buyPrice: 42500.50,
    ...
  }
}

// When a SELL signal fires (observation mode)
{
  type: "trading-order",
  action: "sell",
  data: {
    symbol: "BTCUSDT",
    strategy: "DOWN",
    pnlPercent: 0.82,
    ...
  }
}
```

### Auto-Reconnection

If the WebSocket disconnects:
1. Dashboard shows "Disconnected" status
2. Logs "❌ Disconnected from server"
3. Automatically attempts reconnection every 3 seconds
4. Shows "Connected" when successful

### Data Loading

On page load:
1. Dashboard makes REST call to `/api/trading/observers`
2. Loads all 10 observers' current state
3. Then listens to WebSocket for real-time updates

This ensures you see data even if you load the page while WebSocket is connecting.

---

## REST API Reference

Used by dashboard on page load and can be queried manually:

```bash
# Get all 10 observers with complete state
curl http://localhost:4445/api/trading/observers | jq '.'

# Get specific observer details
curl http://localhost:4445/api/trading/observer/BTCUSDT | jq '.'

# Get trading manager status (includes daily limits)
curl http://localhost:4445/api/trading/status | jq '.'
```

---

## Troubleshooting

### Dashboard shows "Disconnected"

**Cause**: WebSocket connection failed

**Solution**:
1. Verify bot is running: `npm start` in Terminal 1
2. Check port 4445 is available: `lsof -i :4445` (on Mac/Linux)
3. If needed, change port in `src/config.js` and update dashboard URL
4. Reload dashboard page after fix

### Table shows 0 observers

**Cause**: Observers not yet initialized or connection issue

**Wait**: GainersManager needs ~30 seconds to initialize, then TradingManager creates 10 observers
- Monitor Terminal 1 for: `[Server] ✅ TradingManager initialized`

**Check**: Visit `http://localhost:4445/api/trading/observers` in browser - if it returns JSON with data, REST API works

### Conditions show all false

**Cause**: Not unusual - conditions only true when specific criteria met

**Verify**: 
- Are MA20 and MA99 calculated? (Both should be > 0)
- Check `Gainer 1h` - is it extreme enough?
  - DOWN needs < -3% AND price near MA99 bottom
  - UP needs > +1.5% AND price near MA99 top

### Event log not updating

**Cause**: WebSocket not connected or no observer updates

**Verify**: 
1. Check connection status (should be green)
2. Verify bot is receiving candles from Binance
3. Check browser console for errors (F12 → Console)

---

## Observation Mode vs. Real Trading

**Current State**: Observation Mode (Dashboard Only)

```
GainersManager          → Tracks top 10 gainers
      ↓
BinanceWebSocket        → Receives 1-minute candles
      ↓
CryptoObserver (×186)   → Calculates indicators for all 186 symbols
      ↓
TradingManager          → Creates 10 OrderObservers for top gainers
      ↓
OrderObserver (×10)     → Evaluates conditions every candle
      ↓
Dashboard               ← Observes all states via WebSocket
      ↓
NO TRADES EXECUTED     ← Manager only observes, never executes
```

To enable real trading, TradingManager would call `_processTradeDecisions()`, but this is currently disabled.

---

## What's Next?

Once you're comfortable with the dashboard and understand the trading conditions:

1. **Verify accuracy**: Watch a few trading signals and confirm the logic is correct
2. **Adjust thresholds**: If conditions trigger too often/rarely, adjust `downCond2`, `upCond2`, `downSell`, `upSell` in `src/config.js`
3. **Enable live trading**: (Future) Uncomment trade execution in TradingManager when ready for real trading

---

## Files Modified/Created

```
C:\Projects\spot-bot\
├── public/
│   ├── index.html        ← Dashboard HTML structure
│   ├── style.css         ← Dark theme styling
│   └── app.js            ← WebSocket client & real-time rendering
├── src/
│   ├── TradingManager.js ← Modified to observation-only mode
│   └── server.js         ← Enhanced with observer-update broadcasting
└── DASHBOARD_GUIDE.md    ← This file
```

---

## Summary

✅ Dashboard created and integrated  
✅ Real-time WebSocket updates  
✅ All observer states visible  
✅ Condition monitoring  
✅ Event logging  
✅ Auto-reconnection  
✅ Responsive design  

The dashboard provides complete visibility into the bot's monitoring and decision-making without executing any trades.

---

**Status**: Ready for observation and testing  
**Command**: `npm start` then visit `http://localhost:4445`  
**Test**: Open dashboard, wait for data to load, click observers to see details
