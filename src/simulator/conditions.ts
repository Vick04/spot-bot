// ─────────────────────────────────────────────
// src/simulator/conditions.ts
// ─────────────────────────────────────────────

import { ProcessedCandle } from "../processors/candleProcessor";

// ── Warm-up guard ─────────────────────────────────────────────────────────

function hasIndicators(c: ProcessedCandle): boolean {
  return c.ma20 !== null && c.ma99 !== null;
}

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
 * Cond2: close < ma99 * 0.98  (price still >2% below ma99)
 *        Only evaluated after cond1 is met.
 */
export function evaluateBuySequence(
  prevCandle:  ProcessedCandle,
  state:       BuySequenceState,
  usdtBalance: number,
  inTrade:     boolean
): { state: BuySequenceState; signal: boolean } {
  if (!hasIndicators(prevCandle)) return { state, signal: false };

  const close   = prevCandle.close;
  const bbLower = prevCandle.bbLower as number;
  const bbUpper = prevCandle.bbUpper as number;
  const ma20    = prevCandle.ma20    as number;
  const ma99    = prevCandle.ma99    as number;

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
    if (close < ma99 * 0.98) {
      cond2Met = true;
    }
  }

  const newState = { cond1Met, cond2Met };

  if (cond2Met && !inTrade && usdtBalance > 0) {
    return { state: newState, signal: true };
  }

  return { state: newState, signal: false };
}

// ── Exit condition ────────────────────────────────────────────────────────

/**
 * SELL signal: close >= buyPrice * 1.01  (+1%)
 */
export function checkSellCondition(
  prevCandle: ProcessedCandle,
  buyPrice:   number
): boolean {
  return prevCandle.close >= buyPrice * 1.01;
}
