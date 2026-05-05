// ─────────────────────────────────────────────
// src/config/constants.ts
// Central configuration for Bot7
// ─────────────────────────────────────────────

export const SYMBOL = "BTCUSDT";

export const GMT_OFFSET_MS = -3 * 60 * 60 * 1000;

export const START_DATE_GMT3 = new Date("2025-01-01T00:00:00-03:00");
export const END_DATE_GMT3   = new Date("2026-05-04T17:29:59-03:00");

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

export const FETCH_DELAY_MS = 250;

// ── Simulator parameters ──────────────────────────────────────────────────
export const INITIAL_BALANCE_USDT = 10_000;

/**
 * 0.00075 = 0.075% (Binance BNB discount tier)
 * 0.001   = 0.1%   (Binance standard tier)
 */
export const FEE_RATE = 0.00075;

// ── Sell exit conditions ──────────────────────────────────────────────────

/**
 * A) Take profit: sell when 1m close >= entry price × multiplier.
 * 1.1 = +10% — safety net, no trade is expected to reach this.
 */
export const SELL_TP_MULTIPLIER = 1.1;

/**
 * B) Trend exit: sell when 1h close drops below 1h bbUpper.
 * Primary exit condition — fires when the hourly trend breaks down.
 */
export const SELL_1H_TREND_ENABLED = true;
