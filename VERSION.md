# SPOT-BOT Version History

## v1.3.0 - IN DEVELOPMENT 🚀
**Date:** June 6, 2026  
**Status:** Testing & Optimization  
**Branch:** main

### Major Architectural Changes
From sequential 6-step state machine → **4-condition buy signal engine** with Safety Brake circuit breaker mechanism.

---

## Core Systems

### 1. Sequential Buy Signal Engine (4 Conditions)

The v1.3.0 system uses a **sequential 4-condition machine** that must be satisfied in order:

```
CONDITION 1: Safety Brake (BRAKE MECHANISM)
└─ TRUE when: MA99 Slope < -0.02 AND Accel < 0
   → Effect: Activates circuit breaker → resets all conditions to FALSE
   → Purpose: Prevents buying during strong downtrends

CONDITION 2: MA99 Decelerating (Can Revert)
└─ TRUE when: MA99 Slope < 0 AND Accel > 0.008
   → If Condition 1 becomes TRUE → resets to FALSE
   → Purpose: Confirms downtrend is slowing (deceleration starting)

CONDITION 3: Two Sub-Conditions (Both Required)
├─ 3A: MA20 > MA99
│   → Simple price cross signal
└─ 3B: MA99 Momentum (STRICT THRESHOLD)
    └─ TRUE when: MA99 Slope >= 0.05 AND Accel >= -0.03
       → Updated in v1.3.0: Slope raised from 0.02 → 0.05 (5% per 2 candles)
       → Prevents false positives on semi-flat MA99
       → Purpose: Confirms momentum reversal

CONDITION 4: MA20 Strong Uptrend (Can Revert)
└─ TRUE when: MA20 Slope > 0.18 AND Accel > -0.08
   → Purpose: Confirms strong momentum in short-term trend

FINAL: readyToBuy (STICKY with Circuit Breaker)
└─ TRUE when: Cond1=FALSE AND Cond2=TRUE AND Cond3=TRUE AND Cond4=TRUE
   → STICKY: Once TRUE, remains TRUE regardless of other condition changes
   → CIRCUIT BREAKER: If Cond1 becomes TRUE → readyToBuy resets to FALSE
   → Tracks: Timestamp (exact moment of activation) + Elapsed minutes
```

---

### 2. 1-Second OrderObserver (Lightweight Position Tracking)

When `readyToBuy == TRUE` → **BUY order executed** → OrderObserver activates

#### OrderObserver Features:
- **No buffer**: Tracks only current 1-second candles
- **Purpose**: Monitor active position for SELL condition
- **Sell Target**: 0.5% profit (buyPrice × 1.005)
- **Fee Structure**: 0.1% (0.001) on both BUY and SELL
- **Monitoring**: Real-time P&L tracking, time-in-trade, gap-to-target

#### Buy Order Flow:
```
1. Symbol reaches readyToBuy = TRUE
2. BUY PRICE LOCKED (current price)
3. USDT INVESTED: All available balance
4. Fee applied: btcAfterFee = (USDT / price) × (1 - 0.001)
5. OrderObserver created with:
   - buyPrice, quantity (after fee), feeOnBuy, investedAmount
6. Position tracking begins: monitor every 1s candle
7. When currentPrice >= sellTarget → SELL executes
```

#### Sell Order Flow:
```
1. Sell condition triggered (price >= 0.5% above buy)
2. SELL VALUE: quantity × currentPrice
3. Fee applied: feeOnSell = sellValue × 0.001
4. NET USDT: sellValue - feeOnSell
5. PROFIT = (sellValueAfterFee) - investedUSDT
6. PROFIT % = (Profit / investedUSDT) × 100
7. Balance restored: newBalance = sellValueAfterFee
8. Trade recorded in completedOrders history
```

---

### 3. Top 30 Filtering Logic (v1.3.0 Enhanced)

The Top 30 is **grouped by progress level**. The system shows symbols at the **highest progress level only**:

