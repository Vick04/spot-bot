// ─────────────────────────────────────────────
// src/live/liveConditions.ts
// Exit condition for live trading.
// Entry logic handled directly by evaluateBuySequence
// from simulator/conditions.ts in liveEngine.ts.
// ─────────────────────────────────────────────

import { LiveCandleContext, OpenPosition } from "./types";

// ── Exit ──────────────────────────────────────────────────────────────────

/**
 * SELL signal — mirrors checkSellCondition from simulator/conditions.ts:
 *   close >= buyPrice * 1.01  (+1%)
 */
export function liveCheckSell(
  ctx:      LiveCandleContext,
  position: OpenPosition
): boolean {
  return ctx.candle1h.close >= position.buyPrice * 1.01;
}
