// ─────────────────────────────────────────────
// src/simulator/conditions.ts
// Entry and exit signal logic.
// ─────────────────────────────────────────────

import { CandleContext, BuyOrder } from "./types";
import { ProcessedCandle }         from "../processors/candleProcessor";

// ── Warm-up guard ─────────────────────────────────────────────────────────

function hasIndicators1h(c: ProcessedCandle): boolean {
  return c.bbUpper !== null;
}

// ── Entry condition ───────────────────────────────────────────────────────

/**
 * BUY signal — 1h close > 1h bbUpper.
 */
export function checkBuyCondition(
  ctx:         CandleContext,
  usdtBalance: number,
  inTrade:     boolean
): boolean {
  if (inTrade || usdtBalance <= 0) return false;
  if (!hasIndicators1h(ctx.candle1h)) return false;

  return ctx.candle1h.close > (ctx.candle1h.bbUpper as number);
}

// ── Exit condition ────────────────────────────────────────────────────────

/**
 * SELL signal — 1h close drops below 1h bbUpper.
 */
export function checkSellCondition(
  _currentPrice: number,
  _openBuy:      BuyOrder,
  candle1h:      ProcessedCandle
): boolean {
  return (
    candle1h.bbUpper !== null &&
    candle1h.close < (candle1h.bbUpper as number)
  );
}
