# SPOT-BOT Version History

## v1.2.0 - STABLE (Hard Reset Point) ⭐

**Date:** June 3, 2026
**Commit:** `f45cffb`
**Git Tag:** `v1.2.0`

### Status
✅ **STABLE - FULLY FUNCTIONAL**

This is the current production-ready version and serves as the **official hard reset checkpoint** for the project.

### Key Features
- ✅ Dashboard with Top 30 Gainers display
- ✅ Multi-timeframe gainer calculation (5m, 15m, 30m, 1h)
- ✅ Mini charts with technical indicators (MA20, MA99, Bollinger Bands)
- ✅ Sequential state machine for symbol selection
- ✅ Real-time WebSocket updates
- ✅ Binance integration for price data

### Selection Conditions (Sequential State Machine)

All conditions must be met in order. Each condition requires the previous one to be true:

1. **Initialize** - Observer initialized (`_initialized = true`)
2. **Buffer Full** - 99 candles loaded (`buffer.length === 99`)
3. **SUBIDA** - 5m gain > 1.0% (`gainer5m > 1.0`)
4. **PISO** - BBUpper < MA99 (`bbUpper < ma99`)
5. **COMPRA** - BBUpper < Price (`bbUpper < currentPrice`)
6. **INVALIDACIÓN** - Permanent disqualification if `Price > MA99 × 1.015`

**Reset Condition:** All steps reset when `Price < MA99`

### Top 30 Filtering Logic

- Symbols shown in Top 30 are those at the **highest sequential step** reached
- If max step is 3 (SUBIDA): Only symbols with step 3 met are shown
- If max step is 4 (PISO): Only symbols with step 4 met are shown
- If max step is 5 (COMPRA): Only symbols with step 5 met are shown
- Manager selects from available symbols at max step

### Important Files

- **Backend Logic:** `src/CryptoObserver.js` (_updateSelectionState method)
- **Top 30 Algorithm:** `src/GainersManager.js` (getTop1hGainers method)
- **Frontend Display:** `public/app.js` (renderGainers method)
- **Configuration:** `src/config.js`

### To Reset to v1.2.0

```bash
git checkout v1.2.0
```

Or hard reset entire project:

```bash
git reset --hard v1.2.0
```

---

## Version Changes

### What's New in v1.2.0
- ✅ Removed BUY DOWN strategy (kept BUY UP only)
- ✅ Refactored condition system from independent checks to sequential state machine
- ✅ Swapped conditions 3 and 4 for optimal filtering progression
- ✅ Top 30 now shows only symbols at highest sequential step
- ✅ Enhanced UI with step-by-step progress visualization

### Known Issues
None - this version is production-ready.

### Next Steps (Future Versions)
- Add automated trading execution
- Implement stop-loss and take-profit logic
- Add performance analytics and backtesting
- Optimize filtering thresholds
