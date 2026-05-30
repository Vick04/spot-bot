# OrderObserver Architecture

## Overview

The OrderObserver is a lightweight observer designed specifically for monitoring active trading positions. It provides real-time price tracking and sell condition evaluation without the overhead of maintaining candle buffers or calculating technical indicators.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    SPOT-BOT Trading Flow                    │
└─────────────────────────────────────────────────────────────┘

1️⃣ SIGNAL PHASE (1m candles - CryptoObserver)
   ─────────────────────────────────────────
   Binance WebSocket
        │
        ├─► kline_1m streams
        │       │
        │       ▼
        │   BinanceWebSocket emits "candle"
        │       │
        │       ▼
        │   GainersManager.updateCandle()
        │       │
        │       ├─► CryptoObserver (1m buffer)
        │       │       ├─ MA20, MA99
        │       │       ├─ Sequential state machine
        │       │       └─ canBuyUP, canBuyDOWN detection
        │       │
        │       ▼
        └─► Check top 30 gainers for BUY signals


2️⃣ BUY EXECUTION
   ─────────────
   Trading Signal (BUY-UP or BUY-DOWN)
        │
        ├─► Create OrderObserver
        │   └─ buyPrice, quantity, sellTarget
        │
        ├─► Subscribe to 1-second candles
        │   └─ binanceWS.subscribe1s(symbol)
        │
        └─► Broadcast to WebSocket clients


3️⃣ POSITION MONITORING PHASE (1s candles - OrderObserver)
   ────────────────────────────────────────────────────────
   Binance WebSocket
        │
        ├─► kline_1s streams (ONLY for active order symbol)
        │       │
        │       ▼
        │   BinanceWebSocket emits "candle1s"
        │       │
        │       ▼
        │   GainersManager.monitorActivePosition()
        │       │
        │       ├─► OrderObserver (NO buffer)
        │       │       ├─ currentPrice only
        │       │       └─ checkSellCondition()
        │       │
        │       ▼
        └─► Sell condition met?
                │
                ├─► YES: Execute SELL
                │        └─ OrderObserver.executeSell()
                │           └─ Calculate profit
                │           └─ Unsubscribe 1s candles
                │           └─ Delete OrderObserver
                │
                └─► NO: Continue monitoring
```

## Key Components

### 1. OrderObserver (`src/OrderObserver.js`)

**Purpose**: Monitor a single active trading position with minimal overhead.

**Key Features**:
- No candle buffer (unlike CryptoObserver)
- No technical indicators (MA20, MA99, Bollinger Bands)
- Stateless price tracking
- Single responsibility: sell condition evaluation

**Methods**:
```javascript
// Update with new 1-second candle
updateWithCandle(candle) { }

// Check if sell target reached
checkSellCondition() { return boolean }

// Get real-time P&L info
getPnLInfo() { 
  return { pnlValue, pnlPercent, timeInTrade, progressPercent }
}

// Execute sell when condition met
executeSell() { 
  return { symbol, sellPrice, profit, profitPercent, ... }
}

// Get state for debugging
getState() { return {...} }
```

**Lifecycle**:
```
Order Opened
    │
    ▼
Create OrderObserver
    │
    ▼
Monitor 1s candles ◄──── Real-time updates
    │
    ├─ Price < sellTarget → Continue
    │
    └─ Price >= sellTarget → Execute SELL
         │
         ▼
    Delete OrderObserver (auto cleanup)
         │
         ▼
    Order Closed
```

### 2. BinanceWebSocket Updates

**New Methods**:
```javascript
// Subscribe to 1-second candles dynamically
subscribe1s(symbol)

// Unsubscribe from 1-second candles
unsubscribe1s(symbol)
```

**Event Streams**:
- `candle` - 1-minute candles (for signal generation)
- `candle1s` - 1-second candles (for position monitoring)

**Dynamic Subscription**:
```javascript
// When BUY signal occurs:
binanceWS.subscribe1s('BTCUSDT')  // Start receiving 1s updates

// When SELL executes:
binanceWS.unsubscribe1s('BTCUSDT')  // Stop receiving 1s updates
```

### 3. GainersManager Changes

**Position Monitoring**:
```javascript
// Called from server.js with 1s candles
monitorActivePosition(symbol, candle1s) {
  const orderObserver = this.tradingState.activeCandleObserver
  orderObserver.updateWithCandle({ close: candle1s.close })
  
  if (orderObserver.checkSellCondition()) {
    this._executeSellOrder(orderObserver)
  }
}
```

**Order Lifecycle**:
```javascript
// BUY: Create OrderObserver
const orderObserver = new OrderObserver(symbol, buyPrice, quantity)
this.tradingState.activeCandleObserver = orderObserver

