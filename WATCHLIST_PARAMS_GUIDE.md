# 📊 Watchlist Parameters Management Guide

**How to Update Symbol Parameters from the Client**

---

## Overview

You can now **update trading parameters for each symbol directly from the React client** without needing to access the database or edit configuration files.

The four parameters per symbol are:

| Parameter | What it Does |
|-----------|--------------|
| **upCond2** | Trigger for UP strategy buy (higher = buys less frequently) |
| **upSell** | Take-profit target for UP strategy (higher = waits for more profit) |
| **downCond2** | Trigger for DOWN strategy buy (lower = buys more readily) |
| **downSell** | Take-profit target for DOWN strategy (higher = waits for more profit) |

---

## How to Update Parameters in the Client

### Step 1: Open the Dashboard
```
http://localhost:3000
```

### Step 2: Find the "Watchlist" Section
Scroll to the **📊 Watchlist** card. You'll see all symbols with their current parameters:

```
┌─────────────┐
│ BTCUSDT     │
├─────────────┤
│ Price: $50,000
│
│ upCond2: 1.0180
│ upSell: 1.0100
│ downCond2: 0.9700
│ downSell: 1.0090
└─────────────┘
```

### Step 3: Click "EDIT SYMBOL PARAMS"
This opens the edit mode where you can modify all parameters.

### Step 4: Update Values
```
BTCUSDT
├─ upCond2:   [1.0150]  ← Change from 1.0180 to 1.0150
├─ upSell:    [1.0100]  ← Keep or change
├─ downCond2: [0.9700]  ← Keep or change
└─ downSell:  [1.0090]  ← Keep or change
```

**What each change does:**
- ↓ **Decrease upCond2** (1.0180 → 1.0150) = Buys UP strategy more easily
- ↑ **Increase upSell** (1.0100 → 1.0150) = Waits for bigger profit before selling
- ↓ **Decrease downCond2** (0.9700 → 0.9650) = Buys DOWN strategy more easily
- ↑ **Increase downSell** (1.0090 → 1.0100) = Waits for bigger profit before selling

### Step 5: Click "SAVE PARAMS"
The parameters are saved to the database and **take effect on the next candle** (no restart needed for live mode).

---

## Example Workflows

### Scenario 1: BTCUSDT is Too Cautious, Want More Trades

**Current params:**
```
upCond2: 1.0180    (needs to go up 1.8% to buy UP)
upSell: 1.0100     (sells when up 1.0%)
```

**Make it more aggressive:**
```
upCond2: 1.0150    (only needs 1.5% → easier to trigger)
upSell: 1.0080     (sells faster → more trades)
```

✅ **Result:** More UP trades, smaller profits per trade

---

### Scenario 2: ETHUSDT is Too Risky, Want Bigger Profits

**Current params:**
```
upCond2: 1.0120
upSell: 1.0090     (too small profit)
```

**Make it more conservative:**
```
upCond2: 1.0150    (harder to trigger buy)
upSell: 1.0120     (bigger profit before sell)
```

✅ **Result:** Fewer UP trades, bigger profits per trade

---

### Scenario 3: Testing Parameter Changes

1. **Edit in client** → Save
2. **Monitor the dashboard** for the next few candles
3. **Check results** in the "Trade History" section
4. **Adjust again** if needed

This is **live tuning** without restarting the bot!

---

## API Details (For Reference)

### GET /api/watchlist
Get current watchlist with all parameters:

```bash
curl http://localhost:3131/api/watchlist
```

**Response:**
```json
[
  {
    "symbol": "BTCUSDT",
    "params": {
      "upCond2": 1.018,
      "upSell": 1.010,
      "downCond2": 0.97,
      "downSell": 1.009
    },
    "lastPrice": 50000.00,
    "active": true
  }
]
```

### PATCH /api/watchlist/:symbol/params
Update parameters for a specific symbol:

```bash
curl -X PATCH http://localhost:3131/api/watchlist/BTCUSDT/params \
  -H "Content-Type: application/json" \
  -d '{
    "upCond2": 1.015,
    "upSell": 1.010,
    "downCond2": 0.97,
    "downSell": 1.009
  }'
```

---

## Best Practices

### 1. **Test in Simulator First**
```bash
npm run simulate
```
Try parameters there before applying to live.

### 2. **Change One Parameter at a Time**
Don't change all 4 parameters simultaneously.

### 3. **Small Increments**
- `upCond2: 1.0180 → 1.0150` (0.3% change)
- Not huge jumps like `1.0180 → 1.0000`

### 4. **Monitor the Dashboard**
After saving, watch the next few trades to see if parameters work better.

### 5. **Keep a Backup**
Note the current parameters before changing them.

---

## Summary

| Method | Ease | Speed | Requires Access |
|--------|------|-------|-----------------|
| **Client UI (NEW)** ✨ | ✅✅✅ | Real-time | 🌐 Browser only |
| DB Direct | ✅✅ | Real-time | 🔐 SSH + DB |
| Constants File | ✅ | After restart | 💻 Code edit |

---

**Go optimize your trading parameters! 🚀**
