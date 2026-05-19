// ─────────────────────────────────────────────
// src/config/constants.ts
// Central configuration for Bot7
// ─────────────────────────────────────────────

export const SYMBOL  = "BTCUSDT";

// ── Multi-pair symbols ────────────────────────────────────────────────────
// Initial set for testing the multi-pair manager and observers.
// Ordered by typical 24h volume (descending).
export const MULTI_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "ADAUSDT",
] as const;

export type MultiSymbol = typeof MULTI_SYMBOLS[number];

export const GMT_OFFSET_MS = -3 * 60 * 60 * 1000;

export const START_DATE_GMT3 = new Date("2025-01-01T00:00:00-03:00");
export const END_DATE_GMT3   = new Date("2026-05-17T23:59:59-03:00");

export const START_TS = START_DATE_GMT3.getTime();
export const END_TS   = END_DATE_GMT3.getTime();

export const BINANCE_BASE_URL = "https://api.binance.com";

export type Timeframe = "1s" | "1m" | "15m" | "1h";
export const TIMEFRAMES: Timeframe[] = [
  // "1s",  // ⚠️ ~41M rows — omitted for now, uncomment when needed
  "1m",
  "15m",
  "1h",
];

export const BINANCE_LIMIT = 1000;

// ── Indicator parameters ──────────────────────────────────────────────────
export const MA_FAST_PERIOD = 20;
export const MA_SLOW_PERIOD = 99;
export const BB_PERIOD      = 20;
export const BB_MULT        = 1;
export const TRIX_PERIOD    = 19;
export const ST_ATR_PERIOD  = 10;
export const ST_FACTOR      = 7;

/**
 * Number of candles to average for relative volume calculation.
 * volAvg  = SMA(volume, VOLUME_AVG_PERIOD)
 * volRatio = volume / volAvg
 * A volRatio > 1 means current volume is above the recent average.
 * Example: volRatio = 2.5 means volume is 2.5x the recent average.
 */
export const VOLUME_AVG_PERIOD = 20;

export const FETCH_DELAY_MS = 250;

// ── Per-symbol trading parameters ───────────────────────────────────────
// Each symbol has its own thresholds tuned to its volatility profile.
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
  // Low volatility — needs permissive thresholds to generate signals
  BTCUSDT: { downCond2: 0.97, upCond2: 1.018, downSell: 1.009, upSell: 1.010 },
  ETHUSDT: { downCond2: 0.964, upCond2: 1.012, downSell: 1.007, upSell: 1.009 },
  BNBUSDT: { downCond2: 0.966, upCond2: 1.014, downSell: 1.007, upSell: 1.008 },
  // Medium volatility
  SOLUSDT: { downCond2: 0.97, upCond2: 1.020, downSell: 1.008, upSell: 1.008 },
  // High volatility — can afford stricter thresholds
  XRPUSDT: { downCond2: 0.964, upCond2: 1.030, downSell: 1.006, upSell: 1.007 },
  ADAUSDT: { downCond2: 0.953, upCond2: 1.027, downSell: 1.005, upSell: 1.006 },
};

/**
 * Returns the trading params for a given symbol.
 * Falls back to DEFAULT_SYMBOL_PARAMS if the symbol is not in SYMBOL_PARAMS.
 */
export function getSymbolParams(symbol: string): SymbolParams {
  return SYMBOL_PARAMS[symbol] ?? DEFAULT_SYMBOL_PARAMS;
}

/**
 * 0.00075 = 0.075% (Binance BNB discount tier)
 * 0.001   = 0.1%   (Binance standard tier)
 */
export const FEE_RATE = 0.00075;

// ── Simulator parameters ──────────────────────────────────────────────────
export const INITIAL_BALANCE_USDT = 10_000;