// SELL: Clean up OrderObserver
this.tradingState.activeCandleObserver = null  // Auto-deleted
```

### 4. server.js Orchestration

**Event Handling**:
```javascript
// When BUY signal detected:
gainersManager.on('trading-signal', (signal) => {
  binanceWS.subscribe1s(signal.symbol)  // Enable 1s monitoring
})

// When SELL executed:
gainersManager.on('order-closed', (order) => {
  binanceWS.unsubscribe1s(order.orderInfo.symbol)  // Disable 1s monitoring
})

// Real-time position updates via 1s candles:
binanceWS.on('candle1s', (candle) => {
  if (activeOrder && activeOrder.symbol === candle.symbol) {
    gainersManager.monitorActivePosition(candle.symbol, candle)
    // Broadcast position update to clients
  }
})
```

## Memory & Performance Benefits

### Before (CandleObserver approach):
```
During Active Order:
├─ CryptoObserver (for the symbol)
│  ├─ Buffer: 60 candles (1m data)
│  ├─ MA20, MA99 calculations
│  ├─ Bollinger Bands calculations
│  └─ State machine tracking
│
└─ CandleObserver (for the position)
   ├─ Additional price tracking
   └─ Redundant calculations
```

### After (OrderObserver approach):
```
During Active Order:
├─ CryptoObserver (still exists, for other symbols)
│  └─ Minimal active interaction
│
└─ OrderObserver (lightweight, focused)
   ├─ Only current price
   └─ Single condition check
```

**Memory Savings**:
- No buffer accumulation
- No expensive indicator calculations per candle
- OrderObserver deleted immediately after sell

**Latency Improvement**:
- 1-second updates vs 1-minute updates
- Faster sell detection (up to 60x per minute vs 1x per minute)
- Real-time position progress to UI

## Data Flow Example

```
Scenario: BUY-UP signal detected for BTCUSDT

T=0 [1m candle received]
├─ CryptoObserver updates
├─ Sequential state machine completes
├─ canBuyUP = true → Trigger BUY signal
├─ emit('trading-signal', { symbol: 'BTCUSDT', ... })
│
T=0+ [Server receives signal]
├─ Create OrderObserver('BTCUSDT', 65000, 0.1)
├─ Subscribe: binanceWS.subscribe1s('BTCUSDT')
├─ Broadcast: { type: 'trading-signal', ... }
│
T=1-2s [1s candles start flowing]
├─ BTCUSDT@kline_1s received: close=65001
├─ monitorActivePosition('BTCUSDT', candle1s)
├─ OrderObserver.updateWithCandle({ close: 65001 })
├─ checkSellCondition() → currentPrice(65001) >= sellTarget(65323.25)?
├─ NO → Continue
├─ Broadcast: { type: 'order-progress', pnlPercent: 0.002%, ... }
│
... more 1s candles ...
│
T=3.5s [Target reached]
├─ BTCUSDT@kline_1s received: close=65323.30
├─ monitorActivePosition('BTCUSDT', candle1s)
├─ OrderObserver.updateWithCandle({ close: 65323.30 })
├─ checkSellCondition() → 65323.30 >= 65323.25?
├─ YES → Execute SELL
├─ OrderObserver.executeSell() → profit=$32.32
├─ emit('order-closed', { symbol: 'BTCUSDT', profit: 32.32, ... })
│
T=3.5+ [Server receives sell event]
├─ Unsubscribe: binanceWS.unsubscribe1s('BTCUSDT')
├─ OrderObserver deleted automatically
├─ Broadcast: { type: 'order-closed', ... }

Total Position Duration: ~3.5 seconds
Monitoring Frequency: Every 1 second
Memory Freed: OrderObserver + subscription
```

## Configuration

No additional configuration required. The system automatically:
- Subscribes to 1s candles when a BUY order executes
- Unsubscribes from 1s candles when a SELL order completes
- Deletes OrderObserver from memory after each trade

## Debugging

Check active position state:
```javascript
const position = gainersManager.tradingState.activeCandleObserver
console.log(position.getState())
// {
//   symbol: 'BTCUSDT',
//   buyPrice: 65000,
//   currentPrice: 65150,
//   quantity: 0.1,
//   sellTarget: 65323.25,
//   pnlValue: 15,
//   pnlPercent: 0.023%,
//   timeInTrade: 2 (minutes),
//   progressPercent: 34.5%
// }
```

Monitor 1s subscription:
```javascript
console.log('Subscribed to 1s:', binanceWS.subscribedSymbols1s)
// Set { 'BTCUSDT' } while order active, {} when closed
```

## Future Enhancements

Potential improvements to OrderObserver:
1. **Stop-Loss Support**: Add checkStopLoss() for risk management
2. **Trailing Stop**: Dynamic sell target based on highest price
3. **Partial Closes**: Support multiple SELL events
4. **Event Logging**: Built-in trade journal
5. **Performance Metrics**: Latency tracking per position