```
PROGRESS LEVEL CALCULATION:
├─ Level 0: No conditions met
│  └─ Display: None (locked by Condition 1 or waiting for Condition 2)
├─ Level 1: Condition 1 released (brake off) - waiting for Condition 2
│  └─ Display: Symbols waiting for MA99 deceleration
├─ Level 2: Conditions 1,2 met - waiting for Condition 3
│  └─ Display: Symbols waiting for MA20 > MA99 + MA99 momentum
├─ Level 3: Conditions 1,2,3 met - waiting for Condition 4
│  └─ Display: Symbols waiting for MA20 strong uptrend
└─ Level 4: ALL CONDITIONS MET (readyToBuy = TRUE)
   └─ Display: Symbols READY TO BUY (execute immediately)

FILTERING ALGORITHM:
1. Check if any symbols at Level 4 (readyToBuy = TRUE)
   → YES: Show all Level 4 symbols, sorted by price (highest first)
   → NO: Move to Level 3
2. Check Level 3, Level 2, Level 1 in order
3. Return top N symbols from highest active level, sorted by price DESC
```

**Example**: If 3 symbols at Level 4 and 10 at Level 3:
- Display only the 3 Level 4 symbols (ready to buy)
- Level 3 symbols hidden until one reaches Level 4

---

### 4. Mini Charts Data (Per Symbol Card)

Each symbol card displays:

#### Price & Gains Section:
```
Symbol: BTCUSDT
Current Price: $42,150.50
1m Gain:  +0.15%   (last 1 minute)
5m Gain:  +0.82%   (last 5 minutes)
15m Gain: +2.34%   (last 15 minutes)
30m Gain: +4.67%   (last 30 minutes)
1h Gain:  +7.89%   (last 60 minutes)
```

#### Technical Indicators:
```
MA20:    $42,100.00  (20-candle moving average)
MA99:    $41,950.00  (99-candle moving average)
BBUpper: $42,500.00  (Bollinger Band upper)
BBLower: $41,500.00  (Bollinger Band lower)
```

#### Momentum Data:
```
MA99 Momentum:
  Slope: +0.035    (% change per 2 candles)
  Accel: +0.002    (acceleration of slope)
  Status: [Threshold Check: 0.035 >= 0.05? NO]

MA20 Momentum:
  Slope: +0.245    (% change per 2 candles)
  Accel: -0.010    (acceleration of slope)
  Status: [Threshold Check: 0.245 > 0.18? YES]
```

#### Buy Pressure (Volume Delta):
```
Buy Ratio:     67.5%  (current candle: buyVolume / totalVolume)
Avg Buy Ratio: 65.2%  (average of last 5 candles)
Buy Pressure:  HIGH   (is avgBuyRatio > 55%? YES)
```

#### Conditions Status:
```
Condition 1 (Safety Brake):    FALSE  ✅ (brake off - safe to proceed)
Condition 2 (MA99 Decel):      TRUE   ✅ (downtrend slowing)
Condition 3A (MA20 > MA99):    TRUE   ✅ (price cross)
Condition 3B (MA99 Momentum):  FALSE  ❌ (momentum not steep enough)
Condition 4 (MA20 Uptrend):    TRUE   ✅ (strong short-term trend)

Progress Level: 3/4
Status: Waiting for Condition 3B to activate
```

#### Ready-to-Buy Timing (When Active):
```
Ready Time:    14:32:45  (exact time activation occurred)
Elapsed:       5m        (5 minutes since readyToBuy = TRUE)
Status:        🟢 READY TO BUY
```

---

### 5. Fee Structure & Calculations

#### Fee Rate: 0.1% (0.001)

**Buy Order Example:**
```
USDT Invested:    $1000.00
Current Price:    $50.00
Gross BTC:        1000 / 50 = 20 BTC
Fee (0.1%):       20 × 0.001 = 0.02 BTC
Net BTC Received: 20 - 0.02 = 19.98 BTC
Fee in USDT:      0.02 × 50 = $1.00

Balance After Buy: $0.00 (all invested)
```

