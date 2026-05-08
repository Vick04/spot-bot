// ─────────────────────────────────────────────
// src/simulator/conditions.ts
// ─────────────────────────────────────────────

import { ProcessedCandle } from "../processors/candleProcessor";

// ── Warm-up guard ─────────────────────────────────────────────────────────

function hasIndicators(c: ProcessedCandle): boolean {
  return c.ma20 !== null && c.ma99 !== null;
}

// ── Volume filter threshold ───────────────────────────────────────────────

/**
 * Minimum volRatio required for cond2 to fire.
 * volRatio = volume / SMA(volume, 20)
 * Example: 1.5 means current candle volume must be at least 1.5x the 20-period average.
 * Set to 0 to disable the volume filter.
 */
export const COND2_MIN_VOL_RATIO = 1.1; // disabled by default — set to e.g. 1.5 to enable

// ── Buy sequence state ────────────────────────────────────────────────────

export interface BuySequenceState {
  cond1Met: boolean;
  cond2Met: boolean;
}

export function initialBuyState(): BuySequenceState {
  return { cond1Met: false, cond2Met: false };
}

/**
 * Two-step buy sequence evaluated on the closed candle.
 *
 * Cond1: ma20 < ma99 AND bbLower < ma99 AND bbUpper < ma99
 *        Once true, never re-evaluated.
 *
 * Cond2: close > ma20
 *        AND volRatio >= COND2_MIN_VOL_RATIO (if > 0)
 *        Only evaluated after cond1 is met.
 *
 * Signal fires when both are true. Caller resets state after buy/sell.
 */
export function evaluateBuySequence(
  prevCandle:  ProcessedCandle,
  state:       BuySequenceState,
  usdtBalance: number,
  inTrade:     boolean
): { state: BuySequenceState; signal: boolean } {
  if (!hasIndicators(prevCandle)) return { state, signal: false };

  const close    = prevCandle.close;
  const bbLower  = prevCandle.bbLower as number;
  const bbUpper  = prevCandle.bbUpper as number;
  const ma20     = prevCandle.ma20    as number;
  const ma99     = prevCandle.ma99    as number;
  const volRatio = prevCandle.volRatio;

  let { cond1Met, cond2Met } = state;

  // ── Cond1 — evaluated only when not yet met ────────────────────────────
  if (!cond1Met) {
    if (ma20 < ma99 && bbLower < ma99 && bbUpper < ma99) {
      cond1Met = true;
    }
    return { state: { cond1Met, cond2Met }, signal: false };
  }

  // ── Cond2 — evaluated only after cond1, only once ─────────────────────
  if (!cond2Met) {
    const volumeOk =
      COND2_MIN_VOL_RATIO <= 0 ||
      (volRatio !== null && volRatio >= COND2_MIN_VOL_RATIO);

    if (volumeOk) {
      cond2Met = true;
    }
  }

  const newState = { cond1Met, cond2Met };

  // Signal fires when both met and able to trade
  if (cond2Met && !inTrade && usdtBalance > 0) {
    return { state: newState, signal: true };
  }

  return { state: newState, signal: false };
}

// ── Exit condition ────────────────────────────────────────────────────────

/**
 * SELL signal:
 *   A) Take profit : close >= buyPrice * 1.06  (+6%)
 *   B) Stop loss   : close <= buyPrice * 0.93  (-7%)
 */
export function checkSellCondition(
  prevCandle: ProcessedCandle,
  buyPrice:   number
): boolean {
  return (
    prevCandle.close >= buyPrice * 1.03 ||
    prevCandle.close <= buyPrice * 0.93
  );
}
