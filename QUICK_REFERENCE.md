# SPOT-BOT Dashboard - Quick Reference Card

## 🚀 One-Command Start

```bash
npm start
# Then open: http://localhost:4445
```

---

## 📊 Dashboard Sections

| Section | What It Shows | Update Frequency |
|---------|---------------|------------------|
| **Stats Panel** | Counts by state (WAITING/BOUGHT/SOLD) | Every candle |
| **Observer Table** | 10 symbols with full condition state | Every candle |
| **Event Log** | Timestamped system events | Real-time |
| **Details Panel** | Full observer state (optional) | On click |

---

## 🎯 What Each Column Means

```
Symbol   : Trading pair (e.g., BTCUSDT)
Estado   : Current state (WAITING/BOUGHT/SOLD)
Precio   : Current market price
Gainer1h : 1-hour price change %
MA20     : 20-period moving average
MA99     : 99-period moving average
DOWN     : ✓ if oversold condition met
UP       : ✓ if overbought condition met
Sell     : ✓ if take-profit target reached
P&L %    : Current profit/loss %
Streak   : UP strategy consecutive count
Tiempo   : Time in trade (hh:mm:ss)
```

---

## 🟢 Estado Colors

- 🟢 **GREEN** = BOUGHT (position open)
- ⚫ **GRAY** = WAITING (no position)
- 🔴 **PINK** = SOLD (just closed)

---

## 📈 Trading Conditions

### ✓ canBuyDOWN
Price is down 3% below MA99 AND downtrend confirmed
→ Buy oversold, target +0.8% profit

### ✓ canBuyUP
Price is up 1.5% above MA99 AND uptrend confirmed AND max 1 consecutive
→ Buy momentum, target +7.0% profit

### ✓ shouldSell
Open position hit take-profit target
→ Close position and realize profit

---

## 🔄 Real-Time Updates

```
Every Minute:
  ↓ New candle from Binance
  ↓ GainersManager updates top 10
  ↓ OrderObserver evaluates conditions
  ↓ Dashboard shows new state (WebSocket)
```

---

## 🛠️ REST API Endpoints

```bash
# Get all 10 observers
curl http://localhost:4445/api/trading/observers

# Get specific observer
curl http://localhost:4445/api/trading/observer/BTCUSDT

# Get trading manager status
curl http://localhost:4445/api/trading/status

# Get all gainers
curl http://localhost:4445/api/gainers

# Health check
curl http://localhost:4445/api/health
```

---

## 📝 Configuration

Edit `src/config.js`:

```javascript
TRADING_CONFIG: {
  downCond2: 0.970,  // Price 3% below MA99 for DOWN
  upCond2: 1.015,    // Price 1.5% above MA99 for UP
  downSell: 1.008,   // Sell at +0.8% profit for DOWN
  upSell: 1.070,     // Sell at +7.0% profit for UP
}
```

Then restart: `npm start`

---

## ⚠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| Shows "Disconnected" | Reload page (auto-reconnects) |
| No observers visible | Wait 45 seconds for init, reload page |
| No signals showing | Normal! Conditions are specific, wait for volatility |
| Server won't start | Check port 4445 available: `lsof -i :4445` |
| Event log empty | Connection status should be green; check console (F12) |

---

## 📱 Mobile Support

Dashboard works on phones! 
- Tap rows to see details
- Landscape mode for full table
- All features available

---

## 🔐 Important Notes

- ⚠️ **Observation Mode Only**: No trades execute
- ⚠️ **Local Only**: Not internet-accessible
- ⚠️ **No Persistence**: Resets on restart
- ⚠️ **Top 10 Dynamic**: Observer list changes every 10 minutes

---

## 📊 Sample Interpretation

```
BTCUSDT | WAITING | 42500 | -0.2% | MA20 | MA99 | ✓ | - | - | 0% | 0 | -

Interpretation:
  → Waiting for buy signal
  → Price is down slightly
  → Meets DOWN condition (oversold)
  → Bot would buy if trading enabled
  → Event log would show: "🟢 BUY: BTCUSDT DOWN @ 42500"
```

---

## 🎓 Learning Path

1. **Minute 1**: Start bot, open dashboard
2. **Minutes 2-3**: Explore table, click rows for details
3. **Minutes 4-10**: Watch for condition changes
4. **Minutes 10-20**: Wait for trading signals
5. **Minutes 20+**: Understand why signals occur (price action + indicators)

---

## 📞 Common Questions

**Q: Where are my trades?**
A: Observation mode - no trades execute. Dashboard shows what WOULD happen.

**Q: When will I see signals?**
A: Conditions are specific. During normal markets: 1-3 signals/hour. Highly volatile: more.

**Q: How do I enable real trading?**
A: (Future) Uncomment `_processTradeDecisions()` in TradingManager.js (requires explicit approval).

**Q: Can I change the top 10?**
A: It's automatic based on 1-hour gains. Cannot manually select symbols.

**Q: How much does it cost?**
A: Free! Uses Binance public API (rate-limited). No trading = no fees.

---

## 📁 File Reference

```
public/
  ├── index.html      ← Loaded when you visit http://localhost:4445
  ├── style.css       ← Dark theme styling
  └── app.js          ← Real-time WebSocket client

src/
  ├── server.js       ← Broadcasts observer updates
  ├── TradingManager.js ← Emits observer-update events
  ├── OrderObserver.js ← Tracks single symbol
  ├── GainersManager.js ← Manages top 10
  └── ...

docs/
  ├── DASHBOARD_GUIDE.md ← Complete guide
  ├── DASHBOARD_STARTUP.md ← Quick start
  ├── QUICK_REFERENCE.md ← This file
  └── TEST_GUIDE.md ← Testing guide
```

---

## ⏱️ Timing Reference

| Activity | Duration |
|----------|----------|
| Server startup | 30-45 sec |
| Dashboard load | <1 sec |
| First candle update | 1-2 min |
| First signal | Varies (0-30 min) |
| Position hold time | 1-30 min |
| Daily reset | Midnight UTC |
| Top 10 recalculation | Every 10 min |

---

## 🎮 Controls

- **Auto-scroll**: Keeps table at bottom
- **Show Details**: Opens detailed observer panel
- **Click Row**: Selects observer for details
- **Scroll Table**: See historical rows
- **Reload Page**: Reconnect if disconnected
- **F12**: Open browser console for debugging

---

## ✅ Everything Ready

```
✓ Backend: Running on port 4445
✓ Frontend: Dashboard served at http://localhost:4445
✓ WebSocket: Real-time updates every candle
✓ Data: All 10 observers visible with full state
✓ Docs: Complete guides available
✓ Testing: Manual and automated tests ready
✓ Observation: Safety mode - no trades executed
```

**Status**: READY TO USE NOW 🚀

---

**Last Updated**: 2026-05-26  
**Version**: 1.0.0 Complete  
**Next Phase**: Live trading (when ready)
