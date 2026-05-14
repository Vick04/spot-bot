// ─────────────────────────────────────────────
// src/live/liveConditions.ts
// ─────────────────────────────────────────────

import { LiveCandleContext, OpenPosition } from "./types";
import { ActiveStrategy } from "../simulator/conditions";

/**
 * SELL signal — mirrors checkSellCondition from simulator/conditions.ts.
 * "down": close >= buyPrice * 1.009
 * "up":   close >= buyPrice * 1.01
 */
export function liveCheckSell(
  ctx:      LiveCandleContext,
  position: OpenPosition,
  strategy: ActiveStrategy
): boolean {
  const mult = strategy === "up" ? 1.01 : 1.009;
  return ctx.candle1m.close >= position.buyPrice * mult;
}
