// ─────────────────────────────────────────────
// src/config/constants.ts
// Central configuration for Bot7
// ─────────────────────────────────────────────

export const SYMBOL = "BTCUSDT";

export const GMT_OFFSET_MS = -3 * 60 * 60 * 1000;

export const START_DATE_GMT3 = new Date("2025-01-01T05:00:00-03:00");
export const END_DATE_GMT3   = new Date("2026-05-06T14:49:59-03:00");

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

// ── Simulator parameters ──────────────────────────────────────────────────
export const INITIAL_BALANCE_USDT = 10_000;

/**
 * 0.00075 = 0.075% (Binance BNB discount tier)
 * 0.001   = 0.1%   (Binance standard tier)
 */
export const FEE_RATE = 0.00075;