**Sell Order Example (with 0.5% profit):**
```
Net BTC Held:    19.98 BTC
Sell Target:     $50.00 × 1.005 = $50.25
Sell Price:      $50.25 (target reached)
Gross USDT:      19.98 × 50.25 = $1004.995
Fee (0.1%):      $1004.995 × 0.001 = $1.005
Net USDT:        $1004.995 - $1.005 = $1003.99

Invested:        $1000.00
Received:        $1003.99
Total Fees Paid: $1.00 (buy) + $1.005 (sell) = $2.005
Net Profit:      $3.99 (after all fees)
Profit %:        0.399%
```

---

### 6. Data Flow & WebSocket Broadcasting

#### Backend → Frontend (Real-time):

**Message Type: `gainers-update`**
```javascript
{
  type: "gainers-update",
  timestamp: "2026-06-06T14:32:45.123Z",
  gainers: [
    {
      symbol: "BTCUSDT",
      price: 42150.50,
      gainer1m: 0.15,
      gainer5m: 0.82,
      gainer15m: 2.34,
      gainer30m: 4.67,
      gainer1h: 7.89,
      ma20: 42100.00,
      ma99: 41950.00,
      bbUpper: 42500.00,
      bbLower: 41500.00,
      ma99Slope: 0.035,
      ma99Accel: 0.002,
      ma20Slope: 0.245,
      ma20Accel: -0.010,
      buyRatio: 67.5,
      avgBuyRatio: 65.2,
      isBuyingPressure: true,
      cond1_ma99SafetyBrake: false,
      cond2_ma99Decelerate: true,
      cond3_ma20AboveMa99: true,
      cond3_ma99Momentum: false,
      cond4_ma20Uptrend: true,
      readyToBuy: false,
      readyToBuyTime: null,
      readyToBuyMinutesElapsed: null,
      progress: 3
    }
  ]
}
```

**Message Type: `trading-order`** (When readyToBuy triggered)
```javascript
{
  type: "trading-order",
  action: "BUY",
  symbol: "BTCUSDT",
  buyPrice: 42150.50,
  quantity: 19.98,
  investedUSDT: 1000.00,
  feeOnBuy: 1.00,
  buyTime: "2026-06-06T14:32:50.456Z"
}
```

**Message Type: `order-progress`** (Every 1s candle while position open)
```javascript
{
  type: "order-progress",
  symbol: "BTCUSDT",
  currentPrice: 42175.00,
  pnlValue: 49.60,
  pnlPercent: 0.496,
  timeInTrade: 2,  // minutes
  gapToTarget: 50.25,
  progressPercent: 98.5
}
```

**Message Type: `order-closed`** (When sell condition met)
```javascript
{
  type: "order-closed",
  symbol: "BTCUSDT",
  buyPrice: 42150.50,
  sellPrice: 42225.00,
  quantity: 19.98,
  investedUSDT: 1000.00,
  sellValueAfterFee: 1003.99,
  feeOnBuy: 1.00,
  feeOnSell: 1.005,
  totalFees: 2.005,
  profit: 3.99,
  profitPercent: 0.399,
  newBalance: 1003.99,
  timeInTrade: 5  // minutes
}
```

---

## Database/Storage

### Trading State Tracking:
```javascript
tradingState: {
  balance: 1003.99,                    // Current available USDT
  activeCandleObserver: OrderObserver, // Active position (null if none)
  completedOrders: [
    {
      type: "BUY",
      timestamp: "2026-06-06T14:32:50Z",
      symbol: "BTCUSDT",
      signalType: "READY-TO-BUY",
      buyPrice: 42150.50,
      quantity: 19.98,
      investedUSDT: 1000.00,
      feeOnBuy: 1.00,
      status: "closed"
    },
    {
      type: "SELL",
      timestamp: "2026-06-06T14:37:50Z",
      symbol: "BTCUSDT",
      sellPrice: 42225.00,
      quantity: 19.98,
      grossUSDT: 1004.995,
      feeOnSell: 1.005,
      netUSDT: 1003.99,
      profit: 3.99,
      profitPercent: 0.399
    }
  ],
  stats: {
    totalTrades: 1,
    totalProfit: 3.99,
    totalProfitPercent: 0.399,
    winTrades: 1,
    lossTrades: 0,
    totalFees: 2.005,
    avgProfitPercent: 0.399
  }
}
```

