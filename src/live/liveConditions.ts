// ─────────────────────────────────────────────
// src/live/liveConditions.ts
// Entry / exit conditions for live trading.
// Mirrors simulator/conditions.ts exactly.
// ─────────────────────────────────────────────

import { LiveCandleContext, LiveProcessedCandle, OpenPosition } from "./types";

// ── Warm-up guard ─────────────────────────────────────────────────────────

function ready1h(c: LiveProcessedCandle): boolean {
  return c.bbUpper !== null;
}

// ── Entry ─────────────────────────────────────────────────────────────────

/**
 * BUY signal — 1h close > 1h bbUpper.
 */
export function liveCheckBuy(
  ctx:     LiveCandleContext,
  usdt:    number,
  inTrade: boolean
): boolean {
  if (inTrade || usdt <= 0) return false;
  if (!ready1h(ctx.candle1h)) return false;

  return ctx.candle1h.close > (ctx.candle1h.bbUpper as number);
}

// ── Exit ──────────────────────────────────────────────────────────────────

/**
 * SELL signal — 1h close drops below 1h bbUpper.
 */
export function liveCheckSell(
  ctx:       LiveCandleContext,
  _position: OpenPosition
): boolean {
  return (
    ctx.candle1h.bbUpper !== null &&
    ctx.candle1h.close < (ctx.candle1h.bbUpper as number)
  );
}
