// ─────────────────────────────────────────────
// src/simulator/conditions.ts
// ─────────────────────────────────────────────

import { ProcessedCandle } from "../processors/candleProcessor";

// ── Warm-up guard ─────────────────────────────────────────────────────────

function hasIndicators(c: ProcessedCandle): boolean {
  return c.ma20 !== null && c.ma99 !== null;
}

// ── Types ─────────────────────────────────────────────────────────────────

export type ActiveStrategy = "down" | "up" | null;

interface StrategyState {
  cond1Met: boolean;
  cond2Met: boolean;
}

export interface BuySequenceState {
  down:     StrategyState;
  up:       StrategyState;
  upStreak: number; // consecutive up trades — resets to 0 on any down trade
}

export function initialBuyState(): BuySequenceState {
  return {
    down:     { cond1Met: false, cond2Met: false },
    up:       { cond1Met: false, cond2Met: false },
    upStreak: 0,
  };
}

/**
 * Maximum consecutive "up" trades before up is disabled.
 * Resets to 0 when a "down" trade executes.
 */
export const UP_MAX_STREAK = 3;

/**
 * Two fully independent strategies evaluated simultaneously.
 *
 * STRATEGY "down" (no limits):
 *   Cond1: ma20 < ma99 AND bbLower < ma99 AND bbUpper < ma99
 *   Cond2: close < ma99 * 0.97
 *   Sell:  close >= buyPrice * 1.009
 *
 * STRATEGY "up" (disabled when upStreak >= UP_MAX_STREAK):
 *   Cond1: ma20 > ma99 AND bbUpper > ma99
 *   Cond2: close > ma99 * 1.02
 *   Sell:  close >= buyPrice * 1.01
 */
export function evaluateBuySequence(
  prevCandle:  ProcessedCandle,
  state:       BuySequenceState,
  usdtBalance: number,
  inTrade:     boolean
): { state: BuySequenceState; signal: boolean; activeStrategy: ActiveStrategy } {
  const noSignal = { state, signal: false, activeStrategy: null as ActiveStrategy };
  if (!hasIndicators(prevCandle)) return noSignal;

  const close   = prevCandle.close;
  const bbLower = prevCandle.bbLower as number;
  const bbUpper = prevCandle.bbUpper as number;
  const ma20    = prevCandle.ma20    as number;
  const ma99    = prevCandle.ma99    as number;

  const down = { ...state.down };
  const up   = { ...state.up };

  // ── Strategy "down" — no limits ───────────────────────────────────────
  if (!down.cond1Met) {
    if (ma20 < ma99 && bbLower < ma99 && bbUpper < ma99) down.cond1Met = true;
  }
  if (down.cond1Met && !down.cond2Met) {
    if (close < ma99 * 0.97) down.cond2Met = true;
  }

  // ── Strategy "up" — disabled when upStreak >= UP_MAX_STREAK ──────────
  if (state.upStreak < UP_MAX_STREAK) {
    if (!up.cond1Met) {
      if (ma20 > ma99 && bbUpper > ma99) up.cond1Met = true;
    }
    if (up.cond1Met && !up.cond2Met) {
      if (close > ma99 * 1.02) up.cond2Met = true;
    }
  }

  const newState: BuySequenceState = { down, up, upStreak: state.upStreak };

  if (!inTrade && usdtBalance > 0) {
    if (down.cond2Met) {
      return { state: newState, signal: true, activeStrategy: "down" };
    }
    if (up.cond2Met) {
      return { state: newState, signal: true, activeStrategy: "up" };
    }
  }

  return { state: newState, signal: false, activeStrategy: null };
}

// ── Exit condition ────────────────────────────────────────────────────────

/**
 * SELL signal:
 *   "down": close >= buyPrice * 1.009
 *   "up":   close >= buyPrice * 1.01
 */
export function checkSellCondition(
  prevCandle: ProcessedCandle,
  buyPrice:   number,
  strategy:   ActiveStrategy
): boolean {
  const mult = strategy === "up" ? 1.01 : 1.009;
  return prevCandle.close >= buyPrice * mult;
}
