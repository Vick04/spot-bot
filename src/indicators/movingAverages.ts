// ─────────────────────────────────────────────
// src/indicators/movingAverages.ts
// Simple and Exponential Moving Averages
// ─────────────────────────────────────────────

/**
 * Simple Moving Average over an array of values.
 * Returns NaN for positions where there's not enough data.
 */
export function calcSMA(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    result[i] = sum / period;
  }
  return result;
}

/**
 * Exponential Moving Average.
 * Uses SMA as seed for the first valid value.
 */
export function calcEMA(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);

  // seed with SMA of first `period` values
  let seedSum = 0;
  for (let i = 0; i < period; i++) seedSum += values[i];
  result[period - 1] = seedSum / period;

  for (let i = period; i < values.length; i++) {
    result[i] = values[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}
