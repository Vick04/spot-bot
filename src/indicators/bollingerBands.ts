// ─────────────────────────────────────────────
// src/indicators/bollingerBands.ts
// Bollinger Bands using SMA + StdDev
// ─────────────────────────────────────────────

import { calcSMA } from "./movingAverages";

export interface BollingerResult {
  upper: number[];
  lower: number[];
  mid:   number[];
}

/**
 * Bollinger Bands.
 * @param closes  Array of closing prices
 * @param period  Lookback period (default 20)
 * @param mult    Standard deviation multiplier (default 1)
 */
export function calcBollingerBands(
  closes: number[],
  period: number,
  mult: number
): BollingerResult {
  const mid   = calcSMA(closes, period);
  const upper = new Array(closes.length).fill(NaN);
  const lower = new Array(closes.length).fill(NaN);

  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean  = mid[i];
    const variance =
      slice.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / period;
    const stddev = Math.sqrt(variance);
    upper[i] = mean + mult * stddev;
    lower[i] = mean - mult * stddev;
  }

  return { upper, lower, mid };
}
