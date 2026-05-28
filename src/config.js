// ─────────────────────────────────────────────
// src/config.js
// Configuration from environment variables
// ─────────────────────────────────────────────

module.exports = {
  // Server
  API_PORT: parseInt(process.env.API_PORT || "4444"),
  NODE_ENV: process.env.NODE_ENV || "development",

  // GainersManager
  GAINERS_SYMBOLS_LIMIT: parseInt(process.env.GAINERS_SYMBOLS_LIMIT || "0"), // 0 = all
  GAINERS_MIN_VOLUME: parseInt(process.env.GAINERS_MIN_VOLUME || "1000000"),
  GAINERS_BUFFER_SIZE: parseInt(process.env.GAINERS_BUFFER_SIZE || "99"), // 99 = full MA99 + 1h exact
  GAINER_1H_INDEX: 39, // Index in buffer for 1h ago (99-60=39)

  // OrderObserver - Trading Configuration (Global for all symbols)
  TRADING_CONFIG: {
    downCond2: parseFloat(process.env.TRADING_DOWN_COND2 || "0.970"),     // % bajo ma99 para activar DOWN
    upCond2: parseFloat(process.env.TRADING_UP_COND2 || "1.015"),         // % sobre ma99 para activar UP
    downSell: parseFloat(process.env.TRADING_DOWN_SELL || "1.008"),       // Take profit DOWN: +0.8%
    upSell: parseFloat(process.env.TRADING_UP_SELL || "1.070"),           // Take profit UP: +7.0%
  },

  // Trading Limits
  DAILY_MAX_TRADES_PER_SYMBOL: 2,   // Max trades per symbol per day
  DAILY_MAX_PNL_PCT: 10,             // Max PnL % per day, then stop
  UP_MAX_STREAK: 1,                  // Max consecutive UP trades

  // Helpers
  isDevelopment: () => module.exports.NODE_ENV === "development",
  isProduction: () => module.exports.NODE_ENV === "production",
};
