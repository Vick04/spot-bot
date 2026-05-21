// ─────────────────────────────────────────────
// src/config/constants.ts
// ─────────────────────────────────────────────

// ── Multi-pair symbols ────────────────────────────────────────────────────
export const MULTI_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "XRPUSDT",
] as const;

export type MultiSymbol = typeof MULTI_SYMBOLS[number];

// ── Binance API ───────────────────────────────────────────────────────────
export const BINANCE_BASE_URL = "https://api.binance.com";
export const BINANCE_LIMIT    = 1000;
export const FETCH_DELAY_MS   = 250;

export type Timeframe = "1s" | "1m" | "15m" | "1h";

// ── Indicator parameters ──────────────────────────────────────────────────
export const MA_FAST_PERIOD    = 20;
export const MA_SLOW_PERIOD    = 99;
export const BB_PERIOD         = 20;
export const BB_MULT           = 1;
export const TRIX_PERIOD       = 19;
export const ST_ATR_PERIOD     = 10;
export const ST_FACTOR         = 7;
export const VOLUME_AVG_PERIOD = 20;

// ── Per-symbol trading parameters ────────────────────────────────────────
// Edit these values and re-run npm run simulate:multi to calibrate.
//
// downCond2: close < ma99 * downCond2  (cond2 for down strategy)
// upCond2:   close > ma99 * upCond2   (cond2 for up strategy)
// downSell:  close >= buyPrice * downSell  (take profit for down)
// upSell:    close >= buyPrice * upSell    (take profit for up)

export interface SymbolParams {
  downCond2: number;
  upCond2:   number;
  downSell:  number;
  upSell:    number;
}

export const DEFAULT_SYMBOL_PARAMS: SymbolParams = {
  downCond2: 0.980,
  upCond2:   1.012,
  downSell:  1.008,
  upSell:    1.010,
};

export const SYMBOL_PARAMS: Record<string, SymbolParams> = {
  BTCUSDT: { downCond2: 0.97,  upCond2: 1.018, downSell: 1.009, upSell: 1.010 },
  ETHUSDT: { downCond2: 0.964, upCond2: 1.012, downSell: 1.007, upSell: 1.009 },
  BNBUSDT: { downCond2: 0.966, upCond2: 1.014, downSell: 1.007, upSell: 1.008 },
  SOLUSDT: { downCond2: 0.97,  upCond2: 1.020, downSell: 1.008, upSell: 1.008 },
  XRPUSDT: { downCond2: 0.964, upCond2: 1.030, downSell: 1.006, upSell: 1.007 },
  ADAUSDT: { downCond2: 0.953, upCond2: 1.027, downSell: 1.005, upSell: 1.006 },
};

export function getSymbolParams(symbol: string): SymbolParams {
  return SYMBOL_PARAMS[symbol] ?? DEFAULT_SYMBOL_PARAMS;
}

// ── Fees ──────────────────────────────────────────────────────────────────
// 0.00075 = 0.075% (Binance BNB discount tier)
// 0.001   = 0.1%   (Binance standard tier)
export const FEE_RATE = 0.00075;

// ── Simulator / Manager ───────────────────────────────────────────────────
export const INITIAL_BALANCE_USDT = 10_000;

// ── Daily limits ──────────────────────────────────────────────────────────
// Bot stops opening new orders for the rest of the day if either:
//   - cumulative P&L% of the day exceeds DAILY_MAX_PNL_PCT, OR
//   - number of trades executed today reaches DAILY_MAX_TRADES
// Resets at midnight GMT-3.
export const DAILY_MAX_PNL_PCT = 10;
export const DAILY_MAX_TRADES  = 2;

// ── Time constants ────────────────────────────────────────────────────────
export const CANDLE_INTERVAL_MS = 60_000;       // 1 minute candles (60 seconds)
export const WARMUP_CANDLES = 500;              // Initial candles to load before trading
export const BUFFER_MAX = 600;                  // Rolling window size for indicator calculations
export const SIGNAL_TTL_MS = 60_000;            // Signal lifetime = 1 candle interval

// ── Timezone ──────────────────────────────────────────────────────────────
// GMT-3 offset for daily limits reset and reporting
export const GMT3_OFFSET_MS = -3 * 60 * 60 * 1000;  // -10,800,000 ms

// ── Buy/Sell Strategy ─────────────────────────────────────────────────────
export const UP_MAX_STREAK = 1;                 // Max consecutive up candles to trigger buy
