// ─────────────────────────────────────────────
// src/live/liveConditions.ts
// Exit condition for live trading.
// Entry logic handled directly by evaluateBuySequence
// from simulator/conditions.ts in liveEngine.ts.
// ─────────────────────────────────────────────

import { LiveCandleContext, LiveProcessedCandle, OpenPosition } from "./types";

// ── Exit ──────────────────────────────────────────────────────────────────

/**
 * SELL signal — mirrors checkSellCondition from simulator/conditions.ts:
 *   A) Take profit : close >= buyPrice * 1.03  (+3%)
 *   B) Stop loss   : close <= buyPrice * 0.93  (-7%)
 */
export function liveCheckSell(
  ctx:      LiveCandleContext,
  position: OpenPosition
): boolean {
  const close = ctx.candle1h.close;
  return (
    close >= position.buyPrice * 1.03 ||
    close <= position.buyPrice * 0.93
  );
}