---

## Key Improvements from v1.2.0

| Feature | v1.2.0 | v1.3.0 |
|---------|--------|--------|
| **Signal System** | 6-step sequential | 4-condition with brake |
| **MA99 Momentum** | Not implemented | Slope + accel detection |
| **MA20 Momentum** | Not implemented | Slope + accel detection |
| **Safety Mechanism** | Manual invalidation | Auto circuit breaker (Cond 1) |
| **Buy Signal** | Step 5 gate | readyToBuy sticky state |
| **Position Tracking** | N/A | 1s OrderObserver |
| **Sell Condition** | Manual | Automated (0.5% target) |
| **Fee Handling** | Simplified | Detailed buy/sell breakdown |
| **Ready-to-Buy Timing** | Not tracked | Timestamp + elapsed minutes |
| **Top 30 Display** | Single level | Multi-level grouped by progress |
| **Condition 3B Threshold** | slope >= 0.02 | slope >= 0.05 (stricter) |

---

## Important Files (v1.3.0)

| File | Purpose | Key Methods |
|------|---------|-------------|
| `src/CryptoObserver.js` | Per-symbol monitoring | `_updateSelectionState()`, `getConditions()`, momentum calculations |
| `src/OrderObserver.js` | Position management | `updateWithCandle()`, `checkSellCondition()`, `executeSell()` |
| `src/GainersManager.js` | Multi-symbol orchestration | `getTop1hGainers()`, order execution, trading state |
| `public/app.js` | Frontend dashboard | `updateGainers()`, `updateOrderProgress()`, `handleOrderClosed()` |
| `src/config.js` | Constants | Fee rates, buffer sizes, thresholds |

---

## Testing Checklist

- [ ] Condition 1 (Safety Brake) correctly resets all conditions
- [ ] readyToBuy sticky state persists through condition changes
- [ ] readyToBuy resets when Safety Brake activates
- [ ] Timestamp recorded correctly at activation
- [ ] Elapsed minutes calculated accurately
- [ ] Top 30 groups by progress level correctly
- [ ] OrderObserver monitors 1-second candles
- [ ] Sell condition triggers at 0.5% profit
- [ ] Fees applied correctly on buy and sell
- [ ] P&L calculations accurate
- [ ] WebSocket broadcasts all message types
- [ ] Frontend displays all condition states
- [ ] Trading state persisted across updates

---

## Known Issues & TODOs

- [ ] Implement partial position sizing (currently all-in)
- [ ] Add stop-loss mechanism
- [ ] Add take-profit levels (currently fixed 0.5%)
- [ ] Implement trailing stop
- [ ] Add performance dashboard with equity curve
- [ ] Add backtest mode with historical data
- [ ] Implement multiple simultaneous positions

---

## Deployment

### Docker:
```bash
docker build -t spot-bot:v1.3.0 .
docker run -p 4445:4445 --env-file .env spot-bot:v1.3.0
```

### DigitalOcean (via GitHub Actions CI/CD):
```bash
git push origin main  # Auto-deploys via workflow
```

---

## v1.2.0 - STABLE (Hard Reset Point) ⭐

**Date:** June 3, 2026  
**Commit:** `f45cffb`  
**Git Tag:** `v1.2.0`  
**Status:** ✅ STABLE - FULLY FUNCTIONAL  

This was the production-ready version with the original 6-step sequential state machine.

### To Reset to v1.2.0:
```bash
git checkout v1.2.0
# Or hard reset:
git reset --hard v1.2.0
```

---

## Version Timeline

| Version | Date | Status | Key Change |
|---------|------|--------|-----------|
| v1.0.0 | May 2026 | Archived | Initial release |
| v1.1.0 | May 2026 | Archived | Bug fixes & optimization |
| v1.2.0 | Jun 3 | Stable | 6-step sequential machine |
| v1.3.0 | Jun 6 | Testing | 4-condition with safety brake + 1s position tracking |
