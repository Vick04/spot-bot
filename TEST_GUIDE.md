# Testing Guide - TradingManager & OrderObservers

**Date**: 2026-05-22  
**Status**: Ready for Testing ✅

---

## Quick Start

### Terminal 1: Start the bot
```bash
npm start
```

**Wait for:** `[Server] Listening on port 4445`

### Terminal 2: Run automated tests
```bash
npm test
```

---

## What Gets Tested

### Test 1: Server Health
```
✓ Server responds on /api/health
✓ Server status is 'ok'
```
**Verifies**: API is running

### Test 2: GainersManager
```
✓ GainersManager is initialized
✓ Tracking 500 symbols
✓ X/500 observers ready
```
**Verifies**: Data collection from Binance is working

### Test 3: TradingManager
```
✓ TradingManager status endpoint works
✓ Exactly 10 observers active
✓ All 10 observers in state
```
**Verifies**: Manager controls top 10 symbols

### Test 4: OrderObservers Data
```
✓ 10 observers returned
✓ Observer has symbol (e.g., BTCUSDT)
✓ Observer estado is valid (WAITING/BOUGHT/SOLD)
✓ Observer has currentPrice
✓ Observer has gainer1h
```
**Verifies**: Observers receive market data

### Test 5: Technical Indicators
```
✓ MA20 calculated
✓ MA99 calculated
✓ Bollinger Upper calculated
✓ Bollinger Lower calculated
✓ Bollinger bands valid (Lower < Upper)
```
**Verifies**: Technical analysis calculations work

### Test 6: Trading Conditions
```
✓ Observers evaluate canBuyDOWN condition
✓ Observers evaluate canBuyUP condition
✓ Observers evaluate shouldSell condition
ℹ X observers have active buy signals
```
**Verifies**: Buy/sell conditions are evaluated

### Test 7: State Consistency
```
✓ WAITING → no position open
✓ BOUGHT → position open
✓ buyPrice is valid
✓ buyStrategy is valid
✓ upStreak is 0 or 1
```
**Verifies**: State machine is correct

### Test 8: Daily Limits
```
✓ Daily trades tracking exists
✓ Daily PnL tracking exists
✓ No symbol exceeds 2 daily trades
✓ No symbol exceeds 10% daily PnL
ℹ Total trades today: X
```
**Verifies**: Trading limits are enforced

### Test 9: P&L Calculations
```
✓ P&L calculation correct (±X.XX%)
```
**Verifies**: Profit/loss math is accurate

### Test 10: Buffer Management
```
✓ All 10 observers have full buffers
```
**Verifies**: Historical data is loaded (99 candles per symbol)

---

## Expected Output

**Success (all tests pass):**
```
╔════════════════════════════════════════╗
║  SPOT-BOT - TradingManager Test Suite  ║
╚════════════════════════════════════════╝

Test 1: Server Health
  ✓ Server responds on /api/health
  ✓ Server status is 'ok'

Test 2: GainersManager
  ✓ GainersManager status endpoint works
  ✓ GainersManager is initialized
  ✓ GainersManager tracking 500 symbols
  ✓ 10/500 observers ready

... (more tests)

╔════════════════════════════════════════╗
║  Test Results                          ║
╚════════════════════════════════════════╝
  Passed: 50
  Failed: 0
  Total:  50
  Success Rate: 100.0%

✓ All tests passed!
```

---

## Troubleshooting

### Error: "Cannot connect to server"
```
Make sure the bot is running:
  Terminal 1: npm start
  Wait for: [Server] Listening on port 4445
```

### Error: "GainersManager not initialized"
```
Bot is starting up. Wait 1-2 minutes for:
  [GainersManager] ✅ Initialized
  [Server] ✅ TradingManager initialized
```

### Error: "Observers not ready"
```
Observers are still downloading 99 candles per symbol.
Wait until:
  [GainersManager] Ready. Tracking X symbols
And:
  All 10 observers have full buffers
```

### Error: "Some tests failed"
```
Check the specific failed test:
  ✗ [specific assertion]
  
Then check the logs in Terminal 1 for errors.
```

---

## Manual Testing (Alternative to npm test)

### Check if bot is running
```bash
curl http://localhost:4445/api/health
```
**Expected**: `{"status":"ok"}`

### See all 10 observers
```bash
curl http://localhost:4445/api/trading/observers | jq '.observers | length'
```
**Expected**: `10`

### See specific observer
```bash
curl http://localhost:4445/api/trading/observer/BTCUSDT | jq '.'
```
**Expected**: Full observer state with ma20, ma99, indicators

### Monitor trading events (WebSocket)
```bash
node -e "
const ws = new (require('ws'))('ws://localhost:4445');
ws.on('message', m => {
  const msg = JSON.parse(m);
  if(msg.type === 'trading-order') {
    console.log(\`[ACTION] \${msg.action}: \${msg.data.symbol}\`);
  }
});
"
```

---

## Test Execution Time

| Scenario | Time |
|----------|------|
| All tests | ~2-3 seconds |
| First init (waiting for 325s rate limit) | ~6 minutes |
| Subsequent tests (using cache) | < 1 second boot |

---

## What Happens During a Trade

1. **Condition Met** (e.g., canBuyDOWN = true)
   - Check daily limits (max 2 trades, max 10% PnL)
   - Execute: `observer.executeBuy("DOWN")`
   - Event emitted: `trading-order (buy)`

2. **Price Movement**
   - Observer updates `pnlPercent` every candle
   - Check: `shouldSell` (at take-profit target)

3. **Take Profit Hit**
   - Execute: `observer.executeSell()`
   - Calculate P&L
   - Event emitted: `trading-order (sell)`
   - Reset for next trade

---

## Performance Metrics

After tests pass, you should see:

```
Active Observers: 10
  ├─ WAITING: ~7-8 (no open position)
  ├─ BOUGHT: ~1-3 (open positions)
  └─ SOLD: varies (recently closed)

Indicators:
  ├─ MA20: calculated for all 10
  ├─ MA99: calculated for all 10
  └─ Bollinger Bands: calculated for all 10

Daily Stats:
  ├─ Trades: 0-2 per symbol (max)
  └─ PnL: 0-10% per symbol (max)
```

---

## CI/CD Integration

To run tests automatically on git push:

```bash
# Create .git/hooks/pre-push
#!/bin/bash
npm test || exit 1
```

Then tests run before each push.

---

## Monitoring Long-Term

```bash
# Run test every 5 minutes
watch -n 300 'npm test'

# Or with loop command (if using /loop)
/loop 5m npm test
```

This gives continuous verification that the bot is operating correctly.

---

**Status**: ✅ Test suite ready  
**Command**: `npm test`  
**Expected Result**: 100% pass rate
