// ─────────────────────────────────────────────
// src/live/liveConditions.ts
// Entry / exit conditions for live trading.
// Mirrors simulator/conditions.ts exactly.
// ─────────────────────────────────────────────

import { LiveCandleContext, LiveProcessedCandle, OpenPosition } from "./types";
import {
  SELL_TP_MULTIPLIER,
  SELL_1H_TREND_ENABLED,
} from "../config/constants";

// ── Warm-up guards ────────────────────────────────────────────────────────

function ready1h(c: LiveProcessedCandle): boolean {
  return c.bbUpper !== null && c.ma99 !== null;
}

function ready15m(c: LiveProcessedCandle): boolean {
  return c.bbUpper !== null && c.ma99 !== null;
}

function ready1m(c: LiveProcessedCandle): boolean {
  return (
    c.bbUpper !== null &&
    c.bbLower !== null &&
    c.ma20    !== null &&
    c.trix    !== null &&
    c.ma99    !== null
  );
}

// ── Entry ─────────────────────────────────────────────────────────────────

/**
 * BUY signal — indicator conditions across all three timeframes.
 *
 * 1h  : close > bbUpper  AND  bbUpper > ma99
 * 15m : close > bbUpper  AND  bbUpper > ma99
 * 1m  : close > bbUpper  AND  bbUpper > ma20  AND  ma20 > bbLower
 *        AND  bbLower > trix  AND  trix > ma99
 */
export function liveCheckBuy(
  ctx:     LiveCandleContext,
  usdt:    number,
  inTrade: boolean
): boolean {
  if (inTrade || usdt <= 0) return false;

  const { candle1h, candle15m, candle1m } = ctx;
  if (!ready1h(candle1h) || !ready15m(candle15m) || !ready1m(candle1m)) return false;

  const cond1h =
    candle1h.close > (candle1h.bbUpper as number);

  const cond15m =
    candle15m.close > (candle15m.bbUpper as number);

  const cond1m =
    candle1m.close               > (candle1m.bbUpper  as number) &&
    (candle1m.bbUpper as number) > (candle1m.ma20     as number) &&
    (candle1m.ma20    as number) > (candle1m.bbLower  as number);

  return cond1h && cond15m && cond1m;
}

// ── Exit ──────────────────────────────────────────────────────────────────

/**
 * SELL signal:
 *   A) Take profit : 1m close >= entry price × SELL_TP_MULTIPLIER (+10%)
 *   B) Trend exit  : 1h close < 1h bbUpper
 */
export function liveCheckSell(
  ctx:      LiveCandleContext,
  position: OpenPosition
): boolean {
  const takeProfit =
    ctx.candle1m.close >= position.buyPrice * SELL_TP_MULTIPLIER;

  const trendExit =
    SELL_1H_TREND_ENABLED &&
    ctx.candle1h.bbUpper !== null &&
    ctx.candle1h.close < (ctx.candle1h.bbUpper as number);

  return trendExit;
}
