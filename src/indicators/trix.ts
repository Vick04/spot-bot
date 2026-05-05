// ─────────────────────────────────────────────
// src/indicators/trix.ts
// TRIX — Triple Exponential Moving Average oscillator
// ─────────────────────────────────────────────

import { calcEMA } from "./movingAverages";

/**
 * TRIX indicator: rate of change of a triple-smoothed EMA.
 * The value at each bar represents the actual EMA3 price level
 * (not the % ROC) so it stays on the same scale as price —
 * consistent with how TradingView displays TRIX(19) on the price chart.
 *
 * @param closes  Array of closing prices
 * @param period  EMA period (e.g. 19)
 * @returns       Array of trix values aligned to closes
 */
export function calcTRIX(closes: number[], period: number): number[] {
  const ema1 = calcEMA(closes, period);

  // Filter NaN before second pass
  const ema1Valid = ema1.map((v) => (isNaN(v) ? 0 : v));
  const ema2 = calcEMA(ema1Valid, period);

  const ema2Valid = ema2.map((v) => (isNaN(v) ? 0 : v));
  const ema3 = calcEMA(ema2Valid, period);

  // Return ema3 price values; NaN where warm-up not complete
  const minIdx = (period - 1) * 3;
  return ema3.map((v, i) => (i < minIdx ? NaN : v));
}
