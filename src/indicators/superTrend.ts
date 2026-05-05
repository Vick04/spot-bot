// ─────────────────────────────────────────────
// src/indicators/superTrend.ts
// SuperTrend indicator (ATR-based trailing stop)
// ─────────────────────────────────────────────

export interface SuperTrendResult {
  superTrend: number[]; // the actual SuperTrend line value
  direction:  number[]; // +1 = bullish (price above ST), -1 = bearish
}

/**
 * Calculate Average True Range (ATR).
 */
function calcATR(
  highs: number[],
  lows:  number[],
  closes: number[],
  period: number
): number[] {
  const tr     = new Array(closes.length).fill(NaN);
  const atr    = new Array(closes.length).fill(NaN);

  // True Range
  for (let i = 1; i < closes.length; i++) {
    const hl   = highs[i]  - lows[i];
    const hpc  = Math.abs(highs[i]  - closes[i - 1]);
    const lpc  = Math.abs(lows[i]   - closes[i - 1]);
    tr[i] = Math.max(hl, hpc, lpc);
  }
  tr[0] = highs[0] - lows[0];

  // Wilder's smoothed ATR (RMA)
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  atr[period - 1] = sum / period;
  for (let i = period; i < closes.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }

  return atr;
}

/**
 * SuperTrend indicator.
 * @param highs   Array of high prices
 * @param lows    Array of low prices
 * @param closes  Array of close prices
 * @param atrPeriod  ATR period (e.g. 10)
 * @param factor     Multiplier (e.g. 7)
 */
export function calcSuperTrend(
  highs:     number[],
  lows:      number[],
  closes:    number[],
  atrPeriod: number,
  factor:    number
): SuperTrendResult {
  const n   = closes.length;
  const atr = calcATR(highs, lows, closes, atrPeriod);

  const upperBasic = new Array(n).fill(NaN);
  const lowerBasic = new Array(n).fill(NaN);
  const finalUpper = new Array(n).fill(NaN);
  const finalLower = new Array(n).fill(NaN);
  const superTrend = new Array(n).fill(NaN);
  const direction  = new Array(n).fill(0);

  for (let i = atrPeriod - 1; i < n; i++) {
    const hl2 = (highs[i] + lows[i]) / 2;
    upperBasic[i] = hl2 + factor * atr[i];
    lowerBasic[i] = hl2 - factor * atr[i];
  }

  // Seed first valid values
  const seed = atrPeriod - 1;
  finalUpper[seed] = upperBasic[seed];
  finalLower[seed] = lowerBasic[seed];

  for (let i = seed + 1; i < n; i++) {
    // Final Upper Band
    finalUpper[i] =
      upperBasic[i] < finalUpper[i - 1] || closes[i - 1] > finalUpper[i - 1]
        ? upperBasic[i]
        : finalUpper[i - 1];

    // Final Lower Band
    finalLower[i] =
      lowerBasic[i] > finalLower[i - 1] || closes[i - 1] < finalLower[i - 1]
        ? lowerBasic[i]
        : finalLower[i - 1];

    // SuperTrend direction
    const prevST  = superTrend[i - 1];
    const prevDir = direction[i - 1];

    if (isNaN(prevST)) {
      // initialise
      superTrend[i] = closes[i] >= finalLower[i] ? finalLower[i] : finalUpper[i];
      direction[i]  = closes[i] >= finalLower[i] ? 1 : -1;
    } else if (prevST === finalUpper[i - 1]) {
      // was bearish
      if (closes[i] > finalUpper[i]) {
        superTrend[i] = finalLower[i];
        direction[i]  = 1;
      } else {
        superTrend[i] = finalUpper[i];
        direction[i]  = -1;
      }
    } else {
      // was bullish
      if (closes[i] < finalLower[i]) {
        superTrend[i] = finalUpper[i];
        direction[i]  = -1;
      } else {
        superTrend[i] = finalLower[i];
        direction[i]  = 1;
      }
    }
  }

  // Seed the first element
  superTrend[seed] =
    closes[seed] >= finalLower[seed] ? finalLower[seed] : finalUpper[seed];
  direction[seed] = closes[seed] >= finalLower[seed] ? 1 : -1;

  return { superTrend, direction };
}
